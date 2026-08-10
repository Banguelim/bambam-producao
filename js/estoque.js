/* ==============================================================
   ENTRADA NO ESTOQUE — BAMBAM PRODUÇÃO
   Fluxo: Corte → Designação → Retorno (2ª chegada) → Entrada no Estoque
   ============================================================== */

const db = firebase.firestore();
const TAMANHOS = ['RN', 'P', 'M', 'G', 'GG'];

// Estado atual
let corteAtual = null;
let notasDoCorte = [];
let estoqueDoCorte = [];   // documentos de estoque já registrados desse corte
let pool = {};             // { tam: { cor: qtd_aguardando } }
let selecao = {};          // { tam: { cor: qtd_a_entrar } }

// ==================================================================
// AUTH — exige login
// ==================================================================
firebase.auth().onAuthStateChanged((user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  init();
});

async function init() {
  document.getElementById('data-entrada').value = hoje();
  await carregarLotesAguardando();
}

function hoje() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ==================================================================
// TELA 1 — lista lotes com peças aguardando entrada no estoque
// ==================================================================
async function carregarLotesAguardando() {
  const listaEl = document.getElementById('lista-lotes');
  listaEl.innerHTML = '<div class="loading">Carregando...</div>';

  try {
    // Puxa todos os cortes que não estão finalizados no estoque
    const cortesSnap = await db.collection('producao_dados').doc('op')
      .collection('cortes').get();

    const lotes = [];

    for (const cDoc of cortesSnap.docs) {
      const corte = { id: cDoc.id, ...cDoc.data() };

      // Todas as notas desse corte
      const notasSnap = await db.collection('producao_dados').doc('op')
        .collection('notas').where('corte_id', '==', corte.id).get();

      // Todos os movimentos de estoque desse corte
      const estSnap = await db.collection('producao_dados').doc('op')
        .collection('estoque').where('corte_id', '==', corte.id).get();

      const notas = notasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ests = estSnap.docs.map(d => d.data());

      const { totalAguard, totalCorAguard } = calcularPoolLote(notas, ests);

      if (totalAguard > 0) {
        lotes.push({
          corte,
          totalAguard,
          totalCores: totalCorAguard,
        });
      }
    }

    if (lotes.length === 0) {
      listaEl.innerHTML = '<div class="vazio">Nenhum lote aguardando entrada no estoque.</div>';
      return;
    }

    listaEl.innerHTML = '';
    lotes.sort((a, b) => (a.corte.lote || '').localeCompare(b.corte.lote || ''));
    lotes.forEach(({ corte, totalAguard }) => {
      const chip = document.createElement('div');
      chip.className = 'chip-lote';
      chip.innerHTML = `
        <span class="bolinha"></span>
        <span>${corte.lote || '?'}/${corte.ref || '?'}</span>
        <span class="qtd">· ${totalAguard} pç</span>
      `;
      chip.onclick = () => abrirLote(corte.id);
      listaEl.appendChild(chip);
    });
  } catch (err) {
    console.error(err);
    listaEl.innerHTML = '<div class="vazio">Erro ao carregar lotes: ' + err.message + '</div>';
  }
}

