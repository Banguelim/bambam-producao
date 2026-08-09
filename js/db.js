// Funções de leitura/escrita no Firestore
// Todos os documentos vão em coleções sob "producao_dados/" pra não misturar
// com o bambam-ponto (que usa "ponto/" ou raiz)

// Coleções
const colRefs        = () => PRODUCAO.doc('meta').collection('refs');
const colCostureiras = () => PRODUCAO.doc('meta').collection('costureiras');
const colPrecos      = () => PRODUCAO.doc('meta').collection('precos');
const colCores       = () => PRODUCAO.doc('meta').collection('cores');
const colCortes      = () => PRODUCAO.doc('op').collection('cortes');
const colNotas       = () => PRODUCAO.doc('op').collection('notas');
const colAdiants     = () => PRODUCAO.doc('op').collection('adiantamentos');
const colEstoque     = () => PRODUCAO.doc('op').collection('estoque');

// ============ CORES ============
async function listarCoresSalvas() {
  try {
    const snap = await colCores().orderBy('nome').get();
    return snap.docs.map(d => d.data().nome);
  } catch (e) {
    console.warn('Não deu pra carregar cores salvas:', e);
    return [];
  }
}
async function salvarCorSeNova(cor) {
  const nome = cor.trim().toUpperCase();
  if (!nome) return;
  try {
    await colCores().doc(nome).set({
      nome,
      criado_em: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('Não deu pra salvar cor:', e);
  }
}

// ============ REFS ============
async function listarRefs() {
  const snap = await colRefs().orderBy('ref').get();
  return snap.docs.map(d => d.data());
}
async function salvarRef(ref) {
  await colRefs().doc(ref.ref).set({ ...ref, atualizado_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

// ============ COSTUREIRAS ============
async function listarCostureiras() {
  const snap = await colCostureiras().orderBy('nome').get();
  return snap.docs.map(d => d.data());
}
async function salvarCostureira(c) {
  await colCostureiras().doc(c.nome).set({ ...c, atualizado_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

// ============ PREÇOS ============
async function precoDe(ref, costureira) {
  const id = `${ref}_${costureira}`;
  const doc = await colPrecos().doc(id).get();
  return doc.exists ? doc.data().preco : null;
}
async function salvarPreco(ref, costureira, preco) {
  const id = `${ref}_${costureira}`;
  await colPrecos().doc(id).set({
    ref, costureira, preco: Number(preco),
    atualizado_em: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ============ CORTES ============
async function salvarCorte(corte) {
  corte.criado_em = firebase.firestore.FieldValue.serverTimestamp();
  corte.criado_por = auth.currentUser?.uid || 'anon';
  const doc = await colCortes().add(corte);
  return doc.id;
}
async function buscarCorte(id) {
  const doc = await colCortes().doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}
async function listarCortesRecentes(limite = 20) {
  const snap = await colCortes().orderBy('criado_em', 'desc').limit(limite).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============ NOTAS ============
async function proximoNumeroNota(peek = false) {
  // Contador simples — pega o maior numero atual e +1
  // Se peek=true, só retorna o próximo sem incrementar (pra mostrar preview)
  const meta = await PRODUCAO.doc('meta').get();
  const atual = meta.exists ? (meta.data().ultimo_num_nota || 0) : 0;
  const proximo = atual + 1;
  if (!peek) {
    await PRODUCAO.doc('meta').set({ ultimo_num_nota: proximo }, { merge: true });
  }
  return String(proximo).padStart(4, '0');
}
async function salvarNota(nota) {
  nota.criado_em = firebase.firestore.FieldValue.serverTimestamp();
  nota.criado_por = auth.currentUser?.uid || 'anon';
  await colNotas().doc(nota.numero).set(nota);
  return nota.numero;
}
async function notasEmAbertoDaCostureira(costureira) {
  const snap = await colNotas()
    .where('costureira', '==', costureira)
    .where('status', 'in', ['aberta', 'paga_parcial'])
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function listarNotasDoCorte(corteId) {
  const snap = await colNotas().where('corte_id', '==', corteId).get();
  const notas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Ordena por número (asc)
  notas.sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
  return notas;
}

async function deletarNota(numero) {
  await colNotas().doc(numero).delete();
}

// ============ ADIANTAMENTOS ============
async function saldoAdiantamento(costureira) {
  const snap = await colAdiants()
    .where('costureira', '==', costureira)
    .where('saldo', '>', 0)
    .get();
  let total = 0;
  snap.forEach(d => total += (d.data().saldo || 0));
  return total;
}
async function registrarAdiantamento(costureira, valor, data) {
  await colAdiants().add({
    costureira, valor: Number(valor), saldo: Number(valor),
    data, criado_em: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ============ ESTOQUE ============
async function estoqueSKU(ref, cor, tam) {
  const id = `${ref}_${cor}_${tam}`;
  const doc = await colEstoque().doc(id).get();
  return doc.exists ? doc.data() : { ref, cor, tam, qtd: 0, qtd_aguardando: 0 };
}
async function adicionarAoEstoque(ref, cor, tam, qtd) {
  const id = `${ref}_${cor}_${tam}`;
  await colEstoque().doc(id).set({
    ref, cor, tam,
    qtd: firebase.firestore.FieldValue.increment(Number(qtd)),
    ultima_entrada: hojeISO()
  }, { merge: true });
}
