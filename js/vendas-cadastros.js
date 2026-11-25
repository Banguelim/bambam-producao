// Tela de Cadastros de Vendas — clientes, vendedores, produtos/preços de venda

let vClientes = [];
let vVendedores = [];
let vTabelas = [];
let vProdutos = [];
let acaoEdit = null;
let produtoEmEdicao = null;
let clienteEmEdicao = null;

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

  // Modal de edição completa do cliente
  document.getElementById('ec-cancelar').addEventListener('click', fecharModalCliente);
  document.getElementById('ec-salvar').addEventListener('click', salvarModalCliente);

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
    popularSelectVendedor();
  } catch (e) {
    console.error('Erro carregando cadastros de vendas:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

// Lista de vendedores do formulário de novo cliente — só aceita vendedor já cadastrado
function popularSelectVendedor() {
  const sel = document.getElementById('cli-vendedor');
  const atual = sel.value;
  sel.innerHTML = '<option value="">— sem vendedor —</option>';
  vVendedores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.nome;
    opt.textContent = v.nome;
    sel.appendChild(opt);
  });
  if (atual && vVendedores.some(v => v.nome === atual)) sel.value = atual;
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
    endereco: document.getElementById('cli-endereco').value.trim(),
    telefone: document.getElementById('cli-telefone').value.trim(),
    email: document.getElementById('cli-email').value.trim(),
    vendedor: document.getElementById('cli-vendedor').value,
    tabela_preco: document.getElementById('cli-tabela').value || 'BASE',
    ativo: true
  };
  try {
    await salvarCliente(cliente);
    toast(`✓ ${nome} cadastrado(a)`, 'ok');
    ['cli-nome', 'cli-cnpj', 'cli-cidade', 'cli-estado', 'cli-endereco', 'cli-telefone', 'cli-email'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cli-vendedor').value = '';
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

// Edição completa do cliente (todos os campos, não só o nome)
function editarCliente(c) {
  clienteEmEdicao = c;
  const set = (id, v) => { document.getElementById(id).value = v || ''; };
  set('ec-nome', c.nome);
  set('ec-cnpj', c.cnpj);
  set('ec-cidade', c.cidade);
  set('ec-estado', c.estado);
  set('ec-endereco', c.endereco);
  set('ec-telefone', c.telefone);
  set('ec-email', c.email);
  document.getElementById('ec-titulo').textContent = 'Editar cliente';

  // Vendedor: só os cadastrados. Se o cliente tem um nome antigo que não está
  // cadastrado (ex: grafia errada da importação), ele aparece marcado pra você trocar.
  const selV = document.getElementById('ec-vendedor');
  selV.innerHTML = '<option value="">— sem vendedor —</option>';
  vVendedores.forEach(v => {
    const o = document.createElement('option');
    o.value = v.nome; o.textContent = v.nome;
    selV.appendChild(o);
  });
  const vendAtual = (c.vendedor || '').trim();
  if (vendAtual && !vVendedores.some(v => v.nome === vendAtual)) {
    const o = document.createElement('option');
    o.value = vendAtual;
    o.textContent = `${vendAtual} (não cadastrado — troque por um da lista)`;
    selV.appendChild(o);
  }
  selV.value = vendAtual;

  const selT = document.getElementById('ec-tabela');
  selT.innerHTML = '';
  const tabs = [...vTabelas];
  if (c.tabela_preco && !tabs.includes(c.tabela_preco)) tabs.push(c.tabela_preco);
  tabs.forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    selT.appendChild(o);
  });
  selT.value = c.tabela_preco || 'BASE';

  document.getElementById('modal-cliente').classList.add('visivel');
}
function fecharModalCliente() {
  document.getElementById('modal-cliente').classList.remove('visivel');
  clienteEmEdicao = null;
}
async function salvarModalCliente() {
  if (!clienteEmEdicao) return;
  const nome = document.getElementById('ec-nome').value.trim();
  if (!nome) { toast('Preencha o nome / razão social', 'err'); return; }
  const dados = {
    id: clienteEmEdicao.id,
    nome,
    cnpj: document.getElementById('ec-cnpj').value.trim(),
    cidade: document.getElementById('ec-cidade').value.trim().toUpperCase(),
    estado: document.getElementById('ec-estado').value.trim().toUpperCase(),
    endereco: document.getElementById('ec-endereco').value.trim(),
    telefone: document.getElementById('ec-telefone').value.trim(),
    email: document.getElementById('ec-email').value.trim(),
    vendedor: document.getElementById('ec-vendedor').value,
    tabela_preco: document.getElementById('ec-tabela').value || 'BASE'
  };
  try {
    await salvarCliente(dados);
    toast(`✓ ${nome} atualizado`, 'ok');
    fecharModalCliente();
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
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
      <div style="display:flex;gap:4px">
        <span class="badge ${ativo ? 'ativa' : 'inativa'}">${ativo ? '✓ ativo' : '⊘ inativo'}</span>
      </div>
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
// Nome comparado sem acento, sem espaço sobrando e em maiúsculas
function normNomeVend(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
// Distância de Levenshtein (quantas letras precisam mudar pra um nome virar o outro)
function distanciaNomes(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}
// Acha um vendedor já cadastrado igual ou parecido com o nome digitado:
// igual, 1-2 letras de diferença (1 se o nome for curto) ou um nome contido no outro
// (ex: KILZE dentro de CARLOS KILZE, SERGIO dentro de SERGIO ZAP).
function vendedorParecido(novo) {
  const n = normNomeVend(novo);
  for (const v of vVendedores) {
    const x = normNomeVend(v.nome);
    if (x === n) return { tipo: 'igual', nome: v.nome };
    const limite = Math.min(n.length, x.length) >= 5 ? 2 : 1;
    if (distanciaNomes(n, x) <= limite) return { tipo: 'parecido', nome: v.nome };
    if (n.length >= 3 && x.length >= 3 && (x.includes(n) || n.includes(x))) return { tipo: 'parecido', nome: v.nome };
  }
  return null;
}

async function tentarAddVendedor() {
  const nome = document.getElementById('vend-nome').value.trim().toUpperCase();
  if (!nome) return;
  const parecido = vendedorParecido(nome);
  if (parecido) {
    toast(parecido.tipo === 'igual'
      ? `O vendedor ${parecido.nome} já está cadastrado`
      : `"${nome}" é parecido com o vendedor já cadastrado "${parecido.nome}" — use o ${parecido.nome} (não cadastro nomes parecidos)`, 'err');
    return;
  }
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
