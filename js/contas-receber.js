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
let selecionadas = new Set();   // ids das parcelas marcadas pra juntar
// CNPJ e vendedor vêm do cadastro do cliente (a parcela só guarda cliente_id
// e o nome). Clientes são ~200 docs — leve.
let clientesPorId = new Map();
let clientesPorNome = new Map();

async function init() {
  await protegerRota();
  document.getElementById('f-status').addEventListener('change', onFiltroChange);
  document.getElementById('f-busca').addEventListener('input', render);
  document.getElementById('f-data-de').addEventListener('change', render);
  document.getElementById('f-data-ate').addEventListener('change', render);
  document.getElementById('f-vendedor').addEventListener('change', render);
  document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
    document.getElementById('f-status').value = 'pendentes';
    document.getElementById('f-busca').value = '';
    document.getElementById('f-data-de').value = '';
    document.getElementById('f-data-ate').value = '';
    document.getElementById('f-vendedor').value = '';
    render();
  });
  document.getElementById('btn-desmarcar').addEventListener('click', () => { selecionadas.clear(); render(); });
  document.getElementById('btn-juntar').addEventListener('click', juntarSelecionadasBtn);
  await Promise.all([carregar(), carregarClientes()]);
}

async function carregarClientes() {
  try {
    const clientes = await listarClientes();
    clientesPorId = new Map(clientes.map(c => [String(c.id), c]));
    clientesPorNome = new Map(clientes.map(c => [(c.nome || '').toUpperCase(), c]));
    const vendedores = [...new Set(clientes.map(c => (c.vendedor || '').trim().toUpperCase()).filter(Boolean))].sort();
    const sel = document.getElementById('f-vendedor');
    sel.innerHTML = '<option value="">Todos</option>' +
      vendedores.map(v => `<option value="${v}">${v}</option>`).join('');
    render();
  } catch (e) {
    console.warn('Não deu pra carregar clientes (busca por CNPJ/vendedor):', e);
  }
}

