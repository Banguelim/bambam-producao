// Funções de leitura/escrita do módulo de VENDAS/FINANCEIRO no Firestore.
// 100% autônomo — não toca em nada do db.js (produção). Só usa a mesma
// instância do Firestore (db, já criado em firebase-config.js).
// Tudo fica em "vendas_dados/" pra não misturar com "producao_dados/".

const VENDAS = db.collection('vendas_dados');

const colClientes      = () => VENDAS.doc('meta').collection('clientes');
const colVendedores     = () => VENDAS.doc('meta').collection('vendedores');
const colTabelas        = () => VENDAS.doc('meta').collection('tabelas');
const colPrecosVenda    = () => VENDAS.doc('meta').collection('precos_venda');
const colPedidos        = () => VENDAS.doc('op').collection('pedidos');
const colContasReceber  = () => VENDAS.doc('op').collection('contas_receber');

// Tabelas de preço padrão — sempre aparecem na lista, mesmo sem nenhum preço
// cadastrado ainda (o usuário pode criar outras digitando um nome novo)
const TABELAS_PADRAO = ['BASE', 'NT', 'BRAULIO', 'MERCADAO', 'SD', 'ND', 'ESPECIAL', 'MEIA NOTA', 'NOVA'];

// ============ CLIENTES ============
async function listarClientes() {
  const snap = await colClientes().orderBy('nome').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function salvarCliente(c) {
  const id = c.id || colClientes().doc().id;
  await colClientes().doc(id).set({ ...c, id, atualizado_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return id;
}
async function deletarCliente(id) {
  await colClientes().doc(id).delete();
}
async function clienteTemPedidos(id) {
  const snap = await colPedidos().where('cliente_id', '==', id).limit(1).get();
  return !snap.empty;
}

// ---- Bloqueio automático por inatividade (cliente que parou de comprar) ----
// Regra combinada com o pss@bambam.com: sem pedido/compra há mais de 2 anos
// = trava automaticamente igual ao bloqueio de inadimplente (mesmo botão
// 🔒/🔓, mesmo aviso no Pedido Novo). desbloqueado_em reabre uma nova janela
// de 2 anos a partir de quando alguém reativou na mão — assim, depois de
// desbloquear, não trava de novo na hora; só se ficar outros 2 anos sem
// pedido nenhum.
const DIAS_INATIVIDADE_CLIENTE = 730; // ~2 anos

function clienteInativoHaMuitoTempo(c) {
  if (!c || !c.data_ultimo_pedido) return false; // nunca comprou = não é "parou de comprar"
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_INATIVIDADE_CLIENTE);
  const limiteISO = limite.toISOString().slice(0, 10);
  if (c.data_ultimo_pedido >= limiteISO) return false;
  if (c.desbloqueado_em && c.desbloqueado_em >= limiteISO) return false;
  return true;
}

// Lê TODOS os pedidos e TODAS as contas a receber uma única vez pra calcular
// a última compra de cada cliente (data_ultimo_pedido) — precisa disso pra
// popular o histórico já existente, porque salvarPedido() só mantém esse
// campo em dia DAQUI PRA FRENTE. É pesada de propósito (lê contas_receber
// inteira, ~16 mil documentos) — rodar manualmente uma vez (botão em
// admin/importar.html), igual recalcularAgregadosContas().
async function recalcularUltimaCompraClientes() {
  const ultimaPorCliente = {}; // { cliente_id: 'YYYY-MM-DD' }
  const considerar = (clienteId, data) => {
    if (!clienteId || !data) return;
    if (!ultimaPorCliente[clienteId] || data > ultimaPorCliente[clienteId]) ultimaPorCliente[clienteId] = data;
  };

  const pedidosSnap = await colPedidos().get(); // coleção pequena, tudo bem ler inteira
  pedidosSnap.forEach(d => { const p = d.data(); considerar(p.cliente_id, p.data_pedido); });

  const contasSnap = await colContasReceber().get(); // grande — só por isso ser manual/única
  contasSnap.forEach(d => { const c = d.data(); considerar(c.cliente_id, c.data_emissao || c.data_vencimento); });

  const entradas = Object.entries(ultimaPorCliente);
  let n = 0, batch = db.batch(), inBatch = 0;
  for (const [clienteId, data] of entradas) {
    batch.set(colClientes().doc(clienteId), { data_ultimo_pedido: data }, { merge: true });
    n++; inBatch++;
    if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
  }
  if (inBatch > 0) await batch.commit();
  return { clientes: n, pedidosLidos: pedidosSnap.size, contasLidas: contasSnap.size };
}

// ============ VENDEDORES ============
async function listarVendedores() {
  const snap = await colVendedores().orderBy('nome').get();
  return snap.docs.map(d => d.data());
}
async function salvarVendedor(nome) {
  await colVendedores().doc(nome).set({ nome, ativo: true }, { merge: true });
}
async function deletarVendedor(nome) {
  await colVendedores().doc(nome).delete();
}

// ============ TABELAS DE PREÇO (nomes) ============
async function listarTabelas() {
  const snap = await colTabelas().orderBy('nome').get();
  const salvas = snap.docs.map(d => d.data().nome);
  const todas = [...new Set([...TABELAS_PADRAO, ...salvas])];
  return todas.sort();
}
async function salvarTabelaSeNova(nome) {
  const n = (nome || '').trim().toUpperCase();
  if (!n) return;
  await colTabelas().doc(n).set({ nome: n, ativa: true }, { merge: true });
}
// Só remove tabelas criadas pelo usuário (as padrão nem têm doc — ver TABELAS_PADRAO)
async function deletarTabela(nome) {
  await colTabelas().doc(nome).delete();
}

// ============ PREÇOS DE VENDA (ref × tabela) ============
async function precoVendaDe(ref, tabela) {
  const doc = await colPrecosVenda().doc(ref).get();
  if (!doc.exists) return null;
  const precos = doc.data().precos || {};
  return precos[tabela] ?? null;
}
async function salvarPrecoVenda(ref, tabela, valor) {
  await colPrecosVenda().doc(ref).set({
    ref,
    precos: { [tabela]: Number(valor) },
    atualizado_em: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await salvarTabelaSeNova(tabela);
}

// ============ PRODUTOS DE VENDA (ref + descrição + preços) ============
// Busca um produto só (ref + descrição + preços) — usado na tela de Pedido
// pra mostrar a descrição enquanto digita.
async function buscarProdutoVenda(ref) {
  const doc = await colPrecosVenda().doc(ref).get();
  return doc.exists ? doc.data() : null;
}
// Lista de produtos cadastrados — usada na aba Produtos de Cadastros de Vendas.
async function listarProdutosVenda() {
  const snap = await colPrecosVenda().orderBy('ref').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// Cadastra um produto novo (ref ainda não existe). Não usar pra editar um
// já existente — isso apagaria os preços que ele já tinha.
async function salvarProdutoNovo(ref, nome) {
  await colPrecosVenda().doc(ref).set({
    ref, nome, precos: {},
    criado_em: firebase.firestore.FieldValue.serverTimestamp()
  });
}
// Salva a descrição + todos os preços de um produto de uma vez (o modal de
// preços manda TODAS as tabelas conhecidas; valor null remove o preço
// daquela tabela em vez de só deixar de atualizar — undefined/omitido
// preservaria o valor antigo, null fazendo FieldValue.delete() garante que
// uma tabela deixada em branco no formulário realmente some).
async function salvarPrecosProduto(ref, nome, precosMap) {
  const data = { ref, nome, atualizado_em: firebase.firestore.FieldValue.serverTimestamp() };
  Object.entries(precosMap).forEach(([tabela, valor]) => {
    data[`precos.${tabela}`] = (valor && valor > 0) ? Number(valor) : firebase.firestore.FieldValue.delete();
  });
  await colPrecosVenda().doc(ref).update(data);
}
async function deletarProdutoVenda(ref) {
  await colPrecosVenda().doc(ref).delete();
}

// ============ PEDIDOS ============
async function proximoNumeroPedido() {
  const meta = await VENDAS.doc('meta').get();
  const atual = meta.exists ? (meta.data().ultimo_num_pedido || 0) : 0;
  const proximo = atual + 1;
  await VENDAS.doc('meta').set({ ultimo_num_pedido: proximo }, { merge: true });
  return String(proximo).padStart(4, '0');
}
async function salvarPedido(pedido) {
  pedido.atualizado_em = firebase.firestore.FieldValue.serverTimestamp();
  pedido.criado_por = auth.currentUser?.uid || 'anon';
  if (!pedido.numero) {
    pedido.numero = await proximoNumeroPedido();
    pedido.criado_em = firebase.firestore.FieldValue.serverTimestamp();
  }
  await colPedidos().doc(pedido.numero).set(pedido, { merge: true });
  // Mantém a "última compra" do cliente em dia (usada pra detectar
  // inatividade — ver clienteInativoHaMuitoTempo). Só avança a data, nunca
  // volta: editar um pedido antigo não pode fingir que a compra mais
  // recente é aquela.
  if (pedido.cliente_id && pedido.data_pedido) {
    try {
      const cliDoc = await colClientes().doc(pedido.cliente_id).get();
      const atual = cliDoc.exists ? (cliDoc.data().data_ultimo_pedido || '') : '';
      if (pedido.data_pedido > atual) {
        await colClientes().doc(pedido.cliente_id).set({ data_ultimo_pedido: pedido.data_pedido }, { merge: true });
      }
    } catch (e) { console.warn('Não foi possível atualizar a última compra do cliente:', e); }
  }
  return pedido.numero;
}
async function buscarPedido(numero) {
  const doc = await colPedidos().doc(numero).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
async function listarPedidosEmAberto() {
  const snap = await colPedidos().where('status', '==', 'aberto').get();
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  pedidos.sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
  return pedidos;
}
async function listarPedidosConcluidos() {
  const snap = await colPedidos().where('status', '==', 'concluido').get();
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  pedidos.sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
  return pedidos;
}
async function listarPedidosRecentes(limite = 50) {
  const snap = await colPedidos().get();
  const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  pedidos.sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
  return pedidos.slice(0, limite);
}
async function deletarPedido(numero) {
  await colPedidos().doc(numero).delete();
}

// ============ CONTAS A RECEBER ============
// Gera as parcelas de um pedido concluído. dataBase = data do 1º vencimento.
// Cada parcela seguinte vence 30 dias após a anterior (padrão da planilha antiga).
async function gerarContasReceber(pedido, parcelas, dataBase) {
  const total = pedido.total_valor;
  const valorParcela = Math.floor((total / parcelas) * 100) / 100;
  const batch = db.batch();
  let somaParcelas = 0;
  for (let i = 1; i <= parcelas; i++) {
    const venc = new Date(dataBase + 'T00:00:00');
    venc.setDate(venc.getDate() + 30 * (i - 1));
    // última parcela absorve a diferença de arredondamento
    const valor = i === parcelas ? Math.round((total - somaParcelas) * 100) / 100 : valorParcela;
    somaParcelas += valor;
    const doc = colContasReceber().doc();
    batch.set(doc, {
      pedido_id: pedido.numero,
      cliente: pedido.cliente,
      cliente_id: pedido.cliente_id || null,
      parcela_num: i,
      parcelas_total: parcelas,
      valor,
      data_emissao: hojeISO(),
      data_vencimento: venc.toISOString().slice(0, 10),
      status: 'aberto',
      criado_em: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  await batch.commit();
}
// ATENÇÃO: nunca usar colContasReceber().get() sem where() aqui — a coleção
// já passou de 16 mil documentos (histórico desde 2017) e só cresce. Ler ela
// inteira toda vez que alguém abre o Financeiro é o que estourou a cota
// grátis do Firestore. As pagas (a maioria, é histórico) só são lidas quando
// alguém pede explicitamente (filtro "pago"/"todas" na tela) — ver
// listarContasReceberPagas().
async function listarContasReceberPendentes() {
  const snap = await colContasReceber().where('status', '==', 'aberto').get();
  const contas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  contas.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  return contas;
}
// Carga pesada de propósito (lê todo o histórico de pagas) — só chamar
// quando o usuário pedir pra ver as pagas, e guardar o resultado em cache
// no lado da tela (não repetir a cada clique de filtro).
async function listarContasReceberPagas() {
  const snap = await colContasReceber().where('status', '==', 'pago').get();
  const contas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  contas.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  return contas;
}
// Totais acumulados de contas já pagas (soma em R$ e quantidade), mantidos
// incrementalmente a cada baixa/reabertura — pra mostrar o card "pago" do
// Financeiro sem precisar ler as 16 mil contas toda vez. Precisa ser
// zerado/recalculado uma vez (ver recalcularAgregadosContas) pra bater com
// o histórico que já existia antes desse controle existir.
async function lerAgregadosContas() {
  const doc = await VENDAS.doc('meta').get();
  const d = doc.exists ? doc.data() : {};
  return { total: d.contas_pago_total || 0, qtd: d.contas_pago_qtd || 0 };
}
// Varre a coleção inteira UMA VEZ pra (re)calcular os agregados acima a
// partir do que já está pago no Firestore. É a única função aqui que ainda
// lê a coleção inteira de propósito — rodar manualmente (botão em
// admin/importar.html), não em toda abertura de tela.
async function recalcularAgregadosContas() {
  const snap = await colContasReceber().where('status', '==', 'pago').get();
  let total = 0, qtd = 0;
  snap.forEach(d => {
    const c = d.data();
    total += c.valor_pago ?? c.valor ?? 0;
    qtd++;
  });
  total = Math.round(total * 100) / 100;
  await VENDAS.doc('meta').set({ contas_pago_total: total, contas_pago_qtd: qtd }, { merge: true });
  return { total, qtd, lidos: snap.size };
}
async function darBaixaConta(id, dataPagamento, valorPago) {
  const valor = Number(valorPago);
  await colContasReceber().doc(id).update({
    status: 'pago',
    data_pagamento: dataPagamento,
    valor_pago: valor
  });
  await VENDAS.doc('meta').set({
    contas_pago_total: firebase.firestore.FieldValue.increment(valor),
    contas_pago_qtd: firebase.firestore.FieldValue.increment(1)
  }, { merge: true });
}
async function reabrirConta(id) {
  const doc = await colContasReceber().doc(id).get();
  const valorPago = doc.exists ? (doc.data().valor_pago || 0) : 0;
  await colContasReceber().doc(id).update({
    status: 'aberto',
    data_pagamento: firebase.firestore.FieldValue.delete(),
    valor_pago: firebase.firestore.FieldValue.delete()
  });
  await VENDAS.doc('meta').set({
    contas_pago_total: firebase.firestore.FieldValue.increment(-valorPago),
    contas_pago_qtd: firebase.firestore.FieldValue.increment(-1)
  }, { merge: true });
}
// Observação livre por parcela — reaproveita o campo "historico" que já
// vem preenchido nos registros importados da planilha antiga (ex: "NF 4188
// - Parcela 2"), então o histórico velho já aparece editável de cara.
async function salvarObservacaoConta(id, texto) {
  await colContasReceber().doc(id).update({ historico: texto });
}
async function deletarContasDoPedido(numeroPedido) {
  const snap = await colContasReceber().where('pedido_id', '==', numeroPedido).get();
  const batch = db.batch();
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
