// Novo Corte — cria um corte com uma ou mais refs, com entries de cor+qtd por tamanho

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

  // Ligar inputs de nova entrada
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

  // Ligar confirmar/reabrir — clica confirma, clica de novo reabre. Simples.
  col.querySelector('.confirmar-btn').addEventListener('click', () => {
    if (col.classList.contains('confirmada') && col.querySelectorAll('.cor-linha.pending').length === 0) {
      // Reabrir: só remove a marca de confirmada, mantém as entradas
      col.classList.remove('confirmada');
      atualizarBtnCol(col);
      recalc();
    } else {
      confirmarPendentes(col);
    }
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

  // Adiciona confirmada nessa col
  addEntrada(col, cor, q, false);

  // Adiciona pending nas outras
  document.querySelectorAll('.col').forEach(outra => {
    if (outra === col) return;
    addEntrada(outra, cor, q, true);
    atualizarBtnCol(outra);
  });

  corInput.value = '';
  qtyInput.value = '';
  corInput.focus();
  atualizarBtnCol(col);
  recalc();
}

function addEntrada(col, cor, q, isPending) {
  const e = document.createElement('div');
  e.className = 'cor-linha' + (isPending ? ' pending' : '');
  if (isPending) {
    e.innerHTML = `<span class="cor" title="${cor}">${abrevCor(cor)}</span><span class="q" contenteditable="true" spellcheck="false" inputmode="numeric">${q}</span><button class="x">×</button>`;
    const qe = e.querySelector('.q');
    qe.addEventListener('focus', () => selecionarTudo(qe));
    qe.addEventListener('input', () => {
      sanitizarQtd(qe);
      atualizarBtnCol(col);
      recalc();
    });
    qe.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        // Pula pra próxima pendente da mesma coluna
        const qs = col.querySelectorAll('.cor-linha.pending .q');
        const idx = Array.from(qs).indexOf(qe);
        if (idx >= 0 && idx < qs.length - 1) qs[idx + 1].focus();
      }
    });
  } else {
    e.innerHTML = `<span class="cor" title="${cor}">${abrevCor(cor)}</span><span class="q">${q}</span><button class="x">×</button>`;
  }
  e.querySelector('.x').addEventListener('click', () => {
    e.remove();
    atualizarBtnCol(col);
    recalc();
  });
  col.querySelector('.entradas').appendChild(e);
}

function atualizarBtnCol(col) {
  const pend = col.querySelectorAll('.cor-linha.pending').length;
  const conf = col.querySelectorAll('.cor-linha:not(.pending)').length;
  const btn = col.querySelector('.confirmar-btn');
  if (pend > 0) {
    col.classList.add('tem-pendente');
    col.classList.remove('confirmada');
    btn.innerHTML = `confirmar ${col.dataset.tam} <span class="badge">${pend}</span>`;
    btn.disabled = false;
  } else {
    col.classList.remove('tem-pendente');
    if (col.classList.contains('confirmada')) {
      btn.textContent = 'reabrir ' + col.dataset.tam;
    } else if (conf > 0) {
      btn.textContent = 'confirmar ' + col.dataset.tam;
    } else {
      btn.textContent = 'confirmar ' + col.dataset.tam;
      btn.disabled = true;
    }
  }
}

function confirmarPendentes(col) {
  col.querySelectorAll('.cor-linha.pending').forEach(e => {
    const abr = e.querySelector('.cor').textContent;
    const cor = e.querySelector('.cor').title || abr;
    const q = parseInt(e.querySelector('.q').textContent) || 0;
    if (q === 0) { e.remove(); return; }
    e.classList.remove('pending');
    e.innerHTML = `<span class="cor" title="${cor}">${abr}</span><span class="q">${q}</span><button class="x">×</button>`;
    e.querySelector('.x').addEventListener('click', () => {
      e.remove(); atualizarBtnCol(col); recalc();
    });
  });
  col.classList.remove('tem-pendente');
  col.classList.add('confirmada');
  atualizarBtnCol(col);
  recalc();
}

