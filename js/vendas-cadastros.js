// Tela de Cadastros de Vendas — clientes, vendedores, produtos/preços de venda

let vClientes = [];
let vVendedores = [];
let vTabelas = [];
let vProdutos = [];
let acaoEdit = null;
let produtoEmEdicao = null;

async function init() {
  await protegerRota();

  document.querySelectorAll('.abas button').forEach(b => {
    b.addEventListener('click', () => trocarAba(b.dataset.aba));
  });

  // Clientes
  ['cli-nome'].forEach(id => document.getElementById(id).addEventListener('input', () => atualizarBtnCli()));
  document.getElementById('cli-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddCliente(); });
  document.getElementById('btn-cli-add').addEventListener('click', tentarAddCliente);
  document.getElementById('cli-busca').addEventListener('input', renderClientes);

  // Vendedores
  document.getElementById('vend-nome').addEventListener('input', () => {
    document.getElementById('btn-vend-add').disabled = !document.getElementById('vend-nome').value.trim();
  });
  document.getElementById('vend-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddVendedor(); });
  document.getElementById('btn-vend-add').addEventListener('click', tentarAddVendedor);

  // Tabelas de preço (faixa compacta no topo da aba de produtos)
  document.getElementById('tabela-nome-novo').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddTabela(); });
  document.getElementById('btn-tabela-add').addEventListener('click', tentarAddTabela);

  // Produtos
  ['prod-ref', 'prod-nome'].forEach(id => document.getElementById(id).addEventListener('input', atualizarBtnProd));
  document.getElementById('prod-ref').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('prod-nome').focus(); });
  document.getElementById('prod-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddProduto(); });
  document.getElementById('btn-prod-add').addEventListener('click', tentarAddProduto);
  document.getElementById('prod-busca').addEventListener('input', renderProdutos);

  // Modal de preços do produto
  document.getElementById('mp-cancelar').addEventListener('click', fecharModalPrecos);
  document.getElementById('mp-salvar').addEventListener('click', salvarModalPrecos);
  document.getElementById('mp-excluir').addEventListener('click', excluirProdutoModal);

  document.getElementById('btn-confirmar-editar').addEventListener('click', () => {
    if (acaoEdit) acaoEdit(document.getElementById('edit-nome').value.trim());
  });

  await carregarTudo();
}

