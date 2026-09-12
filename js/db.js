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

// Lista TODOS os cortes ainda não 100% designados (sem limite de quantidade) —
// usado na tela de Designação. CORREÇÃO 31/08/2026: antes usava
// listarCortesRecentes(200), que corta pros 200 mais recentes ANTES de
// filtrar os já designados — um corte pendente mais antigo que os 200
// últimos ficava invisível na lista pra sempre. Aqui filtra primeiro,
// então nada pendente se perde.
async function listarCortesPendentes() {
  const snap = await colCortes().get();
  const pendentes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.status !== 'designado_total');
  pendentes.sort((a, b) => (b.data_corte || '').localeCompare(a.data_corte || ''));
  return pendentes;
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
// NOVO 12/09/2026 — diz se já rodou a migração que preenche
// `retorno_completo` em TODAS as notas antigas (botão em Cadastros).
// Enquanto não rodar, a tela de Retorno usa o modo antigo (lê a coleção
// inteira) pra nunca esconder uma nota antiga ainda aberta. Depois que
// rodar, passa a usar a consulta rápida (`where retorno_completo == false`).
async function retornoCompletoMigrado() {
  try {
    const meta = await PRODUCAO.doc('meta').get();
    return meta.exists && meta.data().retorno_completo_migrado === true;
  } catch (e) {
    console.warn('Erro checando migração retorno_completo:', e);
    return false;  // na dúvida, usa o modo seguro (lê tudo)
  }
}

// Mesma ideia acima, mas pro campo `tem_chegada` — usado pelo Arremate.
// As duas migrações rodam juntas no mesmo botão em Cadastros, mas ficam
// como flags separadas (cada tela só depende da sua).
async function temChegadaMigrado() {
  try {
    const meta = await PRODUCAO.doc('meta').get();
    return meta.exists && meta.data().tem_chegada_migrado === true;
  } catch (e) {
    console.warn('Erro checando migração tem_chegada:', e);
    return false;
  }
}