function adicionarRefExtra() {
  const ref = prompt('Qual outra ref? (ex: 205MT)');
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
  let totConf = 0, totPend = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    let c = 0, p = 0;
    col.querySelectorAll('.cor-linha:not(.pending) .q').forEach(q => c += parseInt(q.textContent) || 0);
    col.querySelectorAll('.cor-linha.pending .q').forEach(q => p += parseInt(q.textContent) || 0);
    col.querySelector('[data-conf]').textContent = c;
    col.querySelector('[data-pend]').textContent = p;
    col.querySelector('[data-total]').textContent = c + p;
    const ct = document.querySelector(`.ct[data-ct="${tam}"]`);
    ct.querySelector('b').textContent = c + p;
    ct.querySelector('em').textContent = p ? `(${p} pend)` : '';
    totConf += c; totPend += p;
  });
  const refPrincipal = document.getElementById('ref-principal').value.trim();
  const nRef = (refPrincipal ? 1 : 0) + refsExtras.length || 1;
  const total = (totConf + totPend) * nRef;
  document.getElementById('lbl-t').textContent = total;
  document.getElementById('lbl-t-sub').textContent = nRef > 1 ? `× ${nRef} refs` : '';
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

  // Colher itens (confirmadas + pending com qtd > 0)
  const itensBase = [];
  TAMS.forEach(tam => {
    document.querySelectorAll(`.col[data-tam="${tam}"] .cor-linha`).forEach(e => {
      const cor = e.querySelector('.cor').title || e.querySelector('.cor').textContent;
      const q = parseInt(e.querySelector('.q').textContent) || 0;
      if (q > 0) itensBase.push({ cor, tam, qtd: q });
    });
  });

  if (itensBase.length === 0) {
    toast('Adicione ao menos uma cor + quantidade', 'err');
    btn.disabled = false;
    return;
  }

  const refs = [refPrincipal, ...refsExtras];
  // Duplica os itens por ref
  const itens = [];
  refs.forEach(r => {
    itensBase.forEach(i => itens.push({ ref: r, ...i }));
  });
  const totalPecas = itens.reduce((a, i) => a + i.qtd, 0);

  const corte = {
    lote,
    refs,
    data_corte: data,
    itens,
    total_pecas: totalPecas,
    status: 'cortado'
  };

  try {
    const id = await salvarCorte(corte);
    toast(`✓ Corte ${lote} / ${refPrincipal} salvo (${totalPecas} peças). Pronto pro próximo!`, 'ok');
    limparFormularioPraNovoCorte(lote);
    btn.disabled = false;
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
    btn.disabled = false;
  }
}

// Limpa os campos e a grade, mantendo a data e sugerindo próximo lote
function limparFormularioPraNovoCorte(loteAnterior) {
  // Mantém data (você tá lançando vários no mesmo dia)
  // Sugere próximo lote se for numérico com letra (ex: 2030B → 2030C)
  const proxLote = sugerirProximoLote(loteAnterior);
  document.getElementById('lote').value = proxLote;
  document.getElementById('ref-principal').value = '';
  refsExtras = [];
  redesenharRefsExtras();

  // Limpa as 5 colunas
  document.querySelectorAll('.col').forEach(col => {
    col.querySelector('.entradas').innerHTML = '';
    col.querySelector('.cor-input').value = '';
    col.querySelector('.qty-input').value = '';
    col.classList.remove('confirmada', 'tem-pendente');
    atualizarBtnCol(col);
  });
  recalc();

  // Foca no lote pra você já digitar o próximo (ou usa a sugestão + Tab)
  document.getElementById('lote').focus();
  document.getElementById('lote').select();
}

// Sugere próximo lote: 2030B → 2030C, 2030 → 2031, ABC → deixa vazio
function sugerirProximoLote(lote) {
  if (!lote) return '';
  const m = lote.match(/^(\d+)([A-Z])?$/i);
  if (!m) return '';
  const [, num, letra] = m;
  if (letra) {
    // Incrementa a letra: B → C, Z → volta A e incrementa número
    const proxLetra = String.fromCharCode(letra.toUpperCase().charCodeAt(0) + 1);
    if (proxLetra > 'Z') return String(parseInt(num) + 1) + 'A';
    return num + proxLetra;
  }
  return String(parseInt(num) + 1);
}

// Recalcula quando ref principal muda
document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('ref-principal').addEventListener('input', recalc);
});