// ==================================================================
// CÁLCULO DO POOL — o que está aguardando arremate por cor+tam
// ==================================================================
// A 2ª chegada nas notas hoje é registrada só por tamanho.
// Distribuímos proporcionalmente pelas cores designadas em cada nota,
// depois agregamos todas as notas do corte, e subtraímos o que já
// entrou em estoque.
function calcularPoolLote(notas, estoques) {
  // acumulador { tam: { cor: qtd } }
  const chegado = {};
  TAMANHOS.forEach(t => chegado[t] = {});

  notas.forEach(nota => {
    // itens designados por (cor, tam) nessa nota
    const desigTam = {};  // { tam: { cor: qtd_designada } }
    TAMANHOS.forEach(t => desigTam[t] = {});

    (nota.itens || []).forEach(it => {
      if (!TAMANHOS.includes(it.tam)) return;
      desigTam[it.tam][it.cor] = (desigTam[it.tam][it.cor] || 0) + (it.qtd || 0);
    });

    // Distribui a chegada_2 por tam proporcional ao que foi designado por cor
    TAMANHOS.forEach(t => {
      const cheg = (nota.chegada_2 && nota.chegada_2[t]) || 0;
      if (cheg <= 0) return;
      const cores = desigTam[t];
      const totalDesig = Object.values(cores).reduce((a, b) => a + b, 0);
      if (totalDesig <= 0) return;

      // Distribuição proporcional com correção de arredondamento
      const listaCores = Object.keys(cores);
      let sobra = cheg;
      listaCores.forEach((cor, i) => {
        let q;
        if (i === listaCores.length - 1) {
          q = sobra; // última cor recebe o resto (garante soma exata)
        } else {
          q = Math.round(cheg * cores[cor] / totalDesig);
          if (q > sobra) q = sobra;
        }
        chegado[t][cor] = (chegado[t][cor] || 0) + q;
        sobra -= q;
      });
    });
  });

  // Subtrai o que já entrou em estoque
  estoques.forEach(est => {
    (est.itens || []).forEach(it => {
      if (!TAMANHOS.includes(it.tam)) return;
      chegado[it.tam][it.cor] = (chegado[it.tam][it.cor] || 0) - (it.qtd || 0);
    });
  });

  // Limpa zeros/negativos e conta totais
  let totalAguard = 0;
  const totalCorAguard = new Set();
  TAMANHOS.forEach(t => {
    Object.keys(chegado[t]).forEach(cor => {
      if (chegado[t][cor] <= 0) {
        delete chegado[t][cor];
      } else {
        totalAguard += chegado[t][cor];
        totalCorAguard.add(cor);
      }
    });
  });

  return { pool: chegado, totalAguard, totalCorAguard: totalCorAguard.size };
}

// ==================================================================
// TELA 2 — abre painel de entrada de um lote
// ==================================================================
async function abrirLote(corteId) {
  document.getElementById('tela-lotes').style.display = 'none';
  document.getElementById('tela-painel').style.display = 'block';
  document.getElementById('grade').innerHTML = '<div class="loading">Carregando lote...</div>';

  const cDoc = await db.collection('producao_dados').doc('op')
    .collection('cortes').doc(corteId).get();
  corteAtual = { id: cDoc.id, ...cDoc.data() };

  const notasSnap = await db.collection('producao_dados').doc('op')
    .collection('notas').where('corte_id', '==', corteId).get();
  notasDoCorte = notasSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const estSnap = await db.collection('producao_dados').doc('op')
    .collection('estoque').where('corte_id', '==', corteId).get();
  estoqueDoCorte = estSnap.docs.map(d => d.data());

  const { pool: poolCalc, totalAguard } = calcularPoolLote(notasDoCorte, estoqueDoCorte);
  pool = poolCalc;
  selecao = {};
  TAMANHOS.forEach(t => selecao[t] = {});

  document.getElementById('info-lote').textContent =
    (corteAtual.lote || '?') + '/' + (corteAtual.ref || '?');
  document.getElementById('info-ref').textContent =
    'Corte de ' + formatarData(corteAtual.data);
  document.getElementById('total-aguardando').textContent = totalAguard;

  renderizarGrade();
  atualizarTotais();
}

function formatarData(d) {
  if (!d) return '—';
  if (typeof d === 'string') return d.slice(0, 10).split('-').reverse().join('/');
  if (d.toDate) return d.toDate().toLocaleDateString('pt-BR');
  return '—';
}

