// Tela de Pedido de venda — cliente + itens (ref/cor/tamanho) + preço.
// "Salvar" grava como rascunho (status aberto), sem mexer em estoque/financeiro.
// "Concluir pedido" trava o pedido, dá baixa no estoque (produção) e gera as
// parcelas em Contas a Receber. Também imprime 2 romaneios: separação
// (detalhado por ref/cor/tamanho) e conferência (resumido por ref).

let pClientes = [];
let pVendedores = [];
let pTabelas = [];
let pedidoItens = [];      // [{ref, cor, qtds:{RN,P,M,G,GG}, qtd, preco, subtotal}]
let numeroPedidoAtual = null;
let statusPedidoAtual = 'aberto';

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();
  sugerirVencimento();

  try {
    const [cs, vs, ts, refs] = await Promise.all([
      listarClientes(), listarVendedores(), listarTabelas(), listarRefs()
    ]);
    pClientes = cs || [];
    pVendedores = vs || [];
    pTabelas = ts || [];
    popularDatalistsCabecalho(refs || []);
  } catch (e) { console.warn('Falha ao carregar cadastros:', e); }

  // Cores: pré-definidas + salvas
  try {
    const dl = document.getElementById('cores-list');
    const jaTem = new Set();
    CORES.forEach(c => { const o = document.createElement('option'); o.value = c; dl.appendChild(o); jaTem.add(c); });
    const salvas = await listarCoresSalvas();
    salvas.forEach(nome => {
      if (!jaTem.has(nome.toUpperCase())) {
        const o = document.createElement('option'); o.value = nome; dl.appendChild(o);
      }
    });
  } catch (e) { console.warn('Cores não carregadas:', e); }

  document.getElementById('p-cliente').addEventListener('change', onClienteChange);
  document.getElementById('it-ref').addEventListener('change', onRefChange);
  document.getElementById('btn-add-item').addEventListener('click', adicionarItem);
  document.getElementById('btn-novo-pedido').addEventListener('click', () => { if (confirm('Descartar e começar um pedido novo?')) limparFormulario(); });
  document.getElementById('btn-salvar-pedido').addEventListener('click', () => salvarPedidoBtn(false));
  document.getElementById('btn-concluir-pedido').addEventListener('click', concluirPedidoBtn);
  document.getElementById('btn-romaneio-separacao').addEventListener('click', () => imprimirRomaneio('separacao'));
  document.getElementById('btn-romaneio-conferencia').addEventListener('click', () => imprimirRomaneio('conferencia'));

  renderItens();
  await carregarPedidosAbertos();

  // Abrir direto se veio ?pedido=NNNN
  const params = new URLSearchParams(location.search);
  const num = params.get('pedido');
  if (num) await abrirPedido(num);
}

function popularDatalistsCabecalho(refs) {
  const dlCli = document.getElementById('clientes-list');
  dlCli.innerHTML = '';
  pClientes.forEach(c => { const o = document.createElement('option'); o.value = c.nome; dlCli.appendChild(o); });

  const dlVend = document.getElementById('vendedores-list');
  dlVend.innerHTML = '';
  pVendedores.forEach(v => { const o = document.createElement('option'); o.value = v.nome; dlVend.appendChild(o); });

  const dlRef = document.getElementById('refs-list');
  dlRef.innerHTML = '';
  refs.forEach(r => { const o = document.createElement('option'); o.value = r.ref; dlRef.appendChild(o); });

  const sel = document.getElementById('p-tabela');
  sel.innerHTML = '';
  pTabelas.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
}

function sugerirVencimento() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  document.getElementById('p-vencimento').value = d.toISOString().slice(0, 10);
}

function onClienteChange() {
  const nome = document.getElementById('p-cliente').value.trim();
  const c = pClientes.find(x => x.nome.toUpperCase() === nome.toUpperCase());
  if (c) {
    document.getElementById('p-vendedor').value = c.vendedor || '';
    if (c.tabela_preco) document.getElementById('p-tabela').value = c.tabela_preco;
  }
}

async function onRefChange() {
  const ref = document.getElementById('it-ref').value.trim().toUpperCase();
  const tabela = document.getElementById('p-tabela').value;
  if (!ref || !tabela) return;
  try {
    const p = await precoVendaDe(ref, tabela);
    if (p !== null && p > 0) document.getElementById('it-preco').value = p.toFixed(2);
  } catch (e) { console.warn('Preço não encontrado:', e); }
}

