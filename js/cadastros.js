// Tela de Cadastros — costureiras, referências, cores, preços, backup

let costureiras = [];
let refs = [];
let cores = [];
let acaoDup = null;  // callback pra ação após modal de duplicidade
let acaoEdit = null; // callback pra ação após modal de editar

async function init() {
  await protegerRota();

  // Trocar de aba
  document.querySelectorAll('.abas button').forEach(b => {
    b.addEventListener('click', () => trocarAba(b.dataset.aba));
  });

  // Costureiras
  document.getElementById('cost-nome').addEventListener('input', () => atualizarBtn('cost'));
  document.getElementById('cost-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddCostureira(); });
  document.getElementById('btn-cost-add').addEventListener('click', tentarAddCostureira);
  document.getElementById('cost-busca').addEventListener('input', filtrarLista);

  // Refs
  document.getElementById('ref-nome').addEventListener('input', () => atualizarBtn('ref'));
  document.getElementById('ref-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddRef(); });
  document.getElementById('btn-ref-add').addEventListener('click', tentarAddRef);
  document.getElementById('ref-busca').addEventListener('input', filtrarLista);

  // Cores
  document.getElementById('cor-nome').addEventListener('input', () => atualizarBtn('cor'));
  document.getElementById('cor-nome').addEventListener('keydown', e => { if (e.key === 'Enter') tentarAddCor(); });
  document.getElementById('btn-cor-add').addEventListener('click', tentarAddCor);
  document.getElementById('cor-busca').addEventListener('input', filtrarLista);

  // Preços
  document.getElementById('btn-buscar-preco').addEventListener('click', buscarPreco);
  document.getElementById('btn-salvar-preco').addEventListener('click', salvarPrecoBtn);

  // Backup
  document.getElementById('btn-backup').addEventListener('click', fazerBackup);

  // Modal duplicidade
  document.getElementById('dup-usar-existente').addEventListener('click', () => {
    document.getElementById('modal-duplicidade').classList.remove('visivel');
    if (acaoDup) acaoDup('existente');
  });
  document.getElementById('dup-cadastrar-novo').addEventListener('click', () => {
    document.getElementById('modal-duplicidade').classList.remove('visivel');
    if (acaoDup) acaoDup('novo');
  });
  document.getElementById('dup-cancelar').addEventListener('click', () => {
    document.getElementById('modal-duplicidade').classList.remove('visivel');
  });

  // Modal editar
  document.getElementById('btn-confirmar-editar').addEventListener('click', () => {
    if (acaoEdit) acaoEdit(document.getElementById('edit-nome').value.trim().toUpperCase());
  });

  // Carregar dados
  await carregarTudo();
}

async function carregarTudo() {
  try {
    const [cs, rs, cores2] = await Promise.all([
      listarCostureiras(),
      listarRefs(),
      listarCoresSalvas()
    ]);
    costureiras = cs || [];
    refs = rs || [];
    cores = cores2 || [];
    renderCostureiras();
    renderRefs();
    renderCores();
    popularDatalists();
  } catch (e) {
    console.error('Erro carregando cadastros:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

function popularDatalists() {
  const dlCost = document.getElementById('cost-preco-list');
  const dlRef = document.getElementById('ref-preco-list');
  dlCost.innerHTML = '';
  dlRef.innerHTML = '';
  costureiras.filter(c => c.ativa !== false).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    dlCost.appendChild(opt);
  });
  refs.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.ref;
    dlRef.appendChild(opt);
  });
}

function trocarAba(aba) {
  document.querySelectorAll('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  document.querySelectorAll('.painel').forEach(p => p.classList.toggle('ativo', p.dataset.painel === aba));
}

function atualizarBtn(tipo) {
  const nome = document.getElementById(tipo + '-nome').value.trim();
  document.getElementById('btn-' + tipo + '-add').disabled = !nome;
}

// Distância de Levenshtein (usada pra detectar duplicidade)
function distancia(a, b) {
  const dp = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Procura duplicidade - retorna null (nada) ou o nome existente parecido
function acharDuplicidade(novo, lista) {
  const upperNovo = novo.toUpperCase();
  // Exato: bloqueio total
  const exato = lista.find(x => x.toUpperCase() === upperNovo);
  if (exato) return { tipo: 'exato', nome: exato };
  // Fuzzy: <=2 edições OU um contém o outro
  for (const x of lista) {
    const upperX = x.toUpperCase();
    if (distancia(upperNovo, upperX) <= 2) return { tipo: 'parecido', nome: x };
    if (upperX.includes(upperNovo) && upperNovo.length >= 3) return { tipo: 'contem', nome: x };
    if (upperNovo.includes(upperX) && upperX.length >= 3) return { tipo: 'contem', nome: x };
  }
  return null;
}

// ==== COSTUREIRAS ====
async function tentarAddCostureira() {
  const nome = document.getElementById('cost-nome').value.trim().toUpperCase();
  if (!nome) return;
  const nomes = costureiras.map(c => c.nome);
  const dup = acharDuplicidade(nome, nomes);
  if (dup && dup.tipo === 'exato') {
    toast(`${dup.nome} já está cadastrada`, 'err');
    return;
  }
  if (dup) {
    mostrarModalDup(nome, dup.nome, async (escolha) => {
      if (escolha === 'novo') {
        await salvarCostureiraNova(nome);
      }
    });
    return;
  }
  await salvarCostureiraNova(nome);
}
async function salvarCostureiraNova(nome) {
  try {
    await salvarCostureira({ nome, ativa: true, saldo_adiantamento: 0 });
    toast(`✓ ${nome} cadastrada`, 'ok');
    document.getElementById('cost-nome').value = '';
    document.getElementById('btn-cost-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function toggleCostureira(nome, novaAtiva) {
  try {
    await salvarCostureira({ nome, ativa: novaAtiva });
    toast(`${nome} ${novaAtiva ? 'ativada' : 'desativada'}`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirCostureira(nome) {
  const temNotas = await costureiraTemNotas(nome);
  if (temNotas) {
    toast(`${nome} tem notas associadas — não dá pra excluir. Prefira desativar.`, 'err');
    return;
  }
  if (!confirm(`Excluir ${nome} permanentemente?\n\nSó dá pra fazer isso porque ela não tem notas.`)) return;
  try {
    await deletarCostureira(nome);
    toast(`${nome} excluída`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

function renderCostureiras() {
  const lista = document.getElementById('cost-lista');
  const busca = (document.getElementById('cost-busca').value || '').toUpperCase();
  const filtradas = costureiras.filter(c => c.nome.includes(busca));
  document.getElementById('cost-contagem').textContent = `(${filtradas.length}${busca ? ` de ${costureiras.length}` : ''})`;

  if (filtradas.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhuma costureira encontrada</div>';
    return;
  }
  lista.innerHTML = '';
  filtradas.forEach(c => {
    const ativa = c.ativa !== false;
    const item = document.createElement('div');
    item.className = 'item-cad' + (ativa ? '' : ' inativa');
    item.innerHTML = `
      <span class="nome-cad">${c.nome}</span>
      <span class="badge ${ativa ? 'ativa' : 'inativa'}">${ativa ? '✓ ativa' : '⊘ inativa'}</span>
      <span class="info-extra">${c.saldo_adiantamento > 0 ? `saldo adiant: ${formatBRL(c.saldo_adiantamento)}` : ''}</span>
      <div class="acoes-btn">
        <button class="btn-mini" data-acao="toggle">${ativa ? '⊘ desativar' : '✓ ativar'}</button>
        <button class="btn-mini danger" data-acao="excluir">✗ excluir</button>
      </div>
    `;
    item.querySelector('[data-acao="toggle"]').addEventListener('click', () => toggleCostureira(c.nome, !ativa));
    item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirCostureira(c.nome));
    lista.appendChild(item);
  });
}

// ==== REFS ====
async function tentarAddRef() {
  const nome = document.getElementById('ref-nome').value.trim().toUpperCase();
  if (!nome) return;
  const nomes = refs.map(r => r.ref);
  const dup = acharDuplicidade(nome, nomes);
  if (dup && dup.tipo === 'exato') {
    toast(`${dup.nome} já está cadastrada`, 'err');
    return;
  }
  if (dup && dup.tipo === 'parecido') {
    mostrarModalDup(nome, dup.nome, async (escolha) => {
      if (escolha === 'novo') await salvarRefNova(nome);
    });
    return;
  }
  await salvarRefNova(nome);
}
async function salvarRefNova(nome) {
  try {
    await salvarRef({ ref: nome, ativa: true });
    toast(`✓ Ref ${nome} cadastrada`, 'ok');
    document.getElementById('ref-nome').value = '';
    document.getElementById('btn-ref-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirRef(ref) {
  const emUso = await refTemUso(ref);
  if (emUso) {
    toast(`Ref ${ref} está em uso em cortes/notas — não dá pra excluir`, 'err');
    return;
  }
  if (!confirm(`Excluir a ref ${ref}?`)) return;
  try {
    await deletarRef(ref);
    toast(`Ref ${ref} excluída`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function renderRefs() {
  const lista = document.getElementById('ref-lista');
  const busca = (document.getElementById('ref-busca').value || '').toUpperCase();
  const filtradas = refs.filter(r => r.ref.includes(busca));
  document.getElementById('ref-contagem').textContent = `(${filtradas.length}${busca ? ` de ${refs.length}` : ''})`;

  if (filtradas.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhuma ref encontrada</div>';
    return;
  }
  lista.innerHTML = '';
  filtradas.slice(0, 200).forEach(r => {
    const item = document.createElement('div');
    item.className = 'item-cad';
    item.innerHTML = `
      <span class="nome-cad">${r.ref}</span>
      <span></span>
      <span></span>
      <div class="acoes-btn">
        <button class="btn-mini danger" data-acao="excluir">✗ excluir</button>
      </div>
    `;
    item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirRef(r.ref));
    lista.appendChild(item);
  });
  if (filtradas.length > 200) {
    const info = document.createElement('div');
    info.className = 'vazio';
    info.textContent = `... e mais ${filtradas.length - 200}. Use a busca pra filtrar.`;
    lista.appendChild(info);
  }
}

// ==== CORES ====
async function tentarAddCor() {
  const nome = document.getElementById('cor-nome').value.trim().toUpperCase();
  if (!nome) return;
  const dup = acharDuplicidade(nome, cores);
  if (dup && dup.tipo === 'exato') {
    toast(`${dup.nome} já cadastrada`, 'err');
    return;
  }
  if (dup) {
    mostrarModalDup(nome, dup.nome, async (escolha) => {
      if (escolha === 'novo') await salvarCorNova2(nome);
    });
    return;
  }
  await salvarCorNova2(nome);
}
async function salvarCorNova2(nome) {
  try {
    await salvarCorSeNova(nome);
    toast(`✓ Cor ${nome} cadastrada`, 'ok');
    document.getElementById('cor-nome').value = '';
    document.getElementById('btn-cor-add').disabled = true;
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function excluirCor(cor) {
  if (!confirm(`Excluir a cor ${cor}?\n\nEla vai sumir do autocomplete. Registros antigos continuam intactos.`)) return;
  try {
    await deletarCor(cor);
    toast(`Cor ${cor} excluída`, 'ok');
    await carregarTudo();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
function renderCores() {
  const lista = document.getElementById('cor-lista');
  const busca = (document.getElementById('cor-busca').value || '').toUpperCase();
  const filtradas = cores.filter(c => c.includes(busca));
  document.getElementById('cor-contagem').textContent = `(${filtradas.length}${busca ? ` de ${cores.length}` : ''})`;

  if (filtradas.length === 0) {
    lista.innerHTML = '<div class="vazio">Nenhuma cor encontrada. Cadastre as principais aqui, ou elas são cadastradas automaticamente ao usar no Novo Corte.</div>';
    return;
  }
  lista.innerHTML = '';
  filtradas.forEach(c => {
    const item = document.createElement('div');
    item.className = 'item-cad';
    item.innerHTML = `
      <span class="nome-cad">${c}</span>
      <span></span>
      <span></span>
      <div class="acoes-btn">
        <button class="btn-mini danger" data-acao="excluir">✗ excluir</button>
      </div>
    `;
    item.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluirCor(c));
    lista.appendChild(item);
  });
}

// ==== PREÇOS ====
async function buscarPreco() {
  const cost = document.getElementById('preco-cost').value.trim().toUpperCase();
  const ref = document.getElementById('preco-ref').value.trim().toUpperCase();
  if (!cost || !ref) { toast('Preencha costureira e ref', 'err'); return; }
  try {
    const p = await precoDe(ref, cost);
    document.getElementById('painel-preco-result').style.display = 'block';
    document.getElementById('preco-info').innerHTML = p !== null && p > 0
      ? `Preço atual de <b>${cost}</b> pra ref <b>${ref}</b>: <b style="color:var(--success)">${formatBRL(p)}/peça</b>`
      : `<b>${cost}</b> ainda não tem preço cadastrado pra ref <b>${ref}</b>. Digite abaixo pra cadastrar:`;
    document.getElementById('preco-valor').value = p && p > 0 ? p.toFixed(2) : '';
    document.getElementById('preco-valor').focus();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}
async function salvarPrecoBtn() {
  const cost = document.getElementById('preco-cost').value.trim().toUpperCase();
  const ref = document.getElementById('preco-ref').value.trim().toUpperCase();
  const v = parseFloat(document.getElementById('preco-valor').value);
  if (!cost || !ref || !v || v <= 0) { toast('Preencha tudo', 'err'); return; }
  try {
    await salvarPreco(ref, cost, v);
    toast(`✓ Preço de ${cost} × ${ref}: ${formatBRL(v)} salvo`, 'ok');
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

// ==== BACKUP ====
async function fazerBackup() {
  const btn = document.getElementById('btn-backup');
  const status = document.getElementById('backup-status');
  btn.disabled = true;
  status.style.color = 'var(--text-muted)';
  status.textContent = '⏳ Carregando dados do banco...';

  try {
    // Baixar TUDO
    const [refsAll, costsAll, precosSnap, cortesSnap, notasSnap, adiantsSnap, pagsSnap, estoqueSnap] = await Promise.all([
      colRefs().get(),
      colCostureiras().get(),
      colPrecos().get(),
      colCortes().get(),
      colNotas().get(),
      colAdiants().get(),
      colPagamentos().get(),
      colEstoque().get()
    ]);

    status.textContent = '⏳ Montando planilha...';

    // Monta CSVs simples (podem ser abertos em Excel)
    const toCSV = (rows) => rows.map(r =>
      r.map(c => {
        const s = String(c ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    ).join('\n');

    let allCsv = '';

    // Costureiras
    allCsv += '### COSTUREIRAS ###\n';
    allCsv += toCSV([['nome', 'ativa', 'saldo_adiantamento']]);
    allCsv += '\n';
    allCsv += toCSV(costsAll.docs.map(d => {
      const c = d.data();
      return [c.nome, c.ativa !== false, c.saldo_adiantamento || 0];
    }));
    allCsv += '\n\n';

    // Refs
    allCsv += '### REFERENCIAS ###\n';
    allCsv += toCSV([['ref', 'ativa']]);
    allCsv += '\n';
    allCsv += toCSV(refsAll.docs.map(d => {
      const r = d.data();
      return [r.ref, r.ativa !== false];
    }));
    allCsv += '\n\n';

    // Preços
    allCsv += '### PRECOS ###\n';
    allCsv += toCSV([['ref', 'costureira', 'preco']]);
    allCsv += '\n';
    allCsv += toCSV(precosSnap.docs.map(d => {
      const p = d.data();
      return [p.ref, p.costureira, p.preco];
    }));
    allCsv += '\n\n';

    // Cortes
    allCsv += '### CORTES ###\n';
    allCsv += toCSV([['id', 'lote', 'refs', 'data_corte', 'total_pecas', 'status', 'itens_json']]);
    allCsv += '\n';
    allCsv += toCSV(cortesSnap.docs.map(d => {
      const c = d.data();
      return [d.id, c.lote, (c.refs || []).join('|'), c.data_corte, c.total_pecas, c.status, JSON.stringify(c.itens || [])];
    }));
    allCsv += '\n\n';

    // Notas
    allCsv += '### NOTAS ###\n';
    allCsv += toCSV([['numero', 'corte_id', 'lote', 'ref', 'costureira', 'data_saida', 'total_saida', 'preco_peca', 'valor_nota', 'status', 'itens_json', 'chegada_1_json', 'chegada_2_json', 'pagamentos_json']]);
    allCsv += '\n';
    allCsv += toCSV(notasSnap.docs.map(d => {
      const n = d.data();
      return [
        n.numero, n.corte_id, n.lote, n.ref, n.costureira, n.data_saida,
        n.total_saida, n.preco_peca, n.valor_nota, n.status,
        JSON.stringify(n.itens || []),
        JSON.stringify(n.chegada_1 || {}),
        JSON.stringify(n.chegada_2 || {}),
        JSON.stringify(n.pagamentos || [])
      ];
    }));
    allCsv += '\n\n';

    // Adiantamentos
    allCsv += '### ADIANTAMENTOS ###\n';
    allCsv += toCSV([['id', 'costureira', 'valor', 'saldo', 'data']]);
    allCsv += '\n';
    allCsv += toCSV(adiantsSnap.docs.map(d => {
      const a = d.data();
      return [d.id, a.costureira, a.valor, a.saldo, a.data];
    }));
    allCsv += '\n\n';

    // Pagamentos
    allCsv += '### PAGAMENTOS ###\n';
    allCsv += toCSV([['id', 'costureira', 'data', 'forma', 'valor_bruto', 'adiantamento_usado', 'valor_liquido', 'observacao', 'notas_json']]);
    allCsv += '\n';
    allCsv += toCSV(pagsSnap.docs.map(d => {
      const p = d.data();
      return [
        d.id, p.costureira, p.data, p.forma,
        p.valor_bruto, p.adiantamento_usado, p.valor_liquido, p.observacao,
        JSON.stringify(p.notas_pagas || [])
      ];
    }));
    allCsv += '\n\n';

    // Estoque
    allCsv += '### ESTOQUE ###\n';
    allCsv += toCSV([['sku', 'ref', 'cor', 'tam', 'qtd', 'ultima_entrada']]);
    allCsv += '\n';
    allCsv += toCSV(estoqueSnap.docs.map(d => {
      const e = d.data();
      return [d.id, e.ref, e.cor, e.tam, e.qtd, e.ultima_entrada];
    }));

    // Download com BOM pro Excel abrir com acentos certinho
    const bom = '\uFEFF';
    const blob = new Blob([bom + allCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bambam-backup-${hojeISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const totais = {
      costureiras: costsAll.size,
      refs: refsAll.size,
      precos: precosSnap.size,
      cortes: cortesSnap.size,
      notas: notasSnap.size,
      adiantamentos: adiantsSnap.size,
      pagamentos: pagsSnap.size,
      estoque: estoqueSnap.size
    };
    status.style.color = 'var(--success)';
    status.innerHTML = `✓ Backup baixado (${Object.entries(totais).map(([k, v]) => `${v} ${k}`).join(' · ')}). O arquivo abre no Excel/LibreOffice.`;
  } catch (e) {
    console.error('Backup erro:', e);
    status.style.color = 'var(--text-danger)';
    status.textContent = '✗ Erro: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

// ==== MODAL DUPLICIDADE ====
function mostrarModalDup(novo, existente, callback) {
  acaoDup = callback;
  document.getElementById('dup-novo').textContent = novo;
  document.getElementById('dup-existente').textContent = existente;
  document.getElementById('dup-usar-nome').textContent = existente;
  document.getElementById('dup-cad-nome').textContent = novo;
  document.getElementById('modal-duplicidade').classList.add('visivel');
}

// ==== BUSCA/FILTRO ====
function filtrarLista(e) {
  const id = e.target.id;
  if (id === 'cost-busca') renderCostureiras();
  else if (id === 'ref-busca') renderRefs();
  else if (id === 'cor-busca') renderCores();
}

document.addEventListener('DOMContentLoaded', init);