function clienteDaConta(c) {
  return clientesPorId.get(String(c.cliente_id)) || clientesPorNome.get((c.cliente || '').toUpperCase()) || null;
}
const soDigitos = s => String(s || '').replace(/\D/g, '');

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
    if (!confirm(`Ver as pagas vai ler o histórico inteiro (${agregadosPago.qtd.toLocaleString('pt-BR')} contas).\n` +
                 `O limite grátis do Firebase é 50.000 leituras por dia para TODO o sistema (inclusive o ponto).\n\nContinuar?`)) {
      document.getElementById('f-status').value = 'pendentes';
      render();
      return;
    }
    carregandoPagas = true;
    const corpo = document.getElementById('contas-corpo');
    corpo.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted)">Carregando histórico de pagas (${agregadosPago.qtd} registros)...</td></tr>`;
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
  const vendedor = document.getElementById('f-vendedor').value;
  const buscaDigitos = soDigitos(busca);
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
    const cli = clienteDaConta(c);
    if (vendedor && (cli?.vendedor || '').trim().toUpperCase() !== vendedor) return false;
    if (busca) {
      const alvo = `${c.cliente || ''} ${c.pedido_id || ''} ${(c.pedidos_agrupados || []).join(' ')}`.toUpperCase();
      // CNPJ: compara só os números (6+ pra não confundir com nº de pedido),
      // então "31.299.087" e "31299087" acham o mesmo
      const cnpj = soDigitos(c.cnpj || cli?.cnpj || c.cliente_id);
      const achouCnpj = buscaDigitos.length >= 6 && cnpj.includes(buscaDigitos);
      if (!alvo.includes(busca) && !achouCnpj) return false;
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

  // Marcadas que sumiram da lista (baixa, outra aba etc.) saem da seleção
  const idsPendentes = new Set(contasPendentes.map(c => c.id));
  [...selecionadas].forEach(id => { if (!idsPendentes.has(id)) selecionadas.delete(id); });
  renderBarraJuntar();

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
    const juntada = (c.agrupa_ids || []).length > 0;
    const pedidosAgr = c.pedidos_agrupados || [];
    const celPedido = c.pedido_id
      ? `<a href="pedido-novo.html?pedido=${c.pedido_id}">${c.pedido_id}</a>`
      : (pedidosAgr.length
        ? pedidosAgr.map(p => `<a href="pedido-novo.html?pedido=${p}">${p}</a>`).join(', ')
        : '<span style="color:var(--text-muted)">—</span>');
    const jurosInfo = c.juros > 0
      ? `<span class="juros-info">${formatBRL(c.valor_original)} + ${formatBRL(c.juros)} juros</span>` : '';
    tr.innerHTML = `
      <td>${st !== 'pago' ? `<input type="checkbox" class="chk-juntar" ${selecionadas.has(c.id) ? 'checked' : ''}>` : ''}</td>
      <td>${celPedido}</td>
      <td class="cliente">${c.cliente || '—'}${(() => {
        const cli = clienteDaConta(c);
        const info = [c.cnpj || cli?.cnpj, cli?.vendedor && 'vend. ' + cli.vendedor].filter(Boolean).join(' · ');
        return info ? `<span class="juros-info" style="color:var(--text-muted)">${info}</span>` : '';
      })()}</td>
      <td>${juntada ? `🔗 junção (${c.agrupa_ids.length})` : `${c.parcela_num}/${c.parcelas_total}`}</td>
      <td>${formatDataBR(c.data_vencimento)}${c.vencimento_original && c.vencimento_original !== c.data_vencimento
        ? `<span class="juros-info" style="color:var(--text-muted)">era ${formatDataBR(c.vencimento_original)}</span>` : ''}</td>
      <td class="num">${formatBRL(c.valor)}${jurosInfo}</td>
      <td><span class="badge ${st}">${st === 'pago' ? '✓ pago' : (st === 'vencido' ? '⚠ vencido' : 'aberto')}</span></td>
      <td class="obs"><span class="obs-editavel" contenteditable="true" spellcheck="false" data-id="${c.id}">${c.historico || ''}</span></td>
      <td></td>
    `;
    const obsEl = tr.querySelector('.obs-editavel');
    obsEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); obsEl.blur(); } });
    obsEl.addEventListener('blur', () => salvarObservacaoBtn(c, obsEl));
    const chk = tr.querySelector('.chk-juntar');
    if (chk) chk.addEventListener('change', () => {
      if (chk.checked) selecionadas.add(c.id); else selecionadas.delete(c.id);
      renderBarraJuntar();
    });
    const acaoTd = tr.lastElementChild;
    acaoTd.className = 'acoes';
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
      const btnJuros = document.createElement('button');
      btnJuros.className = 'btn-mini warn';
      btnJuros.textContent = c.juros > 0 ? '✎ juros' : '+ juros';
      btnJuros.addEventListener('click', () => jurosBtn(c));
      acaoTd.appendChild(btnJuros);
      const btnProrr = document.createElement('button');
      btnProrr.className = 'btn-mini';
      btnProrr.textContent = '📅 prorrogar';
      btnProrr.addEventListener('click', () => prorrogarBtn(c));
      acaoTd.appendChild(btnProrr);
      if (juntada) {
        const btnSep = document.createElement('button');
        btnSep.className = 'btn-mini';
        btnSep.textContent = '↺ separar';
        btnSep.title = 'Desfaz a junção: as parcelas originais voltam pra lista';
        btnSep.addEventListener('click', () => separarBtn(c));
        acaoTd.appendChild(btnSep);
      }
    }
    corpo.appendChild(tr);
  });
}

