// Novo Corte — cria UM corte separado por referência.
// Se você aplica em mais de uma ref, salva vários cortes numa transação atômica
// (batch): ou todos entram, ou nenhum. Assim cada ref pode ir pra costureira
// diferente sem misturar destinos.

let refsExtras = []; // refs adicionais além da principal

async function init() {
  await protegerRota();
  document.getElementById('data').value = hojeISO();

  // Popular datalist de refs
  try {
    const refs = await listarRefs();
    const dl = document.getElementById('refs-list');
    refs.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.ref;
      dl.appendChild(opt);
    });
  } catch (e) { console.warn('Refs não carregadas:', e); }

  // Popular datalist de cores: pré-definidas + salvas no Firestore
  try {
    const dl = document.getElementById('cores-list');
    const jaTem = new Set();
    dl.querySelectorAll('option').forEach(o => jaTem.add(o.value.toUpperCase()));
    const salvas = await listarCoresSalvas();
    salvas.forEach(nome => {
      if (!jaTem.has(nome.toUpperCase())) {
        const opt = document.createElement('option');
        opt.value = nome;
        dl.appendChild(opt);
        jaTem.add(nome.toUpperCase());
      }
    });
  } catch (e) { console.warn('Cores não carregadas:', e); }

  // Construir 5 colunas
  const grade = document.getElementById('grade');
  TAMS.forEach(tam => grade.appendChild(buildCol(tam)));

  // Handlers
  document.getElementById('aplic-btn').addEventListener('click', adicionarRefExtra);
  document.getElementById('btn-salvar').addEventListener('click', salvarCorteBtn);

  recalc();
}

function buildCol(tam) {
  const col = document.createElement('div');
  col.className = 'col';
  col.dataset.tam = tam;
  col.innerHTML = `
    <div class="col-h">
      <span>${tam} <span class="check">✓</span></span>
    </div>
    <div class="entradas"></div>
    <div class="nova-entrada">
      <div class="cor-field">
        <input list="cores-list" class="cor-input" placeholder="cor">
        <span class="arrow">▾</span>
      </div>
      <input type="number" class="qty-input" placeholder="qtd">
    </div>
    <button class="confirmar-btn">confirmar ${tam}</button>
    <div class="subtot-col">
      <div class="cell"><span>conf</span><b data-conf>0</b></div>
      <div class="cell pend"><span>pend</span><b data-pend>0</b></div>
      <div class="cell"><span>total</span><b data-total>0</b></div>
    </div>
  `;

  const corInput = col.querySelector('.cor-input');
  const qtyInput = col.querySelector('.qty-input');
  corInput.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === 'Tab') && corInput.value.trim()) {
      e.preventDefault(); qtyInput.focus();
    }
  });
  qtyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); salvarEntradaNovaEmCol(col); }
  });

  col.querySelector('.confirmar-btn').addEventListener('click', () => {
    if (col.classList.contains('desabilitada')) {
      col.classList.remove('desabilitada');
      col.querySelector('.entradas').style.opacity = '1';
      col.querySelector('.cor-input').disabled = false;
      col.querySelector('.qty-input').disabled = false;
    } else {
      col.classList.add('desabilitada');
      col.querySelector('.entradas').style.opacity = '0.3';
      col.querySelector('.cor-input').disabled = true;
      col.querySelector('.qty-input').disabled = true;
    }
    atualizarBtnCol(col);
    recalc();
  });

  atualizarBtnCol(col);
  return col;
}

function salvarEntradaNovaEmCol(col) {
  const corInput = col.querySelector('.cor-input');
  const qtyInput = col.querySelector('.qty-input');
  const cor = corInput.value.trim().toUpperCase();
  const q = parseInt(qtyInput.value);
  if (!cor || !q) return;

  const corFinal = verificarCorNova(cor);
  if (!corFinal) {
    corInput.focus();
    corInput.select();
    return;
  }

  document.querySelectorAll('.col').forEach(outra => {
    if (outra.classList.contains('desabilitada')) return;
    addEntrada(outra, corFinal, q);
    atualizarBtnCol(outra);
  });

  corInput.value = '';
  qtyInput.value = '';
  corInput.focus();
  recalc();
}

function verificarCorNova(cor) {
  const dl = document.getElementById('cores-list');
  const existentes = [...dl.querySelectorAll('option')].map(o => o.value.toUpperCase());
  const corUp = cor.toUpperCase();
  if (existentes.includes(corUp)) return corUp;
  const parecidas = existentes.filter(e => distancia(corUp, e) <= 2).sort((a, b) => distancia(corUp, a) - distancia(corUp, b));
  if (parecidas.length > 0) {
    const sug = parecidas[0];
    const msg = `A cor "${corUp}" não existe ainda.\n\n` +
                `Você quis dizer "${sug}"?\n\n` +
                `[OK] usa "${sug}"\n` +
                `[Cancelar] volta pra corrigir (ou cadastrar como nova)`;
    if (confirm(msg)) return sug;
    if (confirm(`Cadastrar "${corUp}" como cor nova?\n\n[OK] cadastra\n[Cancelar] volta pra corrigir`)) return corUp;
    return null;
  }
  if (confirm(`Cor "${corUp}" não existe ainda. Cadastrar como cor nova?`)) return corUp;
  return null;
}

