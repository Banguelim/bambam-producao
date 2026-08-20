// Relatórios BAMBAM BABY — 4 abas com folha branca imprimível:
//   1. FORA         → ordenada por REF do menor pro maior (numérica)
//   2. PRA MANDAR   → ordenada por REF A-Z (natural sort)
//   3. PAGAMENTOS   → histórico ordenado por data desc
//   4. RETORNOS     → histórico ordenado por data desc
//
// Botão único: 🖨️ Imprimir (sem Excel). Folha em fundo branco, texto preto,
// colunas duplicadas por tam nas abas 1 e 2 (segunda em branco pra anotar).

const TAMS_R = ['RN','P','M','G','GG'];

let TODAS_NOTAS_R = [];
let TODOS_CORTES_R = [];
let TODOS_PAGAMENTOS_R = [];

async function init() {
  await protegerRota();

  document.querySelectorAll('.abas button').forEach(b => {
    b.addEventListener('click', () => trocarAba(b.dataset.aba));
  });

  await carregarTudo();

  const cs = [...new Set(TODAS_NOTAS_R.map(n => n.costureira).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const dl = document.getElementById('costureiras-list');
  if (dl) dl.innerHTML = cs.map(c => `<option value="${escapeHtmlR(c)}">`).join('');

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
    TODAS_NOTAS_R      = snapN.docs.map(d => ({ id: d.id, ...d.data() }));
    TODOS_CORTES_R     = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
    TODOS_PAGAMENTOS_R = snapP.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`[relatorios] ${TODAS_NOTAS_R.length} notas, ${TODOS_CORTES_R.length} cortes, ${TODOS_PAGAMENTOS_R.length} pagamentos`);
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
function dataCurta(v) {
  const d = toDate(v);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
function dataISO(v) {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : '';
}
function fmtBRL(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function escapeHtmlR(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

// Ordenação natural que trata partes numéricas como número:
// "205" < "703" numericamente; "205A" < "205B" alfabeticamente.
function cmpRef(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function pendenteTamNotaR(n, tam) {
  const enviado = (n.itens || [])
    .filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
  const rec1 = Number(n.chegada_1?.qtds?.[tam]) || 0;
  const rec2 = Number(n.chegada_2?.qtds?.[tam]) || 0;
  return Math.max(0, enviado - rec1 - rec2);
}
function pendenteTotalNotaR(n) {
  return TAMS_R.reduce((a, t) => a + pendenteTamNotaR(n, t), 0);
}
function chegouTotalNotaR(n) {
  const c1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const c2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return c1 + c2;
}

// =========== ABA FORA ===========
function notasForaFiltradas() {
  const fc = document.getElementById('fora-cost').value.trim().toUpperCase();
  const fr = document.getElementById('fora-ref').value.trim().toUpperCase();
  let list = TODAS_NOTAS_R.filter(n =>
    n.retorno_finalizado !== true && pendenteTotalNotaR(n) > 0);
  if (fc) list = list.filter(n => (n.costureira || '').toUpperCase().includes(fc));
  if (fr) list = list.filter(n => (n.ref || '').toUpperCase().includes(fr));
  // Ordenado por COSTUREIRA (A-Z), depois REF (menor pro maior), depois lote
  return list.sort((a, b) => {
    const c = (a.costureira || '').localeCompare(b.costureira || '', 'pt-BR', { sensitivity: 'base' });
    if (c !== 0) return c;
    const r = cmpRef(a.ref, b.ref);
    if (r !== 0) return r;
    return (a.lote || '').localeCompare(b.lote || '');
  });
}

function buscarFora() {
  const list = notasForaFiltradas();
  const folha = document.getElementById('fora-folha');
  const vazio = document.getElementById('fora-vazio');
  const tbody = document.getElementById('fora-tbody');

  document.getElementById('fora-data').textContent = dataStr(new Date());

  if (!list.length) {
    folha.style.display = 'none';
    vazio.style.display = 'block';
    document.getElementById('fora-info').textContent = 'nada encontrado';
    return;
  }
  vazio.style.display = 'none';
  folha.style.display = 'block';

  tbody.innerHTML = '';
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };

  list.forEach(n => {
    const teve1 = n.chegada_1 && Object.values(n.chegada_1.qtds || {}).some(v => Number(v) > 0);
    const teve2 = n.chegada_2 && Object.values(n.chegada_2.qtds || {}).some(v => Number(v) > 0);
    let obs = '';
    if (teve2) obs = '2ª parcial';
    else if (teve1) obs = '1ª parcial';

    const tr = document.createElement('tr');
    let html = `
      <td class="ref">${escapeHtmlR(n.ref || '—')}</td>
      <td class="lote">${escapeHtmlR(n.lote || '—')}</td>
      <td class="nome">${escapeHtmlR(n.costureira || '—')}</td>
      <td class="saida">${dataCurta(n.data_saida)}</td>
    `;
    TAMS_R.forEach(tam => {
      const pend = pendenteTamNotaR(n, tam);
      totais[tam] += pend;
      if (pend > 0) html += `<td class="sai">${pend}</td><td class="rec"></td>`;
      else html += `<td class="sai vazio">—</td><td class="rec"></td>`;
    });
    html += `<td class="obs">${obs}</td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);
  document.getElementById('fora-t-rn').textContent = totais.RN || '—';
  document.getElementById('fora-t-p').textContent  = totais.P  || '—';
  document.getElementById('fora-t-m').textContent  = totais.M  || '—';
  document.getElementById('fora-t-g').textContent  = totais.G  || '—';
  document.getElementById('fora-t-gg').textContent = totais.GG || '—';
  document.getElementById('fora-t-geral').textContent = `${totalGeral} pç`;
  document.getElementById('fora-info').textContent =
    `${list.length} nota${list.length!==1?'s':''} · ${totalGeral} peças a receber`;
}

// =========== ABA PRA MANDAR ===========
function notasDoCorteR(corteId) {
  return TODAS_NOTAS_R.filter(n => n.corte_id === corteId);
}
function totalCorteTam(c, tam) {
  return (c.itens || []).filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
}
function designadoCorteTam(c, tam) {
  return notasDoCorteR(c.id).flatMap(n => n.itens || [])
    .filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
}
function pendenteCorteTam(c, tam) {
  return Math.max(0, totalCorteTam(c, tam) - designadoCorteTam(c, tam));
}
function pendenteTotalCorte(c) {
  return TAMS_R.reduce((a, t) => a + pendenteCorteTam(c, t), 0);
}
function refsCorte(c) {
  if (Array.isArray(c.refs) && c.refs.length) return c.refs.join(', ');
  if (c.ref) return c.ref;
  return [...new Set((c.itens || []).map(i => i.ref).filter(Boolean))].join(', ') || '—';
}
function refPrincipal(c) {
  if (Array.isArray(c.refs) && c.refs.length) return c.refs[0];
  if (c.ref) return c.ref;
  const rs = [...new Set((c.itens || []).map(i => i.ref).filter(Boolean))];
  return rs[0] || '';
}

function cortesParaMandarFiltrados() {
  const fr = document.getElementById('pman-ref').value.trim().toUpperCase();
  const status = document.getElementById('pman-status').value;
  let list = TODOS_CORTES_R.filter(c => pendenteTotalCorte(c) > 0);
  if (status !== 'todos') list = list.filter(c => c.status === status);
  if (fr) list = list.filter(c => refsCorte(c).toUpperCase().includes(fr));
  // Ordenado por REF A-Z (usa refPrincipal pra sort), depois lote
  return list.sort((a, b) => {
    const r = cmpRef(refPrincipal(a), refPrincipal(b));
    if (r !== 0) return r;
    return (a.lote || '').localeCompare(b.lote || '');
  });
}

function buscarParaMandar() {
  const list = cortesParaMandarFiltrados();
  const folha = document.getElementById('pman-folha');
  const vazio = document.getElementById('pman-vazio');
  const tbody = document.getElementById('pman-tbody');

  document.getElementById('pman-data').textContent = dataStr(new Date());

  if (!list.length) {
    folha.style.display = 'none';
    vazio.style.display = 'block';
    document.getElementById('pman-info').textContent = 'nada encontrado';
    return;
  }
  vazio.style.display = 'none';
  folha.style.display = 'block';

  tbody.innerHTML = '';
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };

  list.forEach(c => {
    const tr = document.createElement('tr');
    let html = `
      <td class="ref">${escapeHtmlR(refsCorte(c))}</td>
      <td class="lote">${escapeHtmlR(c.lote || '—')}</td>
      <td class="saida">${dataCurta(c.data_corte)}</td>
    `;
    TAMS_R.forEach(tam => {
      const pend = pendenteCorteTam(c, tam);
      totais[tam] += pend;
      if (pend > 0) html += `<td class="sai">${pend}</td><td class="rec"></td>`;
      else html += `<td class="sai vazio">—</td><td class="rec"></td>`;
    });
    html += `<td class="obs"></td>`; // costureira em branco pra anotar
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);
  document.getElementById('pman-t-rn').textContent = totais.RN || '—';
  document.getElementById('pman-t-p').textContent  = totais.P  || '—';
  document.getElementById('pman-t-m').textContent  = totais.M  || '—';
  document.getElementById('pman-t-g').textContent  = totais.G  || '—';
  document.getElementById('pman-t-gg').textContent = totais.GG || '—';
  document.getElementById('pman-t-geral').textContent = `${totalGeral} pç`;
  document.getElementById('pman-info').textContent =
    `${list.length} corte${list.length!==1?'s':''} · ${totalGeral} peças pra designar`;
}

// =========== ABA PAGAMENTOS ===========
function pagamentosFiltrados() {
  const fc = document.getElementById('pag-cost').value.trim().toUpperCase();
  const de = document.getElementById('pag-de').value;
  const ate = document.getElementById('pag-ate').value;
  let list = TODOS_PAGAMENTOS_R.slice();
  if (fc) list = list.filter(p => (p.costureira || '').toUpperCase().includes(fc));
  if (de)  list = list.filter(p => dataISO(p.data) >= de);
  if (ate) list = list.filter(p => dataISO(p.data) <= ate);
  return list.sort((a, b) => (toDate(b.data) || 0) - (toDate(a.data) || 0));
}

function buscarPagamentos() {
  const list = pagamentosFiltrados();
  const folha = document.getElementById('pag-folha');
  const vazio = document.getElementById('pag-vazio');
  const tbody = document.getElementById('pag-tbody');

  const de = document.getElementById('pag-de').value;
  const ate = document.getElementById('pag-ate').value;
  let periodo = 'todos os pagamentos';
  if (de && ate) periodo = `${dataStr(de)} a ${dataStr(ate)}`;
  else if (de) periodo = `a partir de ${dataStr(de)}`;
  else if (ate) periodo = `até ${dataStr(ate)}`;
  document.getElementById('pag-periodo').textContent = 'Período: ' + periodo;

  if (!list.length) {
    folha.style.display = 'none';
    vazio.style.display = 'block';
    document.getElementById('pag-info').textContent = 'nada encontrado';
    return;
  }
  vazio.style.display = 'none';
  folha.style.display = 'block';

  tbody.innerHTML = '';
  let sB = 0, sA = 0, sL = 0;
  list.forEach(p => {
    const b = Number(p.valor_bruto) || 0;
    const a = Number(p.adiantamento_usado) || 0;
    const l = Number(p.valor_liquido) || 0;
    sB += b; sA += a; sL += l;
    const nStr = (p.notas_pagas || []).map(n => (n && (n.nota_numero ?? n.numero ?? n.num ?? n.id)) ?? n).join(', ');
    // Renderização usando os campos REAIS do pagamento.js:
    //   nota_numero (string tipo '0086'), valor, pecas_pagas, preco_peca
    // Como o pagamento já congela valor+preço no momento da baixa, mostra tudo
    // direto sem depender de lookup na nota atual (que pode ter mudado depois).
    // Faz lookup só pra descobrir o lote/ref da nota.
    const notasHtml = (p.notas_pagas || []).map(entry => {
      if (!entry) return '';
      // entry pode ser objeto ou (raro) só um número/string
      let numero, valor, pecas;
      if (typeof entry === 'number' || typeof entry === 'string') {
        numero = entry;
      } else if (typeof entry === 'object') {
        numero = entry.nota_numero ?? entry.numero ?? entry.num ?? entry.id;
        valor  = entry.valor ?? entry.valor_nota;
        pecas  = entry.pecas_pagas ?? entry.pecas;
      }
      if (numero == null) {
        return `<span style="color:#c66">? estrutura desconhecida</span>`;
      }
      // Busca lote/ref na nota (Number pra bater '0086' com 86)
      const nota = TODAS_NOTAS_R.find(n => Number(n.numero) === Number(numero));
      const lote = (entry && entry.lote) || (nota && nota.lote) || '?';
      const ref  = (entry && entry.ref)  || (nota && nota.ref)  || '?';
      // Monta a linha
      const pecasStr = (pecas != null) ? ` <span style="color:#666">(${pecas}pç)</span>` : '';
      const valorStr = (valor != null && !isNaN(Number(valor)))
        ? ` <b style="color:#080">${fmtBRL(valor)}</b>` : '';
      return `<span style="white-space:nowrap;display:inline-block"><b>#${escapeHtmlR(numero)}</b> · ${escapeHtmlR(lote)}/${escapeHtmlR(ref)}${pecasStr}${valorStr}</span>`;
    }).join('<br>');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="data">${dataStr(p.data)}</td>
      <td>${escapeHtmlR(p.costureira || '—')}</td>
      <td>${escapeHtmlR(p.forma || '—')}</td>
      <td style="font-size:11px;line-height:1.5">${notasHtml || '—'}</td>
      <td class="num">${fmtBRL(b)}</td>
      <td class="num">${a > 0 ? fmtBRL(a) : '—'}</td>
      <td class="num" style="font-weight:700">${fmtBRL(l)}</td>
      <td style="font-size:11px">${escapeHtmlR(p.observacao || '')}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('pag-t-bruto').textContent = fmtBRL(sB);
  document.getElementById('pag-t-adiant').textContent = fmtBRL(sA);
  document.getElementById('pag-t-liq').textContent = fmtBRL(sL);
  document.getElementById('pag-info').textContent =
    `${list.length} pagamento${list.length!==1?'s':''} · ${fmtBRL(sL)} total`;
}

// =========== ABA RETORNOS ===========
function retornosFiltrados() {
  const fc = document.getElementById('ret-cost').value.trim().toUpperCase();
  const fr = document.getElementById('ret-ref').value.trim().toUpperCase();

  // Cada nota pode gerar 1 ou 2 eventos (chegada_1 e chegada_2)
  const eventos = [];
  TODAS_NOTAS_R.forEach(n => {
    ['chegada_1', 'chegada_2'].forEach((k, idx) => {
      const ch = n[k];
      if (!ch) return;
      const total = Object.values(ch.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
      if (total <= 0) return;
      eventos.push({
        data: ch.data,
        costureira: n.costureira || '',
        lote: n.lote || '',
        ref: n.ref || '',
        chegada: idx + 1,
        qtds: ch.qtds || {},
        total
      });
    });
  });

  let list = eventos;
  if (fc) list = list.filter(e => e.costureira.toUpperCase().includes(fc));
  if (fr) list = list.filter(e => e.ref.toUpperCase().includes(fr));
  return list.sort((a, b) => (toDate(b.data) || 0) - (toDate(a.data) || 0));
}

function buscarRetornos() {
  const list = retornosFiltrados();
  const folha = document.getElementById('ret-folha');
  const vazio = document.getElementById('ret-vazio');
  const tbody = document.getElementById('ret-tbody');

  document.getElementById('ret-data').textContent = 'Data: ' + dataStr(new Date());

  if (!list.length) {
    folha.style.display = 'none';
    vazio.style.display = 'block';
    document.getElementById('ret-info').textContent = 'nada encontrado';
    return;
  }
  vazio.style.display = 'none';
  folha.style.display = 'block';

  tbody.innerHTML = '';
  let totPecas = 0;
  list.forEach(e => {
    totPecas += e.total;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="data">${dataStr(e.data)}</td>
      <td>${escapeHtmlR(e.costureira)}</td>
      <td style="font-family:monospace">${escapeHtmlR(e.lote)}</td>
      <td style="font-family:monospace;font-weight:700">${escapeHtmlR(e.ref)}</td>
      <td style="text-align:center">${e.chegada}ª</td>
      <td class="num">${Number(e.qtds.RN) || '—'}</td>
      <td class="num">${Number(e.qtds.P)  || '—'}</td>
      <td class="num">${Number(e.qtds.M)  || '—'}</td>
      <td class="num">${Number(e.qtds.G)  || '—'}</td>
      <td class="num">${Number(e.qtds.GG) || '—'}</td>
      <td class="num" style="font-weight:700">${e.total}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('ret-info').textContent =
    `${list.length} retorno${list.length!==1?'s':''} · ${totPecas} peças`;
}

document.addEventListener('DOMContentLoaded', init);
