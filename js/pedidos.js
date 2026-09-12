// Tela "Pedidos" — só listagem: pedidos em aberto (topo) e concluídos
// (embaixo), cada um com sua própria busca. Clicar num pedido abre ele
// pra edição/consulta em pedido-novo.html?pedido=NNNN.

let pedidosAbertosCache = [];
let pedidosConcluidosCache = [];
let historicoCompletoCarregado = false;

// CORREÇÃO 12/09/2026 — carregava TODOS os pedidos concluídos (sem limite)
// toda vez que a tela abria — coleção que só cresce, mesmo formato do bug
// já corrigido em Contas a Receber. Agora carrega só os mais recentes por
// padrão; "Carregar histórico completo" (abaixo da lista) busca o resto
// só quando alguém realmente precisar achar um pedido mais antigo.
const LIMITE_CONCLUIDOS_PADRAO = 60;

async function init() {
  await protegerRota();
  document.getElementById('busca-pedido-aberto').addEventListener('input', renderPedidosAbertos);
  document.getElementById('busca-pedido-concluido').addEventListener('input', renderPedidosConcluidos);
  document.getElementById('btn-carregar-todos-concluidos').addEventListener('click', async (e) => {
    e.preventDefault();
    await carregarTodosConcluidos();
  });
  await carregarPedidos();
}

async function carregarPedidos() {
  const contAberto = document.getElementById('lista-pedidos-abertos');
  const contConcluido = document.getElementById('lista-pedidos-concluidos');
  try {
    const [abertos, concluidos] = await Promise.all([
      listarPedidosEmAberto(),
      listarPedidosConcluidosRecentes(LIMITE_CONCLUIDOS_PADRAO)
    ]);
    pedidosAbertosCache = abertos;
    pedidosConcluidosCache = concluidos;
    document.getElementById('lbl-pedidos-abertos-total').textContent = `(${pedidosAbertosCache.length})`;
    atualizarLabelConcluidos();
    renderPedidosAbertos();
    renderPedidosConcluidos();
    // Se vieram menos do que o limite, é porque já é o histórico inteiro —
    // não faz sentido oferecer "carregar mais".
    document.getElementById('aviso-concluidos-parcial').style.display =
      concluidos.length >= LIMITE_CONCLUIDOS_PADRAO ? '' : 'none';
  } catch (e) {
    contAberto.innerHTML = '<div class="vazio-itens">Erro ao carregar</div>';
    contConcluido.innerHTML = '<div class="vazio-itens">Erro ao carregar</div>';
    console.warn(e);
  }
}

function atualizarLabelConcluidos() {
  const sufixo = historicoCompletoCarregado ? '' : '+';
  document.getElementById('lbl-pedidos-concluidos-total').textContent = `(${pedidosConcluidosCache.length}${sufixo})`;
}

async function carregarTodosConcluidos() {
  const link = document.getElementById('btn-carregar-todos-concluidos');
  const textoOriginal = link.textContent;
  link.textContent = 'Carregando...';
  try {
    pedidosConcluidosCache = await listarPedidosConcluidos();
    historicoCompletoCarregado = true;
    atualizarLabelConcluidos();
    renderPedidosConcluidos();
    document.getElementById('aviso-concluidos-parcial').style.display = 'none';
  } catch (e) {
    link.textContent = textoOriginal;
    toast('Erro ao carregar histórico completo: ' + e.message, 'err');
  }
}

function filtrarPedidos(lista, busca) {
  if (!busca) return lista;
  return lista.filter(p =>
    (p.cliente || '').toUpperCase().includes(busca) ||
    (p.numero || '').toUpperCase().includes(busca)
  );
}

// permiteExcluir só é true pra "Pedidos em aberto" — um pedido concluído já
// deu baixa no estoque e gerou contas a receber, apagar ele deixaria isso
// órfão (ver excluirPedido).
function renderListaPedidos(containerId, cache, busca, vazioMsg, permiteExcluir) {
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
      ${permiteExcluir ? `<button class="btn-x-pedido" title="Excluir pedido">🗑</button>` : ''}
    `;
    div.addEventListener('click', () => { location.href = `pedido-novo.html?pedido=${p.numero}`; });
    if (permiteExcluir) {
      div.querySelector('.btn-x-pedido').addEventListener('click', (e) => {
        e.stopPropagation();
        excluirPedido(p.numero);
      });
    }
    cont.appendChild(div);
  });
}

async function excluirPedido(numero) {
  if (!confirm(`Excluir o pedido ${numero} de vez?\n\nNão pode ser desfeito.`)) return;
  try {
    await deletarPedido(numero);
    pedidosAbertosCache = pedidosAbertosCache.filter(p => p.numero !== numero);
    document.getElementById('lbl-pedidos-abertos-total').textContent = `(${pedidosAbertosCache.length})`;
    renderPedidosAbertos();
  } catch (e) {
    alert('Erro ao excluir: ' + e.message);
  }
}

function renderPedidosAbertos() {
  const busca = (document.getElementById('busca-pedido-aberto').value || '').trim().toUpperCase();
  renderListaPedidos('lista-pedidos-abertos', pedidosAbertosCache, busca, 'Nenhum pedido em aberto', true);
}

function renderPedidosConcluidos() {
  const busca = (document.getElementById('busca-pedido-concluido').value || '').trim().toUpperCase();
  renderListaPedidos('lista-pedidos-concluidos', pedidosConcluidosCache, busca, 'Nenhum pedido concluído ainda');
}

document.addEventListener('DOMContentLoaded', init);
