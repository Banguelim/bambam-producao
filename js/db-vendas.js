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
async function listarContasReceber() {
  const snap = await colContasReceber().get();
  const contas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  contas.sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''));
  return contas;
}
async function darBaixaConta(id, dataPagamento, valorPago) {
  await colContasReceber().doc(id).update({
    status: 'pago',
    data_pagamento: dataPagamento,
    valor_pago: Number(valorPago)
  });
}
async function reabrirConta(id) {
  await colContasReceber().doc(id).update({
    status: 'aberto',
    data_pagamento: firebase.firestore.FieldValue.delete(),
    valor_pago: firebase.firestore.FieldValue.delete()
  });
}
async function deletarContasDoPedido(numeroPedido) {
  const snap = await colContasReceber().where('pedido_id', '==', numeroPedido).get();
  const batch = db.batch();
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