// ==== ITENS ====
function adicionarItem() {
  const ref = document.getElementById('it-ref').value.trim().toUpperCase();
  const cor = document.getElementById('it-cor').value.trim().toUpperCase();
  const preco = parseFloat(document.getElementById('it-preco').value) || 0;
  const qtds = {
    RN: parseInt(document.getElementById('it-rn').value) || 0,
    P:  parseInt(document.getElementById('it-p').value) || 0,
    M:  parseInt(document.getElementById('it-m').value) || 0,
    G:  parseInt(document.getElementById('it-g').value) || 0,
    GG: parseInt(document.getElementById('it-gg').value) || 0
  };
  const qtdTotal = Object.values(qtds).reduce((a, v) => a + v, 0);

  if (!ref || !cor) { toast('Preencha ref e cor', 'err'); return; }
  if (qtdTotal === 0) { toast('Preencha ao menos uma quantidade', 'err'); return; }
  if (!preco) { toast('Preencha o preço (ou cadastre a ref na tabela de preço)', 'err'); return; }

  // Salva cor nova pro autocomplete, se for o caso
  salvarCorSeNova(cor);

  const existente = pedidoItens.find(i => i.ref === ref && i.cor === cor && i.preco === preco);
  if (existente) {
    TAMS.forEach(t => existente.qtds[t] = (existente.qtds[t] || 0) + qtds[t]);
    existente.qtd = Object.values(existente.qtds).reduce((a, v) => a + v, 0);
    existente.subtotal = Math.round(existente.qtd * existente.preco * 100) / 100;
  } else {
    pedidoItens.push({ ref, cor, qtds, qtd: qtdTotal, preco, subtotal: Math.round(qtdTotal * preco * 100) / 100 });
  }

  ['it-cor', 'it-rn', 'it-p', 'it-m', 'it-g', 'it-gg', 'it-preco'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('it-ref').value = '';
  document.getElementById('it-ref').focus();
  renderItens();
}

function removerItem(idx) {
  pedidoItens.splice(idx, 1);
  renderItens();
}

function renderItens() {
  const corpo = document.getElementById('itens-corpo');
  const tabela = document.getElementById('tabela-itens');
  const vazio = document.getElementById('itens-vazio');
  corpo.innerHTML = '';

  if (pedidoItens.length === 0) {
    tabela.style.display = 'none';
    vazio.style.display = 'block';
  } else {
    tabela.style.display = '';
    vazio.style.display = 'none';
    pedidoItens.forEach((it, idx) => {
      const tamsStr = TAMS.filter(t => it.qtds[t] > 0).map(t => `${t}:${it.qtds[t]}`).join(' ');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ref">${it.ref}</td>
        <td>${it.cor}</td>
        <td class="qtds">${tamsStr}</td>
        <td class="num">${it.qtd}</td>
        <td class="num preco">${formatBRL(it.preco)}</td>
        <td class="num sub">${formatBRL(it.subtotal)}</td>
        <td><button class="btn-x" title="remover">×</button></td>
      `;
      tr.querySelector('.btn-x').addEventListener('click', () => removerItem(idx));
      corpo.appendChild(tr);
    });
  }

  const totalPecas = pedidoItens.reduce((a, i) => a + i.qtd, 0);
  const totalValor = Math.round(pedidoItens.reduce((a, i) => a + i.subtotal, 0) * 100) / 100;
  document.getElementById('lbl-total-pecas').textContent = totalPecas;
  document.getElementById('lbl-total-valor').textContent = formatBRL(totalValor);
}

function totalPedido() {
  return Math.round(pedidoItens.reduce((a, i) => a + i.subtotal, 0) * 100) / 100;
}

// ==== MONTAR / SALVAR PEDIDO ====
function montarPedidoObj() {
  const nome = document.getElementById('p-cliente').value.trim();
  const cliObj = pClientes.find(c => c.nome.toUpperCase() === nome.toUpperCase());
  return {
    numero: numeroPedidoAtual || null,
    cliente: nome,
    cliente_id: cliObj ? cliObj.id : null,
    vendedor: document.getElementById('p-vendedor').value.trim().toUpperCase(),
    tabela_preco: document.getElementById('p-tabela').value,
    data_pedido: document.getElementById('p-data').value,
    itens: pedidoItens,
    total_pecas: pedidoItens.reduce((a, i) => a + i.qtd, 0),
    total_valor: totalPedido(),
    parcelas: parseInt(document.getElementById('p-parcelas').value) || 1,
    data_vencimento_base: document.getElementById('p-vencimento').value,
    status: statusPedidoAtual
  };
}

function validarCabecalho() {
  const cliente = document.getElementById('p-cliente').value.trim();
  const data = document.getElementById('p-data').value;
  if (!cliente) { toast('Escolha ou digite o cliente', 'err'); return false; }
  if (!data) { toast('Preencha a data', 'err'); return false; }
  if (pedidoItens.length === 0) { toast('Adicione ao menos um item', 'err'); return false; }
  return true;
}

async function salvarPedidoBtn(silencioso) {
  if (!validarCabecalho()) return;
  const btn = document.getElementById('btn-salvar-pedido');
  btn.disabled = true;
  try {
    const pedido = montarPedidoObj();
    pedido.status = 'aberto';
    const numero = await salvarPedido(pedido);
    numeroPedidoAtual = numero;
    statusPedidoAtual = 'aberto';
    atualizarCabecalhoNumero();
    if (!silencioso) toast(`✓ Pedido ${numero} salvo`, 'ok');
    await carregarPedidosAbertos();
    if (!(pedido.vendedor && pVendedores.some(v => v.nome === pedido.vendedor))) {
      if (pedido.vendedor) await salvarVendedor(pedido.vendedor);
    }
    return numero;
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function concluirPedidoBtn() {
  if (!validarCabecalho()) return;
  const parcelas = parseInt(document.getElementById('p-parcelas').value) || 1;
  const vencBase = document.getElementById('p-vencimento').value;
  if (!vencBase) { toast('Preencha a data do 1º vencimento', 'err'); return; }
  if (!confirm(`Concluir este pedido vai:\n\n• Dar baixa no estoque das peças\n• Gerar ${parcelas} parcela(s) em Contas a Receber\n\nDepois de concluído não dá mais pra editar os itens. Confirma?`)) return;

  const btn = document.getElementById('btn-concluir-pedido');
  btn.disabled = true;
  try {
    // 1) Garante que está salvo primeiro (pra ter número)
    const numero = numeroPedidoAtual || await salvarPedidoBtn(true);
    if (!numero) throw new Error('Não foi possível salvar o pedido');

    // 2) Baixa no estoque de produção (uma chamada por ref/cor/tamanho)
    const dataPedido = document.getElementById('p-data').value;
    for (const it of pedidoItens) {
      for (const t of TAMS) {
        const q = it.qtds[t] || 0;
        if (q > 0) await adicionarAoEstoque(it.ref, it.cor, t, -q, dataPedido);
      }
    }

    // 3) Marca concluído
    const pedido = montarPedidoObj();
    pedido.numero = numero;
    pedido.status = 'concluido';
    pedido.concluido_em = firebase.firestore.FieldValue.serverTimestamp();
    await salvarPedido(pedido);
    numeroPedidoAtual = numero;
    statusPedidoAtual = 'concluido';
    atualizarCabecalhoNumero();

    // 4) Gera contas a receber (parcelas)
    await gerarContasReceber({ numero, cliente: pedido.cliente, cliente_id: pedido.cliente_id, total_valor: pedido.total_valor }, parcelas, vencBase);

    toast(`✓ Pedido ${numero} concluído — estoque baixado e ${parcelas} parcela(s) geradas`, 'ok grande');
    await carregarPedidosAbertos();
  } catch (e) {
    console.error(e);
    toast('Erro ao concluir: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

function atualizarCabecalhoNumero() {
  document.getElementById('lbl-num-pedido').textContent = numeroPedidoAtual || 'novo';
  document.getElementById('lbl-status-pedido').textContent = statusPedidoAtual === 'concluido' ? '✓ concluído' : 'rascunho';
  const bloqueado = statusPedidoAtual === 'concluido';
  document.getElementById('btn-add-item').disabled = bloqueado;
  document.getElementById('btn-salvar-pedido').style.display = bloqueado ? 'none' : '';
  document.getElementById('btn-concluir-pedido').style.display = bloqueado ? 'none' : '';
}

function limparFormulario() {
  numeroPedidoAtual = null;
  statusPedidoAtual = 'aberto';
  pedidoItens = [];
  document.getElementById('p-cliente').value = '';
  document.getElementById('p-vendedor').value = '';
  document.getElementById('p-tabela').selectedIndex = 0;
  document.getElementById('p-data').value = hojeISO();
  document.getElementById('p-parcelas').value = 1;
  sugerirVencimento();
  atualizarCabecalhoNumero();
  renderItens();
  history.replaceState(null, '', location.pathname);
}

// ==== LISTA DE PEDIDOS EM ABERTO ====
async function carregarPedidosAbertos() {
  const cont = document.getElementById('lista-pedidos-abertos');
  try {
    const pedidos = await listarPedidosEmAberto();
    if (pedidos.length === 0) {
      cont.innerHTML = '<div class="vazio-itens">Nenhum pedido em aberto</div>';
      return;
    }
    cont.innerHTML = '';
    pedidos.forEach(p => {
      const div = document.createElement('div');
      div.className = 'item-pedido';
      div.innerHTML = `
        <span class="num">${p.numero}</span>
        <span class="cli">${p.cliente || '—'}</span>
        <span>${formatDataBR(p.data_pedido)}</span>
        <span>${p.total_pecas || 0} pç</span>
        <span class="val">${formatBRL(p.total_valor || 0)}</span>
      `;
      div.addEventListener('click', () => abrirPedido(p.numero));
      cont.appendChild(div);
    });
  } catch (e) {
    cont.innerHTML = '<div class="vazio-itens">Erro ao carregar</div>';
    console.warn(e);
  }
}

async function abrirPedido(numero) {
  try {
    const p = await buscarPedido(numero);
    if (!p) { toast(`Pedido ${numero} não encontrado`, 'err'); return; }
    numeroPedidoAtual = p.numero;
    statusPedidoAtual = p.status || 'aberto';
    document.getElementById('p-cliente').value = p.cliente || '';
    document.getElementById('p-vendedor').value = p.vendedor || '';
    if (p.tabela_preco) document.getElementById('p-tabela').value = p.tabela_preco;
    document.getElementById('p-data').value = p.data_pedido || hojeISO();
    document.getElementById('p-parcelas').value = p.parcelas || 1;
    document.getElementById('p-vencimento').value = p.data_vencimento_base || '';
    pedidoItens = (p.itens || []).map(i => ({ ...i }));
    atualizarCabecalhoNumero();
    renderItens();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    toast('Erro ao abrir pedido: ' + e.message, 'err');
  }
}

// ==== ROMANEIOS (impressão) ====
function imprimirRomaneio(tipo) {
  if (pedidoItens.length === 0) { toast('Adicione itens antes de imprimir', 'err'); return; }
  const cliente = document.getElementById('p-cliente').value.trim() || '—';
  const data = formatDataBR(document.getElementById('p-data').value);
  const numero = numeroPedidoAtual || '(rascunho)';

  if (tipo === 'separacao') {
    document.getElementById('rs-num').textContent = numero;
    document.getElementById('rs-cliente').textContent = cliente;
    document.getElementById('rs-data').textContent = data;
    const corpo = document.getElementById('rs-corpo');
    corpo.innerHTML = '';
    let total = 0;
    pedidoItens.forEach(it => {
      total += it.qtd;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ref">${it.ref}</td><td>${it.cor}</td>
        <td>${it.qtds.RN || ''}</td><td>${it.qtds.P || ''}</td><td>${it.qtds.M || ''}</td>
        <td>${it.qtds.G || ''}</td><td>${it.qtds.GG || ''}</td><td><b>${it.qtd}</b></td>
      `;
      corpo.appendChild(tr);
    });
    document.getElementById('rs-total').textContent = total;
    dispararImpressao('folha-separacao');
  } else {
    document.getElementById('rc-num').textContent = numero;
    document.getElementById('rc-cliente').textContent = cliente;
    document.getElementById('rc-data').textContent = data;
    const porRef = {};
    pedidoItens.forEach(it => { porRef[it.ref] = (porRef[it.ref] || 0) + it.qtd; });
    const corpo = document.getElementById('rc-corpo');
    corpo.innerHTML = '';
    let total = 0;
    Object.keys(porRef).sort().forEach(ref => {
      total += porRef[ref];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="ref">${ref}</td><td><b>${porRef[ref]}</b></td>`;
      corpo.appendChild(tr);
    });
    document.getElementById('rc-total').textContent = total;
    dispararImpressao('folha-conferencia');
  }
}

function dispararImpressao(idFolha) {
  const folha = document.getElementById(idFolha);
  folha.classList.add('imprimindo');
  setTimeout(() => {
    window.print();
    setTimeout(() => folha.classList.remove('imprimindo'), 300);
  }, 50);
}

document.addEventListener('DOMContentLoaded', init);