// A conta muda de lado (pendente ↔ paga). NÃO relê o histórico de pagas
// (16 mil+ docs) — isso estourava a cota a cada baixa com filtro "pagas"/
// "todas". O cache de pagas é ajustado aqui mesmo (ajustarCache) e só as
// pendentes (leve) são relidas do Firestore.
async function recarregarApos(ajustarCache) {
  if (contasPagasCache !== null && ajustarCache) ajustarCache(contasPagasCache);
  await carregar();
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
    await recarregarApos(cache => {
      cache.push({ ...c, status: 'pago', data_pagamento: dataPag, valor_pago: valor });
    });
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

// Juros por atraso: sugere 2% ao mês proporcional aos dias de atraso (só
// sugestão — a pessoa digita o valor combinado). Substitui os juros
// anteriores; 0 tira os juros e volta pro valor original.
async function jurosBtn(c) {
  const original = c.valor_original ?? c.valor ?? 0;
  const dias = c.data_vencimento
    ? Math.max(0, Math.floor((new Date(hojeISO() + 'T00:00:00') - new Date(c.data_vencimento + 'T00:00:00')) / 86400000))
    : 0;
  const sugestao = c.juros > 0 ? c.juros : Math.round(original * 0.02 * (dias / 30) * 100) / 100;
  const msg = `${c.cliente} — parcela de ${formatBRL(original)}` +
    (dias > 0 ? `, vencida há ${dias} dia(s).` : ', ainda não vencida.') +
    `\n\nValor dos JUROS a acrescentar (R$):` +
    (dias > 0 && !(c.juros > 0) ? `\n(sugestão: 2% ao mês pelos dias de atraso — pode trocar)` : '') +
    `\nDigite 0 pra tirar os juros.`;
  const str = prompt(msg, String(sugestao.toFixed(2)));
  if (str === null) return;
  const juros = parseFloat(str.replace(',', '.'));
  if (isNaN(juros) || juros < 0) { toast('Valor inválido', 'err'); return; }
  try {
    const campos = await aplicarJurosConta(c, juros);
    Object.assign(c, campos);
    toast(juros > 0
      ? `✓ Juros de ${formatBRL(campos.juros)} — parcela agora ${formatBRL(campos.valor)}`
      : `✓ Juros retirados — parcela volta pra ${formatBRL(campos.valor)}`, 'ok');
    render();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

async function prorrogarBtn(c) {
  const sugestao = new Date((c.data_vencimento > hojeISO() ? c.data_vencimento : hojeISO()) + 'T00:00:00');
  sugestao.setDate(sugestao.getDate() + 30);
  const str = prompt(
    `${c.cliente} — parcela de ${formatBRL(c.valor)}, vence em ${formatDataBR(c.data_vencimento)}.\n\n` +
    `Nova data de vencimento (DD/MM/AAAA):`,
    formatDataBR(sugestao.toISOString().slice(0, 10)));
  if (!str) return;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) { toast('Data inválida — use DD/MM/AAAA (ex: 15/11/2026)', 'err'); return; }
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const teste = new Date(iso + 'T00:00:00');
  if (isNaN(teste) || teste.toISOString().slice(0, 10) !== iso) { toast('Data inválida', 'err'); return; }
  try {
    Object.assign(c, await prorrogarConta(c, iso));
    toast(`✓ Vencimento de ${c.cliente} prorrogado pra ${formatDataBR(iso)}`, 'ok');
    contasPendentes.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
    render();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

function contasSelecionadas() {
  return contasPendentes.filter(c => selecionadas.has(c.id));
}

function renderBarraJuntar() {
  const sel = contasSelecionadas();
  const barra = document.getElementById('barra-juntar');
  barra.classList.toggle('visivel', sel.length > 0);
  if (!sel.length) return;
  const clientes = [...new Set(sel.map(c => c.cliente))];
  document.getElementById('juntar-qtd').textContent = sel.length;
  document.getElementById('juntar-cliente').textContent = clientes.length === 1 ? clientes[0] : `${clientes.length} clientes diferentes ⚠`;
  document.getElementById('juntar-total').textContent = formatBRL(sel.reduce((a, c) => a + (c.valor || 0), 0));
}

async function juntarSelecionadasBtn() {
  const sel = contasSelecionadas();
  if (sel.length < 2) { toast('Marque pelo menos 2 parcelas pra juntar', 'err'); return; }
  const clientes = new Set(sel.map(c => (c.cliente || '').toUpperCase()));
  if (clientes.size > 1) { toast('Só dá pra juntar parcelas do MESMO cliente', 'err'); return; }
  const total = sel.reduce((a, c) => a + (c.valor || 0), 0);
  const venc = prompt(
    `Juntar ${sel.length} parcelas de ${sel[0].cliente} numa só, de ${formatBRL(total)}.\n` +
    `As parcelas marcadas saem da lista (dá pra desfazer com "↺ separar").\n\n` +
    `Vencimento da nova parcela (AAAA-MM-DD):`, hojeISO());
  if (!venc) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) { toast('Data inválida — use AAAA-MM-DD', 'err'); return; }
  try {
    await juntarContas(sel, venc);
    selecionadas.clear();
    toast(`✓ ${sel.length} parcelas juntadas numa só de ${formatBRL(total)}`, 'ok');
    await carregar();
  } catch (e) {
    toast('Erro ao juntar: ' + e.message, 'err');
  }
}

async function separarBtn(c) {
  if (!confirm(`Desfazer a junção de ${c.cliente} (${formatBRL(c.valor)})?\n\nAs ${c.agrupa_ids.length} parcelas originais voltam pra lista e esta parcela juntada é apagada.` +
    (c.juros > 0 ? `\n\n⚠ Os juros de ${formatBRL(c.juros)} lançados nela se perdem.` : ''))) return;
  try {
    await separarJuncaoContas(c);
    toast('✓ Junção desfeita — parcelas originais de volta', 'ok');
    await carregar();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

async function reabrirBtn(c) {
  if (!confirm(`Reabrir a parcela ${c.parcela_num}/${c.parcelas_total} de ${c.cliente}? Ela volta pra "em aberto".`)) return;
  try {
    await reabrirConta(c.id);
    toast('✓ Parcela reaberta', 'ok');
    await recarregarApos(cache => {
      const i = cache.findIndex(x => x.id === c.id);
      if (i >= 0) cache.splice(i, 1);
    });
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
