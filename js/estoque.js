// Tela de Entrada no Estoque
// Mostra notas com 1ª chegada (costura pronta) aguardando arremate
// Usuário confirma quantas peças entraram no estoque após o arremate (2ª chegada)

let notasAguardando = [];
let notaAtual = null;

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();

  document.getElementById('filtro-lote').addEventListener('input', renderChips);
  document.getElementById('filtro-ref').addEventListener('input', renderChips);
  document.getElementById('btn-fechar').addEventListener('click', fecharPainel);
  document.getElementById('btn-confirmar').addEventListener('click', confirmarEntrada);

  await carregarDados();
}

async function carregarDados() {
  const chips = document.getElementById('chips-lotes');
  chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">carregando...</span>';
  try {
    notasAguardando = await listarNotasAguardandoArremate();

    // Popular datalists
    const dlLotes = document.getElementById('lotes-list');
    const dlRefs = document.getElementById('refs-list');
    dlLotes.innerHTML = '';
    dlRefs.innerHTML = '';
    const lotesVisto = new Set();
    const refsVisto = new Set();
    notasAguardando.forEach(n => {
      if (!lotesVisto.has(n.lote)) {
        const opt = document.createElement('option');
        opt.value = n.lote;
        dlLotes.appendChild(opt);
        lotesVisto.add(n.lote);
      }
      if (!refsVisto.has(n.ref)) {
        const opt = document.createElement('option');
        opt.value = n.ref;
        dlRefs.appendChild(opt);
        refsVisto.add(n.ref);
      }
    });

    renderChips();
    await carregarConsultaEstoque();
  } catch (e) {
    console.error('Erro:', e);
    chips.innerHTML = `<span style="color:var(--text-danger);font-size:12px">Erro: ${e.message}</span>`;
  }
}

function renderChips() {
  const fl = document.getElementById('filtro-lote').value.trim().toUpperCase();
  const fr = document.getElementById('filtro-ref').value.trim().toUpperCase();
  const chips = document.getElementById('chips-lotes');
  chips.innerHTML = '';

  let filtradas = notasAguardando;
  if (fl) filtradas = filtradas.filter(n => n.lote?.toUpperCase().includes(fl));
  if (fr) filtradas = filtradas.filter(n => n.ref?.toUpperCase().includes(fr));

  document.getElementById('contador-chips').textContent = `(${filtradas.length})`;

  if (filtradas.length === 0) {
    if (notasAguardando.length === 0) {
      document.getElementById('estado-vazio').style.display = 'block';
      chips.style.display = 'none';
    } else {
      chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Nenhum lote encontrado com esse filtro</span>';
    }
    return;
  }

  document.getElementById('estado-vazio').style.display = 'none';
  chips.style.display = 'flex';

  filtradas.forEach(n => {
    const chegou1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + v, 0);
    const chegou2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0);
    const pendente = chegou1 - chegou2;

    const chip = document.createElement('div');
    chip.className = 'chip-lote';
    chip.innerHTML = `
      <span class="dot"></span>
      <span>${n.lote}/${n.ref}</span>
      <span class="meta">${n.costureira} · ${pendente} pç pend</span>
    `;
    chip.addEventListener('click', () => abrirNota(n));
    chips.appendChild(chip);
  });
}

function calcularPendentePorTam(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  const pendente = {};
  TAMS.forEach(t => {
    pendente[t] = Math.max(0, (c1[t] || 0) - (c2[t] || 0));
  });
  return pendente;
}

function coresEnviadasPorTam(n) {
  const mapa = { RN: [], P: [], M: [], G: [], GG: [] };
  (n.itens || []).forEach(i => {
    if (!mapa[i.tam]) mapa[i.tam] = [];
    mapa[i.tam].push({ cor: i.cor, qtd: i.qtd });
  });
  return mapa;
}

function abrirNota(n) {
  notaAtual = n;
  const chegou1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + v, 0);

  document.getElementById('p-lote').textContent = n.lote;
  document.getElementById('p-ref').textContent = n.ref;
  document.getElementById('p-num').textContent = `#${n.numero}`;
  document.getElementById('p-total').textContent = n.total_saida;
  document.getElementById('p-chegou').textContent = chegou1;
  document.getElementById('painel-estoque').classList.add('visivel');

  renderizarGrade();
  document.getElementById('painel-estoque').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarGrade() {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';
  const pendente = calcularPendentePorTam(notaAtual);
  const cores = coresEnviadasPorTam(notaAtual);
  const c1 = notaAtual.chegada_1?.qtds || {};
  const c2 = notaAtual.chegada_2?.qtds || {};

  TAMS.forEach(tam => {
    const aguard = pendente[tam] || 0;
    const chegou1Tam = c1[tam] || 0;
    const chegou2Tam = c2[tam] || 0;

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tam = tam;
    col.dataset.aguard = aguard;

    const coresTxt = (cores[tam] || []).map(c => `${c.cor} ${c.qtd}`).join(', ') || '—';

    col.innerHTML = `
      <div class="col-h">
        <span>${tam}</span>
        <span style="font-size:9px;color:var(--warning);font-weight:700">aguard <b>${aguard}</b></span>
      </div>
      <div class="entrada-estoque">
        <input type="number" class="entra-input" placeholder="0" min="0" max="${aguard}"
               value="0" ${aguard === 0 ? 'disabled' : ''}>
        <button class="btn-tudo-verde" ${aguard === 0 ? 'disabled' : ''}>TUDO ${aguard}</button>
      </div>
      <div class="cores-ref"><b>cores:</b> ${coresTxt}</div>
      <div class="subtot-col">
        <div class="cell aguard"><span>costura</span><b>${chegou1Tam}</b></div>
        <div class="cell entra"><span>entra</span><b data-entra>0</b></div>
        <div class="cell resta"><span>resta</span><b data-resta>${aguard}</b></div>
      </div>
    `;

    const input = col.querySelector('.entra-input');
    const btnTudo = col.querySelector('.btn-tudo-verde');

    input.addEventListener('input', () => {
      let v = parseInt(input.value) || 0;
      if (v > aguard) v = aguard;
      if (v < 0) v = 0;
      input.value = String(v);
      col.querySelector('[data-entra]').textContent = v;
      col.querySelector('[data-resta]').textContent = aguard - v;
      btnTudo.textContent = v >= aguard ? 'LIMPAR' : `TUDO ${aguard}`;
      recalcTotal();
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const inputs = [...document.querySelectorAll('.entra-input')];
        const idx = inputs.indexOf(input);
        for (let i = idx + 1; i < inputs.length; i++) {
          if (!inputs[i].disabled) { inputs[i].focus(); return; }
        }
        document.getElementById('btn-confirmar').focus();
      }
    });

    btnTudo.addEventListener('click', () => {
      const v = parseInt(input.value) || 0;
      const novo = v >= aguard ? 0 : aguard;
      input.value = String(novo);
      col.querySelector('[data-entra]').textContent = novo;
      col.querySelector('[data-resta]').textContent = aguard - novo;
      btnTudo.textContent = novo >= aguard ? 'LIMPAR' : `TUDO ${aguard}`;
      recalcTotal();
    });

    grade.appendChild(col);
  });

  recalcTotal();
}

