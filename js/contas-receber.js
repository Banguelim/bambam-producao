// Tela de Contas a Receber — parcelas geradas quando um Pedido é concluído.
//
// IMPORTANTE (leia antes de mexer): a coleção contas_receber já passou de
// 16 mil documentos (histórico desde 2017, só cresce) e o Firestore
// gratuito só dá 50 mil leituras/dia pro projeto INTEIRO. Por isso essa
// tela NUNCA lê a coleção inteira de cara — só as contas "em aberto"
// (pendentes/vencidas), que são um punhado. O histórico de pagas só é lido
// se alguém realmente pedir (filtro "Só pagas" ou "Todas"), e uma vez lido
// fica guardado aqui (contasPagasCache) pro resto da visita à tela.

let contasPendentes = [];       // sempre carregadas (leve)
let contasPagasCache = null;    // null = ainda não carregado; carrega sob demanda
let agregadosPago = { total: 0, qtd: 0 }; // totais de "pago" mantidos incrementalmente (ver db-vendas.js)
let carregandoPagas = false;

async function init() {
  await protegerRota();
  document.getElementById('f-status').addEventListener('change', onFiltroChange);
  document.getElementById('f-busca').addEventListener('input', render);
  document.getElementById('f-data-de').addEventListener('change', render);
  document.getElementById('f-data-ate').addEventListener('change', render);
  document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
    document.getElementById('f-status').value = 'pendentes';
    document.getElementById('f-busca').value = '';
    document.getElementById('f-data-de').value = '';
    document.getElementById('f-data-ate').value = '';
    render();
  });
  await carregar();
}

async function carregar() {
  try {
    const [pendentes, agregados] = await Promise.all([
      listarContasReceberPendentes(),
      lerAgregadosContas()
    ]);
    contasPendentes = pendentes;
    agregadosPago = agregados;
    render();
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar contas: ' + e.message, 'err');
  }
}

// Filtros que precisam enxergar as pagas ("pago"/"todos") disparam a
// carga pesada (uma vez só, depois fica em cache) — só quando pedido.
async function onFiltroChange() {
  const filtro = document.getElementById('f-status').value;
  if ((filtro === 'pago' || filtro === 'todos') && contasPagasCache === null) {
    if (carregandoPagas) return;
    carregandoPagas = true;
    const corpo = document.getElementById('contas-corpo');
    corpo.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">Carregando histórico de pagas (${agregadosPago.qtd} registros)...</td></tr>`;
    try {
      contasPagasCache = await listarContasReceberPagas();
    } catch (e) {
      toast('Erro ao carregar pagas: ' + e.message, 'err');
      contasPagasCache = null;
    } finally {
      carregandoPagas = false;
    }
  }
  render();
}

function statusReal(c) {
  if (c.status === 'pago') return 'pago';
  return c.data_vencimento && c.data_vencimento < hojeISO() ? 'vencido' : 'aberto';
}

