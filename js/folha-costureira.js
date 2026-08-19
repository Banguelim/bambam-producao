// Folha de Conferência da Costureira
// Reproduz a Planilha5 (ROMILDA) do Excel antigo: mostra as notas em aberto
// da costureira selecionada com coluna "saí" (o que ainda falta voltar) e
// coluna "rec" vazia pra anotar à mão o que ela trouxe hoje.
// Botão IMPRIMIR: gera folha limpa direto do navegador.
// Botão EXCEL: baixa CSV no MESMO layout (colunas duplicadas) pra abrir no Excel.

const TAMS_FC = ['RN','P','M','G','GG'];

let TODAS_NOTAS_FC = [];

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();
  document.getElementById('sel-costureira').addEventListener('change', onCostureiraChange);
  document.getElementById('p-data').addEventListener('change', renderFolha);
  document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
  document.getElementById('btn-excel').addEventListener('click', exportarExcel);
  await carregarNotas();
}

async function carregarNotas() {
  const sel = document.getElementById('sel-costureira');
  try {
    const snap = await colNotas().get();
    TODAS_NOTAS_FC = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const abertas = TODAS_NOTAS_FC.filter(n =>
      n.retorno_finalizado !== true && pendenteDaNota(n) > 0);
    const nomes = [...new Set(abertas.map(n => n.costureira).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">— selecione —</option>' +
      nomes.map(nome => {
        const q = abertas.filter(n => n.costureira === nome).length;
        return `<option value="${escapeHtmlFC(nome)}">${escapeHtmlFC(nome)} (${q} nota${q>1?'s':''})</option>`;
      }).join('');
    document.getElementById('info').textContent =
      `${nomes.length} costureira${nomes.length!==1?'s':''} com notas em aberto`;
    document.getElementById('vazio').style.display = 'block';
    console.log(`[folha] ${TODAS_NOTAS_FC.length} notas total, ${abertas.length} em aberto, ${nomes.length} costureiras`);
  } catch (e) {
    console.error('Erro:', e);
    sel.innerHTML = '<option value="">— erro ao carregar —</option>';
    document.getElementById('info').textContent = 'Erro: ' + e.message;
    if (typeof toast === 'function') toast('Erro ao carregar notas: ' + e.message, 'err');
  }
}

function pendenteDaNota(n) {
  const totalSaida = Number(n.total_saida) ||
    (n.itens || []).reduce((a, i) => a + (Number(i.qtd) || 0), 0);
  const c1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const c2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return Math.max(0, totalSaida - c1 - c2);
}

function pendenteTamFC(n, tam) {
  const enviado = (n.itens || [])
    .filter(i => i.tam === tam)
    .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
  const rec1 = Number(n.chegada_1?.qtds?.[tam]) || 0;
  const rec2 = Number(n.chegada_2?.qtds?.[tam]) || 0;
  return Math.max(0, enviado - rec1 - rec2);
}

function onCostureiraChange() {
  renderFolha();
}

function notasDaCostureira(nome) {
  return TODAS_NOTAS_FC
    .filter(n => n.costureira === nome && n.retorno_finalizado !== true && pendenteDaNota(n) > 0)
    .sort((a, b) => {
      const cmp = (a.ref || '').localeCompare(b.ref || '');
      if (cmp !== 0) return cmp;
      const cmp2 = (a.lote || '').localeCompare(b.lote || '');
      if (cmp2 !== 0) return cmp2;
      const da = a.data_saida?.toDate ? a.data_saida.toDate() : new Date(a.data_saida || 0);
      const db = b.data_saida?.toDate ? b.data_saida.toDate() : new Date(b.data_saida || 0);
      return da - db;
    });
}

function renderFolha() {
  const nome = document.getElementById('sel-costureira').value;
  const data = document.getElementById('p-data').value;
  const btnImp = document.getElementById('btn-imprimir');
  const btnExc = document.getElementById('btn-excel');
  const folha = document.getElementById('folha');
  const vazio = document.getElementById('vazio');
  const semNotas = document.getElementById('sem-notas');

  if (!nome) {
    folha.style.display = 'none';
    semNotas.style.display = 'none';
    vazio.style.display = 'block';
    btnImp.disabled = true;
    btnExc.disabled = true;
    return;
  }

  const notas = notasDaCostureira(nome);
  if (notas.length === 0) {
    folha.style.display = 'none';
    vazio.style.display = 'none';
    semNotas.style.display = 'block';
    btnImp.disabled = true;
    btnExc.disabled = true;
    return;
  }

  vazio.style.display = 'none';
  semNotas.style.display = 'none';
  folha.style.display = 'block';
  btnImp.disabled = false;
  btnExc.disabled = false;

  document.getElementById('lbl-costureira').textContent = nome;
  document.getElementById('lbl-data').textContent = formatarDataFC(data);

  const tbody = document.getElementById('tbody-folha');
  tbody.innerHTML = '';
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };

  notas.forEach(n => {
    const tr = document.createElement('tr');
    const dataStr = formatarDataCurtaFC(n.data_saida);
    const teve1 = n.chegada_1 && Object.values(n.chegada_1.qtds || {}).some(v => Number(v) > 0);
    const teve2 = n.chegada_2 && Object.values(n.chegada_2.qtds || {}).some(v => Number(v) > 0);
    let obs = '';
    if (teve2) obs = '2ª parcial';
    else if (teve1) obs = '1ª parcial';

    let html = `
      <td class="ref">${escapeHtmlFC(n.ref || '—')}</td>
      <td class="lote">${escapeHtmlFC(n.lote || '—')}</td>
      <td class="saida">${dataStr}</td>
    `;
    TAMS_FC.forEach(tam => {
      const pend = pendenteTamFC(n, tam);
      totais[tam] += pend;
      if (pend > 0) html += `<td class="sai">${pend}</td><td class="rec"></td>`;
      else html += `<td class="sai vazio">—</td><td class="rec"></td>`;
    });
    html += `<td class="obs">${obs}</td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });

  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);
  document.getElementById('t-rn').textContent = totais.RN || '—';
  document.getElementById('t-p').textContent  = totais.P  || '—';
  document.getElementById('t-m').textContent  = totais.M  || '—';
  document.getElementById('t-g').textContent  = totais.G  || '—';
  document.getElementById('t-gg').textContent = totais.GG || '—';
  document.getElementById('t-geral').textContent = `${totalGeral} pç`;
  document.getElementById('info').textContent =
    `${notas.length} nota${notas.length>1?'s':''} · ${totalGeral} peças a receber`;
}

// Exporta CSV MESMO layout da folha impressa: colunas duplicadas por tam
// (saí + rec vazio). Assim ao abrir no Excel você tem a mesma folha e imprime.
function exportarExcel() {
  const nome = document.getElementById('sel-costureira').value;
  if (!nome) return;
  const notas = notasDaCostureira(nome);
  if (!notas.length) {
    if (typeof toast === 'function') toast('Sem notas pra exportar', 'err');
    return;
  }
  const data = document.getElementById('p-data').value;

  const linhas = [];
  linhas.push([`BAMBAM BABY — FOLHA DE CONFERÊNCIA`]);
  linhas.push([`Costureira: ${nome}`, '', '', '', '', '', '', '', '', '', '', '', `Data: ${formatarDataFC(data)}`]);
  linhas.push([]);
  linhas.push(['REF', 'LOTE', 'SAÍDA',
    'RN','RN', 'P','P', 'M','M', 'G','G', 'GG','GG', 'OBS']);

  const totais = { RN:0, P:0, M:0, G:0, GG:0 };
  notas.forEach(n => {
    const teve1 = n.chegada_1 && Object.values(n.chegada_1.qtds || {}).some(v => Number(v) > 0);
    const teve2 = n.chegada_2 && Object.values(n.chegada_2.qtds || {}).some(v => Number(v) > 0);
    let obs = '';
    if (teve2) obs = '2ª parcial';
    else if (teve1) obs = '1ª parcial';

    const row = [n.ref || '', n.lote || '', formatarDataCurtaFC(n.data_saida)];
    TAMS_FC.forEach(tam => {
      const pend = pendenteTamFC(n, tam);
      totais[tam] += pend;
      row.push(pend > 0 ? pend : '', ''); // valor + coluna vazia pra anotar
    });
    row.push(obs);
    linhas.push(row);
  });

  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);
  linhas.push([]);
  linhas.push(['TOTAL', '', '',
    totais.RN || '', '',
    totais.P  || '', '',
    totais.M  || '', '',
    totais.G  || '', '',
    totais.GG || '', '',
    `${totalGeral} pç`
  ]);

  linhas.push([]);
  linhas.push(['Assinatura da Costureira', '', '', '', '', '', '', 'Assinatura da Empresa']);

  const nomeSanitizado = nome.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  baixarCSVFC(linhas, `folha_${nomeSanitizado}_${hojeISO()}.csv`);
}

function baixarCSVFC(linhas, nomeArquivo) {
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

function formatarDataFC(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function formatarDataCurtaFC(v) {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function escapeHtmlFC(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
