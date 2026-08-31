// Tela de Cadastros de Vendas — clientes, vendedores, tabelas de preço

let vClientes = [];
let vVendedores = [];
let vTabelas = [];
let acaoEdit = null;

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

  // Tabelas de preço
  document.getElementById('tabela-nome-novo').addEventListener('input', () => {
    document.getElementById('btn-tabela-add').disabled = !document.getElementById('tabela-nome-novo').value.trim();
  });
  document.getElementById('tabela-nome-novo').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddTabela(); });
  document.getElementById('btn-tabela-add').addEventListener('click', tentarAddTabela);
  document.getElementById('btn-buscar-preco-venda').addEventListener('click', buscarPrecoVendaBtn);
  document.getElementById('btn-salvar-preco-venda').addEventListener('click', salvarPrecoVendaBtn);
  document.getElementById('btn-nova-tabela').addEventListener('click', criarTabelaNova);

  document.getElementById('btn-confirmar-editar').addEventListener('click', () => {
    if (acaoEdit) acaoEdit(document.getElementById('edit-nome').value.trim());
  });

  await carregarTudo();
}

async function carregarTudo() {
  try {
    const [cs, vs, ts, refs] = await Promise.all([
      listarClientes(),
      listarVendedores(),
      listarTabelas(),
      listarRefs()
    ]);
    vClientes = cs || [];
    vVendedores = vs || [];
    vTabelas = ts || [];
    renderClientes();
    renderVendedores();
    renderTabelas();
    popularSelectsTabela();
    popularDatalists(refs || []);
  } catch (e) {
    console.error('Erro carregando cadastros de vendas:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

function popularDatalists(refs) {
  const dlVend = document.getElementById('vend-list');
  dlVend.innerHTML = '';
  vVendedores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.nome;
    dlVend.appendChild(opt);
  });
  const dlRef = document.getElementById('ref-tab-list');
  dlRef.innerHTML = '';
  refs.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.ref;
    dlRef.appendChild(opt);
  });
}

function popularSelectsTabela() {
  ['cli-tabela', 'tab-nome'].forEach(id => {
    const sel = document.getElementById(id);
    const atual = sel.value;
    sel.innerHTML = '';
    vTabelas.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
    if (atual && vTabelas.includes(atual)) sel.value = atual;
  });
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

// ==== TABELAS DE PREÇO ====
async function tentarAddTabela() {
  const nome = document.getElementById('tabela-nome-novo').value.trim().toUpperCase();
  if (!nome) return;
  if (vTabelas.includes(nome)) { toast(`Tabela ${nome} já existe`, 'err'); return; }
  try {
    await salvarTabelaSeNova(nome);
    toast(`✓ Tabela ${nome} cadastrada`, 'ok');
    document.getElementById('tabela-nome-novo').value = '';
    document.getElementById('btn-tabela-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirTabela(nome) {
  if (!confirm(`Excluir a tabela ${nome}?\n\nOs preços já cadastrados nela ficam guardados, só não aparece mais pra escolher.`)) return;
  try {
    await deletarTabela(nome);
    toast(`Tabela ${nome} excluída`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function renderTabelas() {
  const lista = document.getElementById('tabela-lista');
  document.getElementById('tabela-contagem').textContent = `(${vTabelas.length})`;
  lista.innerHTML = '';
  vTabelas.forEach(nome => {
    const padrao = TABELAS_PADRAO.includes(nome);
    const item = document.createElement('div');
    item.className = 'item-cad';
    item.innerHTML = `
      <span class="nome-cad">${nome}</span>
      <span class="badge ${padrao ? 'inativa' : 'ativa'}">${padrao ? 'padrão' : 'personalizada'}</span>
      <div class="acoes-btn">${padrao ? '' : '<button class="btn-mini danger" data-acao="excluir">✗ excluir</button>'}</div>
    `;
    if (!padrao) item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirTabela(nome));
    lista.appendChild(item);
  });
}

async function criarTabelaNova() {
  const nome = prompt('Nome da nova tabela de preço (ex: ATACADO):');
  if (!nome || !nome.trim()) return;
  const n = nome.trim().toUpperCase();
  try {
    await salvarTabelaSeNova(n);
    toast(`✓ Tabela ${n} criada`, 'ok');
    vTabelas = await listarTabelas();
    popularSelectsTabela();
    renderTabelas();
    document.getElementById('tab-nome').value = n;
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function buscarPrecoVendaBtn() {
  const ref = document.getElementById('tab-ref').value.trim().toUpperCase();
  const tabela = document.getElementById('tab-nome').value;
  if (!ref || !tabela) { toast('Preencha referência e tabela', 'err'); return; }
  try {
    const p = await precoVendaDe(ref, tabela);
    document.getElementById('painel-preco-venda-result').style.display = 'block';
    document.getElementById('preco-venda-info').innerHTML = p !== null && p > 0
      ? `Preço atual da ref <b>${ref}</b> na tabela <b>${tabela}</b>: <b style="color:var(--success)">${formatBRL(p)}/peça</b>`
      : `Ref <b>${ref}</b> ainda não tem preço cadastrado na tabela <b>${tabela}</b>. Digite abaixo pra cadastrar:`;
    document.getElementById('preco-venda-valor').value = p && p > 0 ? p.toFixed(2) : '';
    document.getElementById('preco-venda-valor').focus();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function salvarPrecoVendaBtn() {
  const ref = document.getElementById('tab-ref').value.trim().toUpperCase();
  const tabela = document.getElementById('tab-nome').value;
  const v = parseFloat(document.getElementById('preco-venda-valor').value);
  if (!ref || !tabela || !v || v <= 0) { toast('Preencha tudo', 'err'); return; }
  try {
    await salvarPrecoVenda(ref, tabela, v);
    toast(`✓ Preço de ${ref} × ${tabela}: ${formatBRL(v)} salvo`, 'ok');
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