// ==================================================================
// Renderiza as 5 colunas
// ==================================================================
function renderizarGrade() {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';

  TAMANHOS.forEach(tam => {
    const col = document.createElement('div');
    col.className = 'col-tam';
    col.dataset.tam = tam;

    // Cabeçalho da coluna
    const cores = Object.keys(pool[tam] || {}).sort();
    const totalTam = cores.reduce((a, c) => a + pool[tam][c], 0);

    col.innerHTML = `
      <div class="cab">
        <input type="checkbox" class="check-all" ${cores.length ? '' : 'disabled'}
               onchange="marcarTodosDaColuna('${tam}', this.checked)">
        ${tam}
      </div>
      <div class="lista" id="lista-${tam}"></div>
      <div class="rodape">
        <div class="linha"><span>aguard</span><span class="num-aguard" id="aguard-${tam}">${totalTam}</span></div>
        <div class="linha"><span>entra</span><span class="num-entra" id="entra-${tam}">0</span></div>
        <div class="linha"><span>resta</span><span class="num-resta" id="resta-${tam}">${totalTam}</span></div>
      </div>
    `;
    grade.appendChild(col);

    const lista = col.querySelector('.lista');
    if (cores.length === 0) {
      lista.innerHTML = '<div style="color:#9ca3af;font-size:11px;text-align:center;padding:20px 4px">—</div>';
    } else {
      cores.forEach(cor => {
        const max = pool[tam][cor];
        const item = document.createElement('div');
        item.className = 'item-cor';
        item.dataset.tam = tam;
        item.dataset.cor = cor;
        item.innerHTML = `
          <input type="checkbox" onchange="marcar('${tam}','${cor}',this.checked)">
          <span class="cor" title="${cor}">${cor}</span>
          <input type="number" class="qtd" value="${max}" min="0" max="${max}"
                 onfocus="this.select()"
                 oninput="editarQtd('${tam}','${cor}',this.value)">
          <span class="max">/${max}</span>
        `;
        lista.appendChild(item);
      });
    }
  });
}

// ==================================================================
// Marcar / desmarcar / editar
// ==================================================================
function marcar(tam, cor, checked) {
  const item = document.querySelector(`.item-cor[data-tam="${tam}"][data-cor="${cor}"]`);
  const inpQtd = item.querySelector('.qtd');
  const max = pool[tam][cor];

  if (checked) {
    let q = parseInt(inpQtd.value) || max;
    if (q > max) q = max;
    if (q < 1) q = max;
    inpQtd.value = q;
    selecao[tam][cor] = q;
    item.classList.add('marcado');
  } else {
    delete selecao[tam][cor];
    item.classList.remove('marcado');
  }
  atualizarTotais();
  atualizarCheckAll(tam);
}

function editarQtd(tam, cor, valor) {
  const item = document.querySelector(`.item-cor[data-tam="${tam}"][data-cor="${cor}"]`);
  const checkbox = item.querySelector('input[type=checkbox]');
  const max = pool[tam][cor];
  let q = parseInt(valor) || 0;
  if (q > max) q = max;
  if (q < 0) q = 0;

  if (q > 0) {
    selecao[tam][cor] = q;
    checkbox.checked = true;
    item.classList.add('marcado');
  } else {
    delete selecao[tam][cor];
    checkbox.checked = false;
    item.classList.remove('marcado');
  }
  atualizarTotais();
  atualizarCheckAll(tam);
}

function marcarTodosDaColuna(tam, checked) {
  const cores = Object.keys(pool[tam] || {});
  cores.forEach(cor => {
    const item = document.querySelector(`.item-cor[data-tam="${tam}"][data-cor="${cor}"]`);
    if (!item) return;
    const cb = item.querySelector('input[type=checkbox]');
    cb.checked = checked;
    marcar(tam, cor, checked);
  });
}

function atualizarCheckAll(tam) {
  const cores = Object.keys(pool[tam] || {});
  if (cores.length === 0) return;
  const todosMarcados = cores.every(c => (selecao[tam][c] || 0) === pool[tam][c]);
  const col = document.querySelector(`.col-tam[data-tam="${tam}"]`);
  const chk = col.querySelector('.check-all');
  chk.checked = todosMarcados;
  chk.indeterminate = !todosMarcados && cores.some(c => (selecao[tam][c] || 0) > 0);
}