function distancia(a, b) {
  const dp = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function addEntrada(col, cor, q) {
  const e = document.createElement('div');
  e.className = 'cor-linha';
  e.innerHTML = `
    <span class="cor" title="${cor}">${abrevCor(cor)}</span>
    <span class="q" contenteditable="true" spellcheck="false" inputmode="numeric" 
          style="min-width:28px;text-align:right;cursor:text;border-bottom:1px dashed var(--border-accent)">${q}</span>
    <button class="x">×</button>
  `;
  const qEl = e.querySelector('.q');
  qEl.addEventListener('focus', () => {
    const range = document.createRange();
    range.selectNodeContents(qEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  qEl.addEventListener('input', () => {
    sanitizarQtd(qEl);
    atualizarBtnCol(col);
    recalc();
  });
  qEl.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); qEl.blur(); }
  });
  e.querySelector('.x').addEventListener('click', () => {
    e.remove();
    atualizarBtnCol(col);
    recalc();
  });
  col.querySelector('.entradas').appendChild(e);
}

function atualizarBtnCol(col) {
  const btn = col.querySelector('.confirmar-btn');
  const tam = col.dataset.tam;
  const temEntradas = col.querySelectorAll('.cor-linha').length > 0;
  const desabilitada = col.classList.contains('desabilitada');
  if (desabilitada) {
    btn.textContent = `habilitar ${tam}`;
    btn.disabled = false;
    btn.style.opacity = '0.6';
  } else if (temEntradas) {
    btn.textContent = `desabilitar ${tam}`;
    btn.disabled = false;
    btn.style.opacity = '1';
  } else {
    btn.textContent = `desabilitar ${tam}`;
    btn.disabled = true;
    btn.style.opacity = '0.4';
  }
}

function adicionarRefExtra() {
  const ref = prompt('Qual outra ref? (ex: 205MT)\n\nVai criar um corte separado com essa ref, com as mesmas cores/quantidades do principal.');
  if (!ref) return;
  const r = ref.trim().toUpperCase();
  if (!r) return;
  refsExtras.push(r);
  redesenharRefsExtras();
  recalc();
}

function redesenharRefsExtras() {
  const el = document.getElementById('refs-extras');
  el.innerHTML = '';
  refsExtras.forEach((r, i) => {
    const chip = document.createElement('span');
    chip.className = 'ref-chip';
    chip.innerHTML = `${r}<button class="x-ref" title="remover">×</button>`;
    chip.querySelector('.x-ref').addEventListener('click', () => {
      refsExtras.splice(i, 1);
      redesenharRefsExtras();
      recalc();
    });
    el.appendChild(chip);
  });
}

function recalc() {
  let totConf = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    const desabilitada = col.classList.contains('desabilitada');
    let c = 0;
    if (!desabilitada) {
      col.querySelectorAll('.cor-linha .q').forEach(q => c += parseInt(q.textContent) || 0);
    }
    col.querySelector('[data-conf]').textContent = desabilitada ? '—' : c;
    col.querySelector('[data-pend]').textContent = '';
    col.querySelector('[data-total]').textContent = desabilitada ? '—' : c;
    const ct = document.querySelector(`.ct[data-ct="${tam}"]`);
    ct.querySelector('b').textContent = desabilitada ? '—' : c;
    if (ct.querySelector('em')) ct.querySelector('em').textContent = '';
    totConf += desabilitada ? 0 : c;
  });
  const refPrincipal = document.getElementById('ref-principal').value.trim();
  const nRef = (refPrincipal ? 1 : 0) + refsExtras.length || 1;
  // AGORA cada ref é UM CORTE SEPARADO com essa qtd — não multiplica pra total
  document.getElementById('lbl-t').textContent = totConf;
  document.getElementById('lbl-t-sub').textContent =
    nRef > 1 ? `× ${nRef} cortes (${totConf} pç cada, ${totConf * nRef} no total)` : '';
}