async function carregarTudo() {
  try {
    const [cs, vs, ts, ps] = await Promise.all([
      listarClientes(),
      listarVendedores(),
      listarTabelas(),
      listarProdutosVenda()
    ]);
    vClientes = cs || [];
    vVendedores = vs || [];
    vTabelas = ts || [];
    vProdutos = ps || [];
    renderClientes();
    renderVendedores();
    renderChipsTabelas();
    renderProdutos();
    popularSelectsTabela();
    popularDatalists();
  } catch (e) {
    console.error('Erro carregando cadastros de vendas:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

function popularDatalists() {
  const dlVend = document.getElementById('vend-list');
  dlVend.innerHTML = '';
  vVendedores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.nome;
    dlVend.appendChild(opt);
  });
}

function popularSelectsTabela() {
  const sel = document.getElementById('cli-tabela');
  const atual = sel.value;
  sel.innerHTML = '';
  vTabelas.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
  if (atual && vTabelas.includes(atual)) sel.value = atual;
}

function trocarAba(aba) {
  document.querySelectorAll('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  document.querySelectorAll('.painel').forEach(p => p.classList.toggle('ativo', p.dataset.painel === aba));
}

function atualizarBtnCli() {
  document.getElementById('btn-cli-add').disabled = !document.getElementById('cli-nome').value.trim();
}

// ==== CLIENTES ====
async function tentarAddCliente() {
  const nome = document.getElementById('cli-nome').value.trim();
  if (!nome) return;
  const cliente = {
    nome,
    cnpj: document.getElementById('cli-cnpj').value.trim(),
    cidade: document.getElementById('cli-cidade').value.trim().toUpperCase(),
    estado: document.getElementById('cli-estado').value.trim().toUpperCase(),
    telefone: document.getElementById('cli-telefone').value.trim(),
    email: document.getElementById('cli-email').value.trim(),
    vendedor: document.getElementById('cli-vendedor').value.trim().toUpperCase(),
    tabela_preco: document.getElementById('cli-tabela').value || 'BASE',
    ativo: true
  };
  try {
    if (cliente.vendedor && !vVendedores.some(v => v.nome === cliente.vendedor)) {
      await salvarVendedor(cliente.vendedor);
    }
    await salvarCliente(cliente);
    toast(`✓ ${nome} cadastrado(a)`, 'ok');
    ['cli-nome', 'cli-cnpj', 'cli-cidade', 'cli-estado', 'cli-telefone', 'cli-email', 'cli-vendedor'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('btn-cli-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function toggleCliente(id, novoAtivo) {
  try {
    await salvarCliente({ id, ativo: novoAtivo });
    toast(`Cliente ${novoAtivo ? 'ativado' : 'desativado'}`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirCliente(id, nome) {
  const temPedidos = await clienteTemPedidos(id);
  if (temPedidos) {
    toast(`${nome} tem pedidos associados — não dá pra excluir. Prefira desativar.`, 'err');
    return;
  }
  if (!confirm(`Excluir ${nome} permanentemente?`)) return;
  try {
    await deletarCliente(id);
    toast(`${nome} excluído`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function editarCliente(c) {
  document.getElementById('edit-titulo').textContent = 'Editar cliente';
  document.getElementById('edit-nome').value = c.nome;
  acaoEdit = async (novoNome) => {
    if (!novoNome) return;
    await salvarCliente({ id: c.id, nome: novoNome });
    document.getElementById('modal-editar').classList.remove('visivel');
    toast('✓ Nome atualizado', 'ok');
    await carregarTudo();
  };
  document.getElementById('modal-editar').classList.add('visivel');
}
function renderClientes() {
  const lista = document.getElementById('cli-lista');
  const busca = (document.getElementById('cli-busca').value || '').toUpperCase();
  const filtrados = vClientes.filter(c =>
    (c.nome || '').toUpperCase().includes(busca) ||
    (c.cidade || '').toUpperCase().includes(busca) ||
    (c.vendedor || '').toUpperCase().includes(busca)
  );
  document.getElementById('cli-contagem').textContent = `(${filtrados.length}${busca ? ` de ${vClientes.length}` : ''})`;

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum cliente encontrado</div>';
    return;
  }
  lista.innerHTML = '';
  filtrados.forEach(c => {
    const ativo = c.ativo !== false;
    const item = document.createElement('div');
    item.className = 'item-cad' + (ativo ? '' : ' inativa');
    const infoBits = [c.cidade, c.estado, c.vendedor ? `vend: ${c.vendedor}` : '', c.tabela_preco ? `tab: ${c.tabela_preco}` : '']
      .filter(Boolean).join(' · ');
    item.innerHTML = `
      <div>
        <span class="nome-cad">${c.nome}</span>
        <div class="info-extra">${infoBits || '—'}</div>
      </div>
      <span class="badge ${ativo ? 'ativa' : 'inativa'}">${ativo ? '✓ ativo' : '⊘ inativo'}</span>
      <div class="acoes-btn">
        <button class="btn-mini" data-acao="editar">✎ editar</button>
        <button class="btn-mini" data-acao="toggle">${ativo ? '⊘ desativar' : '✓ ativar'}</button>
        <button class="btn-mini danger" data-acao="excluir">✗ excluir</button>
      </div>
    `;
    item.querySelector('[data-acao="editar"]').addEventListener('click', () => editarCliente(c));
    item.querySelector('[data-acao="toggle"]').addEventListener('click', () => toggleCliente(c.id, !ativo));
    item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirCliente(c.id, c.nome));
    lista.appendChild(item);
  });
}

// ==== VENDEDORES ====
async function tentarAddVendedor() {
  const nome = document.getElementById('vend-nome').value.trim().toUpperCase();
  if (!nome) return;
  try {
    await salvarVendedor(nome);
    toast(`✓ Vendedor ${nome} cadastrado`, 'ok');
    document.getElementById('vend-nome').value = '';
    document.getElementById('btn-vend-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirVendedor(nome) {
  if (!confirm(`Excluir o vendedor ${nome}?`)) return;
  try {
    await deletarVendedor(nome);
    toast(`Vendedor ${nome} excluído`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function renderVendedores() {
  const lista = document.getElementById('vend-lista');
  document.getElementById('vend-contagem').textContent = `(${vVendedores.length})`;
  if (vVendedores.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum vendedor cadastrado ainda</div>';
    return;
  }
  lista.innerHTML = '';
  vVendedores.forEach(v => {
    const item = document.createElement('div');
    item.className = 'item-cad';
    item.innerHTML = `
      <span class="nome-cad">${v.nome}</span>
      <span></span>
      <div class="acoes-btn">
        <button class="btn-mini danger" data-acao="excluir">✗ excluir</button>
      </div>
    `;
    item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirVendedor(v.nome));
    lista.appendChild(item);
  });
}

// ==== TABELAS DE PREÇO (faixa compacta de chips) ====
async function tentarAddTabela() {
  const nome = document.getElementById('tabela-nome-novo').value.trim().toUpperCase();
  if (!nome) return;
  if (vTabelas.includes(nome)) { toast(`Tabela ${nome} já existe`, 'err'); return; }
  try {
    await salvarTabelaSeNova(nome);
    toast(`✓ Tabela ${nome} criada`, 'ok');
    document.getElementById('tabela-nome-novo').value = '';
    vTabelas = await listarTabelas();
    renderChipsTabelas();
    popularSelectsTabela();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function renderChipsTabelas() {
  const cont = document.getElementById('chips-tabelas');
  cont.innerHTML = '';
  vTabelas.forEach(nome => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = nome;
    cont.appendChild(chip);
  });
}

// ==== PRODUTOS (referência + descrição + preço por tabela) ====
function atualizarBtnProd() {
  const ref = document.getElementById('prod-ref').value.trim();
  const nome = document.getElementById('prod-nome').value.trim();
  document.getElementById('btn-prod-add').disabled = !(ref && nome);
}

async function tentarAddProduto() {
  const ref = document.getElementById('prod-ref').value.trim().toUpperCase();
  const nome = document.getElementById('prod-nome').value.trim();
  if (!ref || !nome) return;
  if (vProdutos.some(p => p.ref === ref)) {
    toast(`Já existe um produto com a referência ${ref} — abre ele na lista pra editar`, 'err');
    return;
  }
  try {
    await salvarProdutoNovo(ref, nome);
    toast(`✓ Produto ${ref} cadastrado`, 'ok');
    document.getElementById('prod-ref').value = '';
    document.getElementById('prod-nome').value = '';
    document.getElementById('btn-prod-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

function renderProdutos() {
  const lista = document.getElementById('prod-lista');
  const busca = (document.getElementById('prod-busca').value || '').toUpperCase();
  const filtrados = busca
    ? vProdutos.filter(p => p.ref.includes(busca) || (p.nome || '').toUpperCase().includes(busca))
    : vProdutos;
  document.getElementById('prod-contagem').textContent = `(${filtrados.length}${busca ? ` de ${vProdutos.length}` : ''})`;

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhum produto encontrado</div>';
    return;
  }
  lista.innerHTML = '';
  filtrados.slice(0, 200).forEach(p => {
    const nPrecos = Object.keys(p.precos || {}).length;
    const item = document.createElement('div');
    item.className = 'item-cad';
    item.innerHTML = `
      <div>
        <span class="nome-cad">${p.ref}</span>
        <div class="desc-cad">${p.nome || '<i style="color:var(--text-muted)">sem descrição</i>'}</div>
      </div>
      <span class="badge ${nPrecos > 0 ? 'ativa' : 'inativa'}">${nPrecos}/${vTabelas.length} tabelas</span>
      <div class="acoes-btn">
        <button class="btn-mini" data-acao="precos">✎ preços</button>
      </div>
    `;
    item.querySelector('[data-acao="precos"]').addEventListener('click', () => abrirModalPrecos(p));
    lista.appendChild(item);
  });
  if (filtrados.length > 200) {
    const info = document.createElement('div');
    info.className = 'vazio';
    info.textContent = `... e mais ${filtrados.length - 200}. Use a busca pra filtrar.`;
    lista.appendChild(info);
  }
}

// ==== MODAL DE PREÇOS DE UM PRODUTO ====
function abrirModalPrecos(produto) {
  produtoEmEdicao = produto;
  document.getElementById('mp-ref').textContent = produto.ref;
  document.getElementById('mp-nome').value = produto.nome || '';

  const grid = document.getElementById('mp-precos-grid');
  grid.innerHTML = '';
  vTabelas.forEach(t => {
    const valor = (produto.precos || {})[t];
    const campo = document.createElement('div');
    campo.className = 'campo-preco';
    campo.innerHTML = `
      <label>${t}</label>
      <input type="number" step="0.01" min="0" placeholder="—" data-tabela="${t}" value="${valor ? valor : ''}">
    `;
    grid.appendChild(campo);
  });

  document.getElementById('modal-precos').classList.add('visivel');
}

function fecharModalPrecos() {
  document.getElementById('modal-precos').classList.remove('visivel');
  produtoEmEdicao = null;
}

async function salvarModalPrecos() {
  if (!produtoEmEdicao) return;
  const nome = document.getElementById('mp-nome').value.trim();
  if (!nome) { toast('Preencha a descrição', 'err'); return; }

  const precos = {};
  document.querySelectorAll('#mp-precos-grid input').forEach(input => {
    const v = parseFloat(input.value);
    precos[input.dataset.tabela] = (v && v > 0) ? v : null;
  });

  try {
    await salvarPrecosProduto(produtoEmEdicao.ref, nome, precos);
    toast(`✓ Preços de ${produtoEmEdicao.ref} salvos`, 'ok');
    fecharModalPrecos();
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

async function excluirProdutoModal() {
  if (!produtoEmEdicao) return;
  if (!confirm(`Excluir o produto ${produtoEmEdicao.ref} e todos os preços cadastrados dele?`)) return;
  try {
    await deletarProdutoVenda(produtoEmEdicao.ref);
    toast(`Produto ${produtoEmEdicao.ref} excluído`, 'ok');
    fecharModalPrecos();
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