function recalcTotal() {
  let total = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const v = parseInt(col.querySelector('.entra-input').value) || 0;
    total += v;
    document.querySelector(`.ct[data-ct="${tam}"] b`).textContent = v;
  });
  document.getElementById('lbl-entrando').textContent = total;
}

function fecharPainel() {
  document.getElementById('painel-estoque').classList.remove('visivel');
  notaAtual = null;
}

async function confirmarEntrada() {
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  const data = document.getElementById('p-data').value;
  if (!data) { toast('Preencha a data', 'err'); btn.disabled = false; return; }

  // Coletar qtds por tam
  const qtds = {};
  let total = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const v = parseInt(col.querySelector('.entra-input').value) || 0;
    if (v > 0) { qtds[tam] = v; total += v; }
  });

  if (total === 0) { toast('Coloque ao menos 1 peça pra entrar', 'err'); btn.disabled = false; return; }

  try {
    // 1. Salvar 2ª chegada na nota (acumula)
    const c2Existente = notaAtual.chegada_2?.qtds || {};
    const novasQtds = { ...c2Existente };
    Object.entries(qtds).forEach(([tam, v]) => {
      novasQtds[tam] = (novasQtds[tam] || 0) + v;
    });
    await atualizarNota(notaAtual.numero, {
      chegada_2: { data, qtds: novasQtds }
    });

    // 2. Distribuir peças por cor proportcionalmente e adicionar ao estoque
    // Pega as cores do corte (itens da nota) e distribui proporcionalmente por tam
    const itensPorTam = {};
    (notaAtual.itens || []).forEach(i => {
      if (!itensPorTam[i.tam]) itensPorTam[i.tam] = [];
      itensPorTam[i.tam].push({ cor: i.cor, qtd: i.qtd });
    });

    for (const [tam, qtdEntrando] of Object.entries(qtds)) {
      const itensDoTam = itensPorTam[tam] || [];
      const totalDoTam = itensDoTam.reduce((a, i) => a + i.qtd, 0);

      if (itensDoTam.length === 0 || totalDoTam === 0) {
        // Sem info de cor — entra como "SEM COR"
        await adicionarAoEstoque(notaAtual.ref, 'SEM COR', tam, qtdEntrando, data);
        continue;
      }

      // Distribuição proporcional
      let restante = qtdEntrando;
      for (let i = 0; i < itensDoTam.length; i++) {
        const item = itensDoTam[i];
        const ultimo = i === itensDoTam.length - 1;
        const proporcional = ultimo
          ? restante  // último pega o que sobrou (evita arredondamento)
          : Math.round((item.qtd / totalDoTam) * qtdEntrando);
        if (proporcional > 0) {
          await adicionarAoEstoque(notaAtual.ref, item.cor, tam, proporcional, data);
          restante -= proporcional;
        }
      }
    }

    toast(`✓ ${total} peças do lote ${notaAtual.lote}/${notaAtual.ref} entraram no estoque!`, 'ok');
    setTimeout(async () => {
      await carregarDados();
      fecharPainel();
      btn.disabled = false;
    }, 1500);
  } catch (e) {
    console.error('Erro:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
  }
}

async function carregarConsultaEstoque() {
  try {
    const estoque = await listarEstoque();
    const bloco = document.getElementById('bloco-consulta');
    const lista = document.getElementById('est-lista');
    const contagem = document.getElementById('est-contagem');

    if (estoque.length === 0) {
      bloco.style.display = 'none';
      return;
    }

    bloco.style.display = 'block';
    contagem.textContent = `(${estoque.length} SKUs)`;
    lista.innerHTML = '';
    estoque.forEach(e => {
      const item = document.createElement('div');
      item.className = 'estoque-item';
      item.innerHTML = `
        <span class="ref-est">${e.ref}</span>
        <span class="cor-est">${e.cor}</span>
        <span class="tam-est">${e.tam}</span>
        <span class="sku">${e.id}</span>
        <span class="qtd-est">${e.qtd}</span>
      `;
      lista.appendChild(item);
    });
  } catch (e) {
    console.warn('Erro carregando estoque:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