function render() {
  const filtro = document.getElementById('f-status').value;
  const busca = (document.getElementById('f-busca').value || '').toUpperCase();
  const dataDe = document.getElementById('f-data-de').value;
  const dataAte = document.getElementById('f-data-ate').value;
  const precisaPagas = filtro === 'pago' || filtro === 'todos';

  if (precisaPagas && contasPagasCache === null) return; // ainda carregando — onFiltroChange chama render() de novo quando terminar

  const todasContas = precisaPagas ? contasPendentes.concat(contasPagasCache) : contasPendentes;

  const filtradas = todasContas.filter(c => {
    const st = statusReal(c);
    if (filtro === 'aberto' && st !== 'aberto') return false;
    if (filtro === 'vencido' && st !== 'vencido') return false;
    if (filtro === 'pago' && st !== 'pago') return false;
    if (filtro === 'pendentes' && st === 'pago') return false;
    if (dataDe && (!c.data_vencimento || c.data_vencimento < dataDe)) return false;
    if (dataAte && (!c.data_vencimento || c.data_vencimento > dataAte)) return false;
    if (busca) {
      const alvo = `${c.cliente || ''} ${c.pedido_id || ''}`.toUpperCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  // Total do período (só aparece quando tem filtro de data ativo)
  const infoPeriodo = document.getElementById('total-periodo');
  if (dataDe || dataAte) {
    const total = filtradas.reduce((a, c) => a + (statusReal(c) === 'pago' ? (c.valor_pago ?? c.valor ?? 0) : (c.valor || 0)), 0);
    document.getElementById('total-periodo-valor').textContent = formatBRL(total);
    document.getElementById('total-periodo-qtd').textContent = filtradas.length;
    infoPeriodo.style.display = '';
  } else {
    infoPeriodo.style.display = 'none';
  }

  // Estatísticas: aberto/vencido vêm de contasPendentes (sempre completo e
  // leve); pago vem dos agregados (ou do cache, se já foi carregado — fica
  // mais preciso ainda, mas os agregados já bastam).
  let somaAberto = 0, somaVencido = 0;
  contasPendentes.forEach(c => {
    const st = statusReal(c);
    if (st === 'aberto') somaAberto += c.valor || 0;
    else if (st === 'vencido') somaVencido += c.valor || 0;
  });
  const somaPago = contasPagasCache !== null
    ? contasPagasCache.reduce((a, c) => a + (c.valor_pago ?? c.valor ?? 0), 0)
    : agregadosPago.total;
  const qtdPago = contasPagasCache !== null ? contasPagasCache.length : agregadosPago.qtd;
  document.getElementById('s-aberto').textContent = formatBRL(somaAberto);
  document.getElementById('s-vencido').textContent = formatBRL(somaVencido);
  document.getElementById('s-pago').textContent = formatBRL(somaPago);
  document.getElementById('s-total').textContent = contasPendentes.length + qtdPago;

  const corpo = document.getElementById('contas-corpo');
  const vazio = document.getElementById('contas-vazio');
  corpo.innerHTML = '';

  if (filtradas.length === 0) {
    document.getElementById('tabela-contas').style.display = 'none';
    vazio.style.display = 'block';
    return;
  }
  document.getElementById('tabela-contas').style.display = '';
  vazio.style.display = 'none';

  filtradas.forEach(c => {
    const st = statusReal(c);
    const tr = document.createElement('tr');
    tr.className = st === 'vencido' ? 'vencida' : (st === 'pago' ? 'paga' : '');
    tr.innerHTML = `
      <td>${c.pedido_id ? `<a href="pedido-novo.html?pedido=${c.pedido_id}">${c.pedido_id}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="cliente">${c.cliente || '—'}</td>
      <td>${c.parcela_num}/${c.parcelas_total}</td>
      <td>${formatDataBR(c.data_vencimento)}</td>
      <td class="num">${formatBRL(c.valor)}</td>
      <td><span class="badge ${st}">${st === 'pago' ? '✓ pago' : (st === 'vencido' ? '⚠ vencido' : 'aberto')}</span></td>
      <td class="obs"><span class="obs-editavel" contenteditable="true" spellcheck="false" data-id="${c.id}">${c.historico || ''}</span></td>
      <td></td>
    `;
    const obsEl = tr.querySelector('.obs-editavel');
    obsEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); obsEl.blur(); } });
    obsEl.addEventListener('blur', () => salvarObservacaoBtn(c, obsEl));
    const acaoTd = tr.lastElementChild;
    if (st === 'pago') {
      const btn = document.createElement('button');
      btn.className = 'btn-mini';
      btn.textContent = '↺ reabrir';
      btn.addEventListener('click', () => reabrirBtn(c));
      acaoTd.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-mini success';
      btn.textContent = '✓ dar baixa';
      btn.addEventListener('click', () => darBaixaBtn(c));
      acaoTd.appendChild(btn);
    }
    corpo.appendChild(tr);
  });
}

// A conta muda de lado (pendente ↔ paga) — invalida o cache de pagas e
// recarrega. Se o filtro atual precisa ver as pagas, busca de novo na
// hora (onFiltroChange); senão só atualiza pendentes/agregados (leve).
async function recarregarApos() {
  contasPagasCache = null;
  await carregar();
  const filtro = document.getElementById('f-status').value;
  if (filtro === 'pago' || filtro === 'todos') await onFiltroChange();
}

// Salva a observação da parcela ao sair do campo (blur) — só grava se
// mudou, pra não escrever à toa toda vez que alguém só clica e sai.
async function salvarObservacaoBtn(c, obsEl) {
  const texto = obsEl.textContent.trim();
  if (texto === (c.historico || '')) return;
  try {
    await salvarObservacaoConta(c.id, texto);
    c.historico = texto; // mantém o cache local em sincronia
  } catch (e) {
    toast('Erro ao salvar observação: ' + e.message, 'err');
  }
}

async function darBaixaBtn(c) {
  const dataPag = prompt(`Data do pagamento (AAAA-MM-DD):`, hojeISO());
  if (!dataPag) return;
  const valorStr = prompt(`Valor recebido:`, String(c.valor));
  if (!valorStr) return;
  const valor = parseFloat(valorStr.replace(',', '.'));
  if (!valor || valor <= 0) { toast('Valor inválido', 'err'); return; }
  try {
    await darBaixaConta(c.id, dataPag, valor);
    toast(`✓ Baixa registrada — parcela ${c.parcela_num}/${c.parcelas_total} de ${c.cliente}`, 'ok');
    await recarregarApos();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

async function reabrirBtn(c) {
  if (!confirm(`Reabrir a parcela ${c.parcela_num}/${c.parcelas_total} de ${c.cliente}? Ela volta pra "em aberto".`)) return;
  try {
    await reabrirConta(c.id);
    toast('✓ Parcela reaberta', 'ok');
    await recarregarApos();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