async function notasEmAbertoDaCostureira(costureira) {
  const snap = await colNotas().where('costureira', '==', costureira).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(n => !n.status || n.status === 'aberta' || n.status === 'paga_parcial');
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

// Registra um pagamento (1+ notas juntas + adiantamento opcional) de forma
// ATÔMICA numa única transação do Firestore.
//
// Por quê: o fluxo antigo salvava em 3 passos soltos (consumir adiantamento
// → gravar recibo → dar baixa em cada nota), calculando o valor "restante"
// de cada nota a partir do que já estava carregado na tela. Isso abria 2
// brechas de pagamento em duplicidade:
//   1) Tela desatualizada — se a nota tivesse sido paga em outra aba, ou a
//      chegada de peças mudasse depois do carregamento, o valor sugerido
//      não descontava o que já tinha sido pago (podia pagar a nota de novo,
//      inteira, em vez de só a diferença).
//   2) Falha no meio do caminho (rede cai depois de gravar o recibo mas
//      antes de dar baixa em todas as notas) deixava tudo pela metade,
//      abrindo margem pra alguém tentar pagar de novo achando que não deu certo.
//
// Agora: cada nota é RELIDA de dentro da transação (o dado mais fresco que
// existe no servidor no exato momento de gravar) e a gravação é RECUSADA se
// o valor pedido passar do saldo que realmente resta nela. Recibo + baixa
// nas notas + consumo de adiantamento são gravados juntos — ou vai tudo, ou
// não vai nada.
async function registrarPagamentoTransacional({ costureira, data, forma, observacao, notasPagas, usoAdiantDesejado }) {
  const pagRef = colPagamentos().doc();
  const notaRefsInfo = notasPagas.map(np => ({ ref: colNotas().doc(np.nota_numero), np }));

  // Descobre quais docs de adiantamento existem pra essa costureira (só os
  // IDs). O saldo de cada um é relido de dentro da transação — então mesmo
  // que esta lista fique um pouco desatualizada, o valor usado é sempre o real.
  let adiantRefsInfo = [];
  if (usoAdiantDesejado > 0) {
    const snap = await colAdiants().where('costureira', '==', costureira).get();
    adiantRefsInfo = snap.docs
      .map(d => ({ ref: d.ref, dataOrdenacao: d.data().data || '' }))
      .sort((a, b) => a.dataOrdenacao.localeCompare(b.dataOrdenacao)); // FIFO — mais antigos primeiro
  }

  return db.runTransaction(async (tx) => {
    // ---- 1) LER tudo primeiro (regra do Firestore: toda leitura antes de qualquer escrita numa tx) ----
    const notaSnaps = await Promise.all(notaRefsInfo.map(x => tx.get(x.ref)));
    const adiantSnaps = await Promise.all(adiantRefsInfo.map(x => tx.get(x.ref)));

    // ---- 2) VALIDAR contra o saldo real de cada nota (trava a duplicidade) ----
    const atualizacoesNota = [];
    // NOVO 10/09/2026 — grava lote/ref junto de cada nota paga no recibo.
    // Motivo: o histórico de pagamentos (pagamento-historico.js) precisava
    // ler a coleção INTEIRA de notas toda vez só pra mostrar lote/ref na
    // tela — com o lote/ref já vindo salvo aqui, não precisa mais disso pra
    // pagamentos novos (some com uma fonte grande de leituras desperdiçadas).
    const notasPagasComLoteRef = [];
    notaSnaps.forEach((snap, i) => {
      const { np } = notaRefsInfo[i];
      if (!snap.exists) throw new Error(`Nota #${np.nota_numero} não foi encontrada — recarregue a tela.`);
      const nota = snap.data();
      const pagamentosAntes = nota.pagamentos || [];
      const totalPagoAntes = pagamentosAntes.reduce((a, p) => a + (p.valor || 0), 0);
      const defeitos = Number(nota.defeito_retorno_total) || 0;
      const pecasEsperadas = Math.max(0, (nota.total_saida || 0) - defeitos);
      const precoUsado = np.preco_peca != null ? np.preco_peca : (nota.preco_peca || 0);
      const valorNota = (nota.total_saida || 0) * precoUsado;
      const restante = valorNota - totalPagoAntes;

      // Trava principal: não deixa gravar um pagamento que passe do saldo
      // que realmente resta nesta nota (1 centavo de folga pra arredondamento).
      if (np.valor > restante + 0.01) {
        throw new Error(
          `Nota #${np.nota_numero} (${nota.lote}/${nota.ref}): valor de ${formatBRL(np.valor)} passa do saldo ` +
          `restante (${formatBRL(Math.max(restante, 0))}). Já foi pago ${formatBRL(totalPagoAntes)} desta nota — ` +
          `isso parece pagamento em duplicidade. Recarregue a tela e confira antes de tentar de novo.`
        );
      }

      const novosPagamentos = [...pagamentosAntes, { pag_id: pagRef.id, data, valor: np.valor, pecas: np.pecas_pagas }];
      const pecasPagasTotal = novosPagamentos.reduce((a, p) => a + (p.pecas || 0), 0);
      const novoStatus = (pecasEsperadas > 0 && pecasPagasTotal >= pecasEsperadas) ? 'paga_total' : 'paga_parcial';

      atualizacoesNota.push({
        ref: notaRefsInfo[i].ref,
        campos: { pagamentos: novosPagamentos, status: novoStatus, preco_peca: precoUsado, valor_nota: valorNota }
      });
      notasPagasComLoteRef.push({ ...np, lote: nota.lote, ref: nota.ref });
    });

    // ---- 3) Consumir adiantamento (FIFO) até o valor desejado ----
    const consumidos = [];
    let restanteAdiant = usoAdiantDesejado;
    adiantSnaps.forEach((snap, i) => {
      if (restanteAdiant <= 0 || !snap.exists) return;
      const saldo = snap.data().saldo || 0;
      const usar = Math.min(saldo, restanteAdiant);
      if (usar > 0) {
        tx.update(adiantRefsInfo[i].ref, { saldo: saldo - usar });
        consumidos.push({ id: snap.id, consumido: usar });
        restanteAdiant -= usar;
      }
    });
    const adiantEfetivo = usoAdiantDesejado - restanteAdiant;
    const valorBruto = notasPagas.reduce((a, np) => a + np.valor, 0);
    const valorLiquido = valorBruto - adiantEfetivo;

    // ---- 4) ESCREVER tudo junto: recibo + baixa nas notas + saldo de adiantamento ----
    const pag = {
      data, costureira, forma, observacao,
      notas_pagas: notasPagasComLoteRef,
      valor_bruto: valorBruto,
      adiantamento_usado: adiantEfetivo,
      valor_liquido: valorLiquido,
      adiantamentos_consumidos: consumidos,
      criado_em: firebase.firestore.FieldValue.serverTimestamp(),
      criado_por: auth.currentUser?.uid || 'anon'
    };
    tx.set(pagRef, pag);
    atualizacoesNota.forEach(u => tx.update(u.ref, u.campos));

    return { pagId: pagRef.id, pag };
  });
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