async function salvarCorteBtn() {
  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;

  const data = document.getElementById('data').value;
  const lote = document.getElementById('lote').value.trim().toUpperCase();
  const refPrincipal = document.getElementById('ref-principal').value.trim().toUpperCase();

  if (!data || !lote || !refPrincipal) {
    toast('Preencha data, lote e referência', 'err');
    btn.disabled = false;
    return;
  }

  // Colher SÓ itens de colunas HABILITADAS
  const itensBase = [];
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (col.classList.contains('desabilitada')) return;
    col.querySelectorAll('.cor-linha').forEach(e => {
      const cor = e.querySelector('.cor').title || e.querySelector('.cor').textContent;
      const q = parseInt(e.querySelector('.q').textContent) || 0;
      if (q > 0) itensBase.push({ cor, tam, qtd: q });
    });
  });

  if (itensBase.length === 0) {
    toast('Adicione ao menos uma cor + quantidade CONFIRMADA', 'err');
    btn.disabled = false;
    return;
  }

  const refs = [refPrincipal, ...refsExtras];
  const totalPecasPorRef = itensBase.reduce((a, i) => a + i.qtd, 0);

  // Valida duplicidade de todas as refs de uma vez
  try {
    const cortesExistentes = await colCortes().where('lote', '==', lote).get();
    const conflitantes = [];
    cortesExistentes.forEach(doc => {
      const c = doc.data();
      const refsExistentes = c.refs || [];
      refs.forEach(r => {
        if (refsExistentes.includes(r)) conflitantes.push(r);
      });
    });
    if (conflitantes.length > 0) {
      const conflict = [...new Set(conflitantes)].join(', ');
      toast(`Já existe corte com Lote ${lote} e Ref ${conflict}. Não dá pra duplicar.`, 'err');
      btn.disabled = false;
      return;
    }
  } catch (e) {
    console.warn('Erro validando duplicidade:', e);
  }

  // === CORREÇÃO 19/08/2026 ===
  // Cria UM corte separado por ref, tudo dentro de um batch atômico.
  // Antes: um único corte com refs: [X, Y, Z]. Agora: N cortes, cada um refs: [X].
  try {
    const db = firebase.firestore();
    const batch = db.batch();
    const cortesCriados = [];

    for (const ref of refs) {
      const docRef = colCortes().doc(); // gera ID novo
      const itens = itensBase.map(i => ({ ref, ...i })); // cada item ganha a ref deste corte
      const corte = {
        lote,
        refs: [ref],           // array com uma ref só (mantém compat com o resto do sistema)
        data_corte: data,
        itens,
        total_pecas: totalPecasPorRef,
        status: 'cortado'
      };
      batch.set(docRef, corte);
      cortesCriados.push({ id: docRef.id, ref });
    }

    await batch.commit();

    const refsStr = refs.join(', ');
    if (refs.length === 1) {
      toast(`✓ Corte ${lote}/${refPrincipal} salvo (${totalPecasPorRef} peças)`, 'ok');
    } else {
      toast(`✓ ${refs.length} cortes do lote ${lote} salvos: ${refsStr} (${totalPecasPorRef} peças cada)`, 'ok');
    }

    // Salva cores novas no Firestore pra próxima vez aparecerem no autocomplete
    try {
      const coresUnicas = [...new Set(itensBase.map(i => i.cor))];
      const dl = document.getElementById('cores-list');
      const jaTem = new Set([...dl.querySelectorAll('option')].map(o => o.value.toUpperCase()));
      for (const cor of coresUnicas) {
        if (!jaTem.has(cor.toUpperCase())) {
          salvarCorSeNova(cor);
          const opt = document.createElement('option');
          opt.value = cor;
          dl.appendChild(opt);
        }
      }
    } catch (e) {
      console.warn('Falha ao registrar cores novas (não afeta o corte):', e);
    }

    limparFormularioPraNovoCorte(lote);
    btn.disabled = false;
  } catch (e) {
    console.error('Erro ao salvar cortes:', e);
    toast('Erro ao salvar: ' + e.message, 'err');
    btn.disabled = false;
  }
}

function limparFormularioPraNovoCorte(loteAnterior) {
  const proxLote = sugerirProximoLote(loteAnterior);
  document.getElementById('lote').value = proxLote;
  document.getElementById('ref-principal').value = '';
  refsExtras = [];
  redesenharRefsExtras();
  document.querySelectorAll('.col').forEach(col => {
    col.querySelector('.entradas').innerHTML = '';
    col.querySelector('.cor-input').value = '';
    col.querySelector('.qty-input').value = '';
    col.classList.remove('confirmada', 'tem-pendente');
    atualizarBtnCol(col);
  });
  recalc();
  document.getElementById('lote').focus();
  document.getElementById('lote').select();
}

function sugerirProximoLote(lote) {
  if (!lote) return '';
  const m = lote.match(/^(\d+)([A-Z])?$/i);
  if (!m) return '';
  const [, num, letra] = m;
  if (letra) {
    const proxLetra = String.fromCharCode(letra.toUpperCase().charCodeAt(0) + 1);
    if (proxLetra > 'Z') return String(parseInt(num) + 1) + 'A';
    return num + proxLetra;
  }
  return String(parseInt(num) + 1);
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('ref-principal').addEventListener('input', recalc);
});
