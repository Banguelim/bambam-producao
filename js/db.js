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
async function deletarCostureira(nome) {
  await colCostureiras().doc(nome).delete();
}
// Verifica se a costureira tem notas associadas (pra bloquear delete)
async function costureiraTemNotas(nome) {
  const snap = await colNotas().where('costureira', '==', nome).limit(1).get();
  return !snap.empty;
}
async function deletarRef(ref) {
  await colRefs().doc(ref).delete();
}
async function deletarCor(cor) {
  await colCores().doc(cor).delete();
}
// Verifica se ref tem cortes/notas
async function refTemUso(ref) {
  const cortesSnap = await colCortes().limit(1).get();
  for (const doc of cortesSnap.docs) {
    if ((doc.data().refs || []).includes(ref)) return true;
  }
  const notasSnap = await colNotas().where('ref', '==', ref).limit(1).get();
  return !notasSnap.empty;
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
async function listarCortesRecentes(limite = 100) {
  // Busca todos e ordena no cliente (evita problema com cortes migrados sem criado_em)
  const snap = await colCortes().get();
  const cortes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Ordena por data_corte desc, depois por criado_em se tiver
  cortes.sort((a, b) => {
    const da = a.data_corte || a.criado_em || '';
    const db2 = b.data_corte || b.criado_em || '';
    return db2.localeCompare(da);
  });
  return cortes.slice(0, limite);
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
  const snap = await colNotas().where('costureira', '==', costureira).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(n => !n.status || n.status === 'aberta' || n.status === 'paga_parcial');
}

// Lista TODAS as notas em aberto/paga_parcial (pra tela de retorno)
// Busca tudo e filtra no cliente (evita problema de índice composto no Firestore)
async function listarTodasNotasEmAberto() {
  const snap = await colNotas().get();
  const notas = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(n => !n.status || n.status === 'aberta' || n.status === 'paga_parcial');
  // Ordena por data_saida desc
  notas.sort((a, b) => (b.data_saida || '').localeCompare(a.data_saida || ''));
  return notas;
}

// Atualiza campos específicos de uma nota (ex: chegada_1, chegada_2, costureira)
async function atualizarNota(numero, campos) {
  await colNotas().doc(numero).update(campos);
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
  // Busca tudo e filtra no cliente (evita índice composto)
  const snap = await colAdiants().where('costureira', '==', costureira).get();
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

async function listarAdiantamentosDisponiveis(costureira) {
  const snap = await colAdiants().where('costureira', '==', costureira).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => (a.saldo || 0) > 0)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));  // FIFO — os mais antigos primeiro
}

// Consome saldo de adiantamentos (FIFO) até totalizar o valor pedido
// Retorna array com os ids/valores consumidos: [{id, consumido}]
async function consumirAdiantamentos(costureira, valorTotal) {
  const adiants = await listarAdiantamentosDisponiveis(costureira);
  const consumidos = [];
  let restante = valorTotal;
  for (const a of adiants) {
    if (restante <= 0) break;
    const saldo = a.saldo || 0;
    const usar = Math.min(saldo, restante);
    if (usar > 0) {
      const novoSaldo = saldo - usar;
      await colAdiants().doc(a.id).update({ saldo: novoSaldo });
      consumidos.push({ id: a.id, consumido: usar });
      restante -= usar;
    }
  }
  return { consumidos, faltou: restante };
}

// ============ PAGAMENTOS ============
const colPagamentos = () => PRODUCAO.doc('op').collection('pagamentos');

async function salvarPagamento(pag) {
  pag.criado_em = firebase.firestore.FieldValue.serverTimestamp();
  pag.criado_por = auth.currentUser?.uid || 'anon';
  const doc = await colPagamentos().add(pag);
  return doc.id;
}

// ============ ESTOQUE ============
async function estoqueSKU(ref, cor, tam) {
  const id = `${ref}_${cor}_${tam}`;
  const doc = await colEstoque().doc(id).get();
  return doc.exists ? doc.data() : { ref, cor, tam, qtd: 0, qtd_aguardando: 0 };
}
async function adicionarAoEstoque(ref, cor, tam, qtd, data) {
  const id = `${ref}_${cor}_${tam}`;
  await colEstoque().doc(id).set({
    ref, cor, tam,
    qtd: firebase.firestore.FieldValue.increment(Number(qtd)),
    ultima_entrada: data || hojeISO()
  }, { merge: true });
}
async function listarEstoque() {
  const snap = await colEstoque().get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.ref.localeCompare(b.ref) || a.cor.localeCompare(b.cor));
}
// Notas com 1ª chegada mas pendentes de 2ª chegada (aguardando arremate pra entrar no estoque)
async function listarNotasAguardandoArremate() {
  const snap = await colNotas().get();
  const notas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return notas.filter(n => {
    const chegou1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + v, 0);
    const chegou2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0);
    return chegou1 > 0 && chegou2 < chegou1;
  });
}
