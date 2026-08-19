// relatorios.js — 4 abas:
//   1. FORA         (notas em aberto)      → export CSV LAYOUT PLANILHA3
//   2. PARA MANDAR  (cortes pendentes)     → export CSV LAYOUT PLANILHA3
//   3. PAGAMENTOS   (histórico)            → export CSV tabela
//   4. RETORNOS     (histórico de chegadas)→ export CSV tabela
//
// CSV com BOM UTF-8 e separador ; (Excel BR abre com acentos e colunas certas).
// Compatível com o relatorios.html do repo (botões, cards, filtros existentes).

const TAMS_LOC = ['RN','P','M','G','GG'];

let TODAS_NOTAS = [];
let TODOS_CORTES = [];
let TODOS_PAGAMENTOS = [];

async function init() {
  await protegerRota();

  document.querySelectorAll('.abas button').forEach(b => {
    b.addEventListener('click', () => trocarAba(b.dataset.aba));
  });

  await carregarTudo();

  const cs = [...new Set(TODAS_NOTAS.map(n => n.costureira).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const dl = document.getElementById('costureiras-list');
  if (dl) dl.innerHTML = cs.map(c => `<option value="${escapeHtml(c)}">`).join('');

  buscarFora();
}

async function carregarTudo() {
  try {
    const _colCortes = (typeof colCortes === 'function')
      ? colCortes
      : () => firebase.firestore().collection('producao_dados').doc('op').collection('cortes');
    const _colPag = (typeof colPagamentos === 'function')
      ? colPagamentos
      : () => firebase.firestore().collection('producao_dados').doc('op').collection('pagamentos');

    const [snapN, snapC, snapP] = await Promise.all([
      colNotas().get(),
      _colCortes().get(),
      _colPag().get().catch(() => ({ docs: [] }))
    ]);
    TODAS_NOTAS      = snapN.docs.map(d => ({ id: d.id, ...d.data() }));
    TODOS_CORTES     = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
    TODOS_PAGAMENTOS = snapP.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[relatorios] ${TODAS_NOTAS.length} notas, ${TODOS_CORTES.length} cortes, ${TODOS_PAGAMENTOS.length} pagamentos`);
  } catch (e) {
    console.error('Erro carregando dados:', e);
    if (typeof toast === 'function') toast('Erro ao carregar: ' + e.message, 'err');
  }
}

function trocarAba(aba) {
  document.querySelectorAll('.abas button').forEach(b =>
    b.classList.toggle('ativa', b.dataset.aba === aba));
  document.querySelectorAll('.painel').forEach(p =>
    p.classList.toggle('ativo', p.dataset.painel === aba));
}

// =========== HELPERS ===========
function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function dataStr(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

function dataISO(v) {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : '';
}

function fmtBRL(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL'
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function totalPorTam(nota) {
  const res = { RN:0, P:0, M:0, G:0, GG:0, total:0 };
  (nota.itens || []).forEach(i => {
    const t = i.tam, q = Number(i.qtd) || 0;
    if (res[t] != null) { res[t] += q; res.total += q; }
  });
  return res;
}

function chegouTotalNota(n) {
  const c1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const c2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return c1 + c2;
}

function chegouTamNota(n, tam) {
  return (Number(n.chegada_1?.qtds?.[tam]) || 0) +
         (Number(n.chegada_2?.qtds?.[tam]) || 0);
}

function pendenteTamNota(n, tam) {
  const enviado = (n.itens || [])
    .filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
  return Math.max(0, enviado - chegouTamNota(n, tam));
}

function baixarCSV(linhas, nomeArquivo) {
  const csv = linhas.map(row => row.map(cel => {
    const s = String(cel == null ? '' : cel);
    if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes(',')) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  }).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========== ABA FORA ===========
function notasForaFiltradas() {
  const fc = document.getElementById('fora-cost').value.trim().toUpperCase();
  const fr = document.getElementById('fora-ref').value.trim().toUpperCase();
  let list = TODAS_NOTAS.filter(n => {
    if (n.retorno_finalizado === true) return false;
    const tp = totalPorTam(n).total;
    const ch = chegouTotalNota(n);
    return tp > ch;
  });
  if (fc) list = list.filter(n => (n.costureira || '').toUpperCase().includes(fc));
  if (fr) list = list.filter(n => (n.ref || '').toUpperCase().includes(fr));
  return list.sort((a, b) => {
    const c = (a.costureira || '').localeCompare(b.costureira || '');
    return c !== 0 ? c : (toDate(a.data_saida) || 0) - (toDate(b.data_saida) || 0);
  });
}

function buscarFora() {
  const list = notasForaFiltradas();
  const tbody = document.getElementById('fora-tbody');
  const tfoot = document.getElementById('fora-tfoot');
  const cards = document.getElementById('fora-cards');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="vazio">Nada encontrado com esses filtros</td></tr>';
    tfoot.style.display = 'none';
    cards.style.display = 'none';
    return;
  }
  let sSaiu = 0, sChegou = 0, sPend = 0, sValor = 0;
  list.forEach(n => {
    const tp = totalPorTam(n).total;
    const ch = chegouTotalNota(n);
    const pend = Math.max(0, tp - ch);
    const v = Number(n.valor_nota) || 0;
    sSaiu += tp; sChegou += ch; sPend += pend; sValor += v;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(n.numero || n.id)}</td>
      <td>${escapeHtml(n.costureira || '—')}</td>
      <td><b>${escapeHtml(n.lote || '—')}</b> / ${escapeHtml(n.ref || '—')}</td>
      <td>${dataStr(n.data_saida)}</td>
      <td class="num">${tp}</td>
      <td class="num">${ch}</td>
      <td class="num ${pend>0?'laranja':''}">${pend}</td>
      <td class="num verde">${fmtBRL(v)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('fora-tot-notas').textContent = list.length;
  document.getElementById('fora-tot-pecas').textContent = sSaiu;
  document.getElementById('fora-tot-pend').textContent = sPend;
  document.getElementById('fora-tot-valor').textContent = fmtBRL(sValor);
  document.getElementById('fora-sum-saiu').textContent = sSaiu;
  document.getElementById('fora-sum-chegou').textContent = sChegou;
  document.getElementById('fora-sum-pend').textContent = sPend;
  document.getElementById('fora-sum-valor').textContent = fmtBRL(sValor);
  cards.style.display = 'grid';
  tfoot.style.display = '';
}

function exportarFora() {
  const list = notasForaFiltradas();
  if (!list.length) {
    if (typeof toast === 'function') toast('Nada pra exportar', 'err');
    return;
  }
  const linhas = [];
  linhas.push([`FORA — ${new Date().toLocaleDateString('pt-BR')}`]);
  linhas.push([]);
  linhas.push(['NOME', 'SAÍDA',
    'RN','RN', 'P','P', 'M','M', 'G','G', 'GG','GG']);
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };
  list.forEach(n => {
    const row = [n.costureira || '', dataStr(n.data_saida)];
    TAMS_LOC.forEach(tam => {
      const pend = pendenteTamNota(n, tam);
      totais[tam] += pend;
      // Coluna com valor NEGATIVO (padrão Excel antigo) + coluna vazia pra anotar
      row.push(pend > 0 ? -pend : '', '');
    });
    linhas.push(row);
  });
  linhas.push([]);
  linhas.push(['TOTAL', '',
    totais.RN || '', '',
    totais.P  || '', '',
    totais.M  || '', '',
    totais.G  || '', '',
    totais.GG || '', ''
  ]);
  baixarCSV(linhas, `bambam_fora_${hojeISO()}.csv`);
}

// =========== ABA PARA MANDAR ===========
function notasDoCorte(corteId) {
  return TODAS_NOTAS.filter(n => n.corte_id === corteId);
}

function totalCorteTam(c, tam) {
  return (c.itens || []).filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
}

function designadoCorteTam(c, tam) {
  return notasDoCorte(c.id).flatMap(n => n.itens || [])
    .filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
}

function pendenteCorteTam(c, tam) {
  return Math.max(0, totalCorteTam(c, tam) - designadoCorteTam(c, tam));
}

function pendenteTotalCorte(c) {
  return TAMS_LOC.reduce((a, t) => a + pendenteCorteTam(c, t), 0);
}

function refsCorte(c) {
  if (Array.isArray(c.refs) && c.refs.length) return c.refs.join(', ');
  if (c.ref) return c.ref;
  return [...new Set((c.itens || []).map(i => i.ref).filter(Boolean))].join(', ') || '—';
}

function cortesParaMandarFiltrados() {
  const fr = document.getElementById('pman-ref').value.trim().toUpperCase();
  const status = document.getElementById('pman-status').value;
  let list = TODOS_CORTES.filter(c => pendenteTotalCorte(c) > 0);
  if (status !== 'todos') list = list.filter(c => c.status === status);
  if (fr) list = list.filter(c => refsCorte(c).toUpperCase().includes(fr));
  return list.sort((a, b) => (toDate(a.data_corte) || 0) - (toDate(b.data_corte) || 0));
}

function buscarParaMandar() {
  const list = cortesParaMandarFiltrados();
  const tbody = document.getElementById('pman-tbody');
  const tfoot = document.getElementById('pman-tfoot');
  const cards = document.getElementById('pman-cards');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum corte pendente</td></tr>';
    tfoot.style.display = 'none';
    cards.style.display = 'none';
    return;
  }
  let sPecas = 0;
  list.forEach(c => {
    const pend = pendenteTotalCorte(c);
    sPecas += pend;
    const tamStr = TAMS_LOC.map(t => {
      const p = pendenteCorteTam(c, t);
      return p > 0 ? `${t}:${p}` : '';
    }).filter(Boolean).join(' · ');
    const st = c.status || 'cortado';
    const stLabel = st === 'cortado' ? 'aguardando' :
                    st === 'designado_parcial' ? 'parcial' : 'total';
    const stClass = st === 'cortado' ? 'cortado' :
                    st === 'designado_parcial' ? 'parcial' : 'total';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${escapeHtml(c.lote || '—')}</b></td>
      <td>${escapeHtml(refsCorte(c))}</td>
      <td>${dataStr(c.data_corte)}</td>
      <td class="num">${pend}</td>
      <td><span class="status ${stClass}">${stLabel}</span></td>
      <td class="muted">${tamStr}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('pman-tot-cortes').textContent = list.length;
  document.getElementById('pman-tot-pecas').textContent = sPecas;
  document.getElementById('pman-sum-pecas').textContent = sPecas;
  cards.style.display = 'grid';
  tfoot.style.display = '';
}

function exportarParaMandar() {
  const list = cortesParaMandarFiltrados();
  if (!list.length) {
    if (typeof toast === 'function') toast('Nada pra exportar', 'err');
    return;
  }
  const linhas = [];
  linhas.push([`PRA MANDAR — ${new Date().toLocaleDateString('pt-BR')}`]);
  linhas.push([]);
  linhas.push(['DATA', 'LOTE', 'REF',
    'RN','RN', 'P','P', 'M','M', 'G','G', 'GG','GG',
    'COSTUREIRA']);
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };
  list.forEach(c => {
    const row = [dataStr(c.data_corte), c.lote || '', refsCorte(c)];
    TAMS_LOC.forEach(tam => {
      const pend = pendenteCorteTam(c, tam);
      totais[tam] += pend;
      row.push(pend > 0 ? pend : '', '');
    });
    row.push(''); // coluna COSTUREIRA vazia pra anotar
    linhas.push(row);
  });
  linhas.push([]);
  linhas.push(['TOTAL', '', '',
    totais.RN || '', '',
    totais.P  || '', '',
    totais.M  || '', '',
    totais.G  || '', '',
    totais.GG || '', '',
    ''
  ]);
  baixarCSV(linhas, `bambam_pra_mandar_${hojeISO()}.csv`);
}

// =========== ABA PAGAMENTOS ===========
function pagamentosFiltrados() {
  const fc = document.getElementById('pag-cost').value.trim().toUpperCase();
  const de = document.getElementById('pag-de').value;
  const ate = document.getElementById('pag-ate').value;
  let list = TODOS_PAGAMENTOS.slice();
  if (fc) list = list.filter(p => (p.costureira || '').toUpperCase().includes(fc));
  if (de)  list = list.filter(p => dataISO(p.data) >= de);
  if (ate) list = list.filter(p => dataISO(p.data) <= ate);
  return list.sort((a, b) => (toDate(b.data) || 0) - (toDate(a.data) || 0));
}

function buscarPagamentos() {
  const list = pagamentosFiltrados();
  const tbody = document.getElementById('pag-tbody');
  const tfoot = document.getElementById('pag-tfoot');
  const cards = document.getElementById('pag-cards');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="vazio">Nenhum pagamento no período</td></tr>';
    tfoot.style.display = 'none';
    cards.style.display = 'none';
    return;
  }
  let sB = 0, sA = 0, sL = 0;
  list.forEach(p => {
    const b = Number(p.valor_bruto) || 0;
    const a = Number(p.adiantamento_usado) || 0;
    const l = Number(p.valor_liquido) || 0;
    sB += b; sA += a; sL += l;
    const nStr = (p.notas_pagas || []).map(n => n.numero || n).join(', ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dataStr(p.data)}</td>
      <td>${escapeHtml(p.costureira || '—')}</td>
      <td>${escapeHtml(p.forma || '—')}</td>
      <td class="num muted">${escapeHtml(nStr)}</td>
      <td class="num">${fmtBRL(b)}</td>
      <td class="num">${a > 0 ? fmtBRL(a) : '—'}</td>
      <td class="num verde">${fmtBRL(l)}</td>
      <td class="muted">${escapeHtml(p.observacao || '')}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('pag-tot-pags').textContent = list.length;
  document.getElementById('pag-tot-valor').textContent = fmtBRL(sL);
  document.getElementById('pag-tot-adiant').textContent = fmtBRL(sA);
  document.getElementById('pag-sum-bruto').textContent = fmtBRL(sB);
  document.getElementById('pag-sum-adiant').textContent = fmtBRL(sA);
  document.getElementById('pag-sum-liq').textContent = fmtBRL(sL);
  cards.style.display = 'grid';
  tfoot.style.display = '';
}

function exportarPagamentos() {
  const list = pagamentosFiltrados();
  if (!list.length) {
    if (typeof toast === 'function') toast('Nada pra exportar', 'err');
    return;
  }
  const linhas = [];
  linhas.push([`HISTÓRICO DE PAGAMENTOS — ${new Date().toLocaleDateString('pt-BR')}`]);
  linhas.push([]);
  linhas.push(['DATA', 'COSTUREIRA', 'FORMA', 'NOTAS',
    'BRUTO', 'ADIANTAMENTO', 'LÍQUIDO', 'OBS']);
  let sB = 0, sA = 0, sL = 0;
  list.forEach(p => {
    const b = Number(p.valor_bruto) || 0;
    const a = Number(p.adiantamento_usado) || 0;
    const l = Number(p.valor_liquido) || 0;
    sB += b; sA += a; sL += l;
    const nStr = (p.notas_pagas || []).map(n => n.numero || n).join(', ');
    linhas.push([
      dataStr(p.data), p.costureira || '', p.forma || '', nStr,
      b.toFixed(2).replace('.', ','),
      a.toFixed(2).replace('.', ','),
      l.toFixed(2).replace('.', ','),
      p.observacao || ''
    ]);
  });
  linhas.push([]);
  linhas.push(['TOTAL', '', '', '',
    sB.toFixed(2).replace('.', ','),
    sA.toFixed(2).replace('.', ','),
    sL.toFixed(2).replace('.', ','),
    ''
  ]);
  baixarCSV(linhas, `bambam_pagamentos_${hojeISO()}.csv`);
}

// =========== ABA RETORNOS ===========
function retornosFiltrados() {
  const fc = document.getElementById('ret-cost').value.trim().toUpperCase();
  const fr = document.getElementById('ret-ref').value.trim().toUpperCase();
  let list = TODAS_NOTAS.filter(n => chegouTotalNota(n) > 0);
  if (fc) list = list.filter(n => (n.costureira || '').toUpperCase().includes(fc));
  if (fr) list = list.filter(n => (n.ref || '').toUpperCase().includes(fr));
  return list.sort((a, b) => {
    const da = toDate(a.chegada_2?.data || a.chegada_1?.data) || 0;
    const db = toDate(b.chegada_2?.data || b.chegada_1?.data) || 0;
    return db - da;
  });
}

function buscarRetornos() {
  const list = retornosFiltrados();
  const tbody = document.getElementById('ret-tbody');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="vazio">Nenhum retorno encontrado</td></tr>';
    return;
  }
  list.forEach(n => {
    const tp = totalPorTam(n).total;
    const ch = chegouTotalNota(n);
    const pend = Math.max(0, tp - ch);
    const c1d = n.chegada_1?.data ? dataStr(n.chegada_1.data) : '—';
    const c2d = n.chegada_2?.data ? dataStr(n.chegada_2.data) : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(n.numero || n.id)}</td>
      <td>${escapeHtml(n.costureira || '—')}</td>
      <td><b>${escapeHtml(n.lote || '—')}</b> / ${escapeHtml(n.ref || '—')}</td>
      <td>${dataStr(n.data_saida)}</td>
      <td>${c1d}</td>
      <td>${c2d}</td>
      <td class="num">${tp}</td>
      <td class="num azul">${ch}</td>
      <td class="num ${pend>0?'laranja':'verde'}">${pend}</td>
    `;
    tbody.appendChild(tr);
  });
}

function exportarRetornos() {
  const list = retornosFiltrados();
  if (!list.length) {
    if (typeof toast === 'function') toast('Nada pra exportar', 'err');
    return;
  }
  const linhas = [];
  linhas.push([`HISTÓRICO DE RETORNOS — ${new Date().toLocaleDateString('pt-BR')}`]);
  linhas.push([]);
  linhas.push(['#', 'COSTUREIRA', 'LOTE', 'REF',
    'DATA SAÍDA', '1ª CHEGADA', '2ª CHEGADA',
    'SAIU', 'CHEGOU', 'PENDENTE']);
  list.forEach(n => {
    const tp = totalPorTam(n).total;
    const ch = chegouTotalNota(n);
    linhas.push([
      n.numero || n.id,
      n.costureira || '',
      n.lote || '',
      n.ref || '',
      dataStr(n.data_saida),
      n.chegada_1?.data ? dataStr(n.chegada_1.data) : '',
      n.chegada_2?.data ? dataStr(n.chegada_2.data) : '',
      tp, ch, Math.max(0, tp - ch)
    ]);
  });
  baixarCSV(linhas, `bambam_retornos_${hojeISO()}.csv`);
}

// =========== DISPATCHER ===========
function exportarExcel(aba) {
  const fn = {
    'fora':        exportarFora,
    'para-mandar': exportarParaMandar,
    'pagamentos':  exportarPagamentos,
    'retornos':    exportarRetornos
  }[aba];
  if (fn) fn();
  else console.warn('Aba desconhecida pra exportar:', aba);
}

document.addEventListener('DOMContentLoaded', init);
