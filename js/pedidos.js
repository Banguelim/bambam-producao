// Tela "Pedidos" — só listagem: pedidos em aberto (topo) e concluídos
// (embaixo), cada um com sua própria busca. Clicar num pedido abre ele
// pra edição/consulta em pedido-novo.html?pedido=NNNN.

let pedidosAbertosCache = [];
let pedidosConcluidosCache = [];

async function init() {
  await protegerRota();
  document.getElementById('busca-pedido-aberto').addEventListener('input', renderPedidosAbertos);
  document.getElementById('busca-pedido-concluido').addEventListener('input', renderPedidosConcluidos);
  await carregarPedidos();
}

async function carregarPedidos() {
  const contAberto = document.getElementById('lista-pedidos-abertos');
  const contConcluido = document.getElementById('lista-pedidos-concluidos');
  try {
    const [abertos, concluidos] = await Promise.all([
      listarPedidosEmAberto(),
      listarPedidosConcluidos()
    ]);
    pedidosAbertosCache = abertos;
    pedidosConcluidosCache = concluidos;
    document.getElementById('lbl-pedidos-abertos-total').textContent = `(${pedidosAbertosCache.length})`;
    document.getElementById('lbl-pedidos-concluidos-total').textContent = `(${pedidosConcluidosCache.length})`;
    renderPedidosAbertos();
    renderPedidosConcluidos();
  } catch (e) {
    contAberto.innerHTML = '<div class="vazio-itens">Erro ao carregar</div>';
    contConcluido.innerHTML = '<div class="vazio-itens">Erro ao carregar</div>';
    console.warn(e);
  }
}

function filtrarPedidos(lista, busca) {
  if (!busca) return lista;
  return lista.filter(p =>
    (p.cliente || '').toUpperCase().includes(busca) ||
    (p.numero || '').toUpperCase().includes(busca)
  );
}

function renderListaPedidos(containerId, cache, busca, vazioMsg) {
  const cont = document.getElementById(containerId);
  const filtrados = filtrarPedidos(cache, busca);

  if (cache.length === 0) {
    cont.innerHTML = `<div class="vazio-itens">${vazioMsg}</div>`;
    return;
  }
  if (filtrados.length === 0) {
    cont.innerHTML = `<div class="vazio-itens">Nenhum pedido encontrado com "${busca}"</div>`;
    return;
  }
  cont.innerHTML = '';
  filtrados.forEach(p => {
    const div = document.createElement('div');
    div.className = 'item-pedido';
    div.innerHTML = `
      <span class="num">${p.numero}</span>
      <span class="cli">${p.cliente || '—'}</span>
      <span>${formatDataBR(p.data_pedido)}</span>
      <span>${p.total_pecas || 0} pç</span>
      <span class="val">${formatBRL(p.total_valor || 0)}</span>
    `;
    div.addEventListener('click', () => { location.href = `pedido-novo.html?pedido=${p.numero}`; });
    cont.appendChild(div);
  });
}

function renderPedidosAbertos() {
  const busca = (document.getElementById('busca-pedido-aberto').value || '').trim().toUpperCase();
  renderListaPedidos('lista-pedidos-abertos', pedidosAbertosCache, busca, 'Nenhum pedido em aberto');
}

function renderPedidosConcluidos() {
  const busca = (document.getElementById('busca-pedido-concluido').value || '').trim().toUpperCase();
  renderListaPedidos('lista-pedidos-concluidos', pedidosConcluidosCache, busca, 'Nenhum pedido concluído ainda');
}

document.addEventListener('DOMContentLoaded', init);