function atualizarTotais() {
  let totalGeral = 0;
  const coresGerais = new Set();

  TAMANHOS.forEach(tam => {
    const cores = Object.keys(pool[tam] || {});
    const aguard = cores.reduce((a, c) => a + pool[tam][c], 0);
    const entra = cores.reduce((a, c) => a + (selecao[tam][c] || 0), 0);
    const resta = aguard - entra;

    document.getElementById('aguard-' + tam).textContent = aguard;
    document.getElementById('entra-' + tam).textContent = entra;
    document.getElementById('resta-' + tam).textContent = resta;

    totalGeral += entra;
    cores.forEach(c => { if ((selecao[tam][c] || 0) > 0) coresGerais.add(c); });
  });

  document.getElementById('total-entra').textContent = totalGeral;
  document.getElementById('total-refs').textContent = coresGerais.size;
  document.getElementById('btn-confirmar').disabled = totalGeral === 0;
}

// ==================================================================
// Confirma a entrada no estoque
// ==================================================================
async function confirmarEntrada() {
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    // Monta lista de itens selecionados
    const itens = [];
    let totalPecas = 0;
    TAMANHOS.forEach(tam => {
      Object.keys(selecao[tam] || {}).forEach(cor => {
        const q = selecao[tam][cor];
        if (q > 0) {
          itens.push({ cor, tam, qtd: q });
          totalPecas += q;
        }
      });
    });

    if (itens.length === 0) {
      toast('Nenhuma peça selecionada.', 'erro');
      btn.disabled = false;
      btn.textContent = '✓ Confirmar entrada no estoque';
      return;
    }

    const doc = {
      corte_id: corteAtual.id,
      lote: corteAtual.lote || '',
      ref: corteAtual.ref || '',
      data: document.getElementById('data-entrada').value,
      itens,
      total_pecas: totalPecas,
      criado_em: firebase.firestore.FieldValue.serverTimestamp(),
      criado_por: firebase.auth().currentUser?.email || '',
    };

    await db.collection('producao_dados').doc('op')
      .collection('estoque').add(doc);

    toast(`${totalPecas} peças entraram no estoque ✓`, 'ok');
    setTimeout(voltarLista, 900);
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar: ' + err.message, 'erro');
    btn.disabled = false;
    btn.textContent = '✓ Confirmar entrada no estoque';
  }
}

function voltarLista() {
  document.getElementById('tela-painel').style.display = 'none';
  document.getElementById('tela-lotes').style.display = 'block';
  corteAtual = null;
  notasDoCorte = [];
  estoqueDoCorte = [];
  pool = {};
  selecao = {};
  document.getElementById('btn-confirmar').disabled = true;
  document.getElementById('btn-confirmar').textContent = '✓ Confirmar entrada no estoque';
  carregarLotesAguardando();
}

// ==================================================================
// Toast simples (se base.css não trouxer, funciona igual)
// ==================================================================
function toast(msg, tipo = 'ok') {
  let t = document.getElementById('toast-flash');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast-flash';
    t.style.cssText = `
      position:fixed;top:22%;left:50%;transform:translateX(-50%);
      padding:14px 22px;border-radius:8px;font-size:18px;font-weight:700;
      box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:9999;
      display:flex;align-items:center;gap:10px;color:#fff
    `;
    document.body.appendChild(t);
  }
  t.style.background = tipo === 'ok' ? '#16a34a' : '#dc2626';
  t.innerHTML = (tipo === 'ok' ? '✓ ' : '⚠ ') + msg;
  t.style.display = 'flex';
  clearTimeout(t._to);
  t._to = setTimeout(() => t.style.display = 'none', 2200);
}
