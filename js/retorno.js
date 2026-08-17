// Tela de Retorno — costureira volta com peças

let todasNotasAbertas = [];  // cache das notas em aberto
let notasFinalizadas = [];    // notas com retorno 100% completo
let notaAtual = null;         // nota selecionada

async function init() {
  await protegerRota();
  document.getElementById('p-data-chegada').value = hojeISO();

  // Popular datalists de costureiras (dois: filtro e trocar)
  try {
    const cs = await listarCostureiras();
    const dl1 = document.getElementById('costureiras-list');
    const dl2 = document.getElementById('trocar-cost-list');
    cs.forEach(c => {
      const opt1 = document.createElement('option');
      opt1.value = c.nome;
      dl1.appendChild(opt1);
      const opt2 = document.createElement('option');
      opt2.value = c.nome;
      dl2.appendChild(opt2);
    });
  } catch (e) { console.warn('Costureiras não carregadas:', e); }

  // Carregar todas as notas em aberto
  await carregarNotasAbertas();

  // Handlers
  document.getElementById('filtro-cost').addEventListener('input', onFiltroChange);
  document.getElementById('filtro-lote').addEventListener('input', onFiltroChange);
  document.getElementById('x-cost').addEventListener('click', () => limparCampo('filtro-cost'));
  document.getElementById('x-lote').addEventListener('click', () => limparCampo('filtro-lote'));

  document.getElementById('btn-fechar').addEventListener('click', fecharPainel);
  document.getElementById('btn-registrar').addEventListener('click', registrarChegada);
  document.getElementById('btn-trocar').addEventListener('click', abrirModalTrocar);
  document.getElementById('btn-devolver').addEventListener('click', devolverParaDesignacao);
  document.getElementById('btn-confirmar-troca').addEventListener('click', confirmarTroca);
  document.getElementById('trocar-cost-nova').addEventListener('input', atualizarBtnTroca);
  document.getElementById('trocar-cost-nova').addEventListener('change', atualizarBtnTroca);
  document.getElementById('btn-confirmar-defeito').addEventListener('click', confirmarDefeito);

  // Botões de defeito são adicionados dinamicamente — usar delegação
  document.getElementById('grade').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-defeito');
    if (!btn) return;
    abrirModalDefeito(btn.dataset.tam, parseInt(btn.dataset.max));
  });
}

async function carregarNotasAbertas() {
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">carregando...</span>';
  try {
    // Buscar TODAS as notas (abertas + finalizadas)
    const snap = await colNotas().get();
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    todas.sort((a, b) => (b.data_saida || '').localeCompare(a.data_saida || ''));

    // Separar: finalizada = retorno 100% completo (totalChegou >= total_saida) E não reaberta
    todasNotasAbertas = todas.filter(n => {
      if (n.retorno_finalizado) return false; // marcada como finalizada manualmente
      const chegou = calcularTotalChegou(n);
      return chegou < (n.total_saida || 0); // ainda tem pendente
    });

    notasFinalizadas = todas.filter(n => {
      if (n.retorno_finalizado) return true; // marcada manualmente
      const chegou = calcularTotalChegou(n);
      return chegou >= (n.total_saida || 0) && chegou > 0; // 100% chegou
    });

    // Popular datalist de lotes
    const dlLotes = document.getElementById('lotes-list');
    dlLotes.innerHTML = '';
    const lotesUnicos = new Set();
    todasNotasAbertas.forEach(n => lotesUnicos.add(`${n.lote}/${n.ref}`));
    [...lotesUnicos].sort().forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      dlLotes.appendChild(opt);
    });

    renderChips();
    renderFinalizadas();
  } catch (e) {
    console.error('[retorno] ERRO:', e);
    chips.innerHTML = `<span style="color:var(--text-danger);font-size:12px">Erro: ${e.message}</span>`;
    toast('Erro ao carregar: ' + e.message, 'err');
  }
}

function limparCampo(id) {
  document.getElementById(id).value = '';
  document.getElementById(id.replace('filtro-', 'x-')).classList.remove('visivel');
  onFiltroChange();
}

function onFiltroChange() {
  const c = document.getElementById('filtro-cost').value.trim().toUpperCase();
  const l = document.getElementById('filtro-lote').value.trim().toUpperCase();
  document.getElementById('x-cost').classList.toggle('visivel', !!c);
  document.getElementById('x-lote').classList.toggle('visivel', !!l);
  renderChips();
  renderFinalizadas(); // atualiza também o segundo plano
}

function renderChips() {
  const c = document.getElementById('filtro-cost').value.trim().toUpperCase();
  const l = document.getElementById('filtro-lote').value.trim().toUpperCase();
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '';

  let filtradas = todasNotasAbertas;
  if (c) filtradas = filtradas.filter(n => (n.costureira || '').toUpperCase().includes(c));
  if (l) filtradas = filtradas.filter(n => `${n.lote}/${n.ref}`.toUpperCase().includes(l));

  document.getElementById('contador-chips').textContent = `(${filtradas.length})`;

  if (filtradas.length === 0) {
    if (todasNotasAbertas.length === 0) {
      document.getElementById('estado-vazio').style.display = 'block';
      chips.style.display = 'none';
      return;
    }
    chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Nenhuma nota encontrada com esse filtro</span>';
    return;
  }
  document.getElementById('estado-vazio').style.display = 'none';
  chips.style.display = 'flex';

  filtradas.forEach(n => {
    const totalChegou = calcularTotalChegou(n);
    const isParcial = totalChegou > 0 && totalChegou < n.total_saida;
    const chip = document.createElement('div');
    chip.className = 'chip-nota';
    // Destaque: LOTE/REF sempre em primeiro. Cost e nota como meta
    chip.innerHTML = `
      <span class="dot ${isParcial ? 'parcial' : ''}"></span>
      <span>${n.lote}/${n.ref}</span>
      <span class="meta">${n.costureira} · ${n.total_saida}pç · #${n.numero}</span>
    `;
    chip.addEventListener('click', () => abrirNota(n));
    chips.appendChild(chip);
  });
}

function renderFinalizadas() {
  const bloco = document.getElementById('bloco-finalizadas');
  const lista = document.getElementById('lista-finalizadas');
  const contador = document.getElementById('contador-finalizadas');

  if (!bloco) return;

  const c = document.getElementById('filtro-cost').value.trim().toUpperCase();
  const l = document.getElementById('filtro-lote').value.trim().toUpperCase();
  let filtradas = notasFinalizadas;
  if (c) filtradas = filtradas.filter(n => (n.costureira || '').toUpperCase().includes(c));
  if (l) filtradas = filtradas.filter(n => `${n.lote}/${n.ref}`.toUpperCase().includes(l));

  if (filtradas.length === 0) {
    bloco.style.display = 'none';
    return;
  }

  bloco.style.display = 'block';
  contador.textContent = `(${filtradas.length})`;
  lista.innerHTML = '';

  filtradas.forEach(n => {
    const totalChegou = calcularTotalChegou(n);
    const item = document.createElement('div');
    item.className = 'nota-finalizada';
    item.innerHTML = `
      <span class="dot" style="background:var(--success)"></span>
      <span style="font-weight:800">${n.lote}/${n.ref}</span>
      <span style="color:var(--text-secondary);font-size:11px">${n.costureira} · ${totalChegou}/${n.total_saida}pç · #${n.numero}</span>
      <button class="btn-reabilitar" data-num="${n.numero}">↺ reabilitar</button>
    `;
    item.querySelector('.btn-reabilitar').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Reabilitar a nota #${n.numero}? Ela vai voltar pra lista de ativas.`)) return;
      try {
        await atualizarNota(n.numero, { retorno_finalizado: false });
        toast(`Nota #${n.numero} reabilitada`, 'ok');
        await carregarNotasAbertas();
      } catch (err) {
        toast('Erro: ' + err.message, 'err');
      }
    });
    // Clique abre a nota pra consulta
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-reabilitar')) return;
      abrirNota(n);
    });
    lista.appendChild(item);
  });
}

function calcularTotalChegou(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  let t = 0;
  TAMS.forEach(tam => {
    t += (c1[tam] || 0) + (c2[tam] || 0);
  });
  return t;
}

function calcularSaidasPorTam(n) {
  const porTam = { RN: 0, P: 0, M: 0, G: 0, GG: 0 };
  (n.itens || []).forEach(i => {
    porTam[i.tam] = (porTam[i.tam] || 0) + i.qtd;
  });
  return porTam;
}

function calcularChegouPorTam(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  const porTam = { RN: 0, P: 0, M: 0, G: 0, GG: 0 };
  TAMS.forEach(tam => {
    porTam[tam] = (c1[tam] || 0) + (c2[tam] || 0);
  });
  return porTam;
}

function coresEnviadasPorTam(n) {
  const mapa = { RN: [], P: [], M: [], G: [], GG: [] };
  (n.itens || []).forEach(i => {
    mapa[i.tam].push({ cor: i.cor, qtd: i.qtd });
  });
  return mapa;
}

function abrirNota(n) {
  notaAtual = n;
  document.getElementById('painel-nota').classList.add('visivel');
  document.getElementById('p-lote').textContent = n.lote;
  document.getElementById('p-ref').textContent = n.ref;
  document.getElementById('p-cost').textContent = n.costureira || '?';
  document.getElementById('p-num').textContent = `#${n.numero}`;
  document.getElementById('p-total').textContent = n.total_saida;
  document.getElementById('p-data').textContent = formatDataBR(n.data_saida);
  document.getElementById('p-valor').textContent = formatBRL(n.valor_nota || 0);

  // Determina qual chegada mostrar por padrão (se já teve 1ª, sugere 2ª)
  const chegou1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + v, 0);
  const chegou2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0);
  if (chegou1 > 0 && chegou2 === 0) {
    document.querySelector('input[name="qual-chegada"][value="2"]').checked = true;
  } else {
    document.querySelector('input[name="qual-chegada"][value="1"]').checked = true;
  }

  renderizarGrade();
  document.getElementById('painel-nota').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarGrade() {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';
  const saidas = calcularSaidasPorTam(notaAtual);
  const chegou = calcularChegouPorTam(notaAtual);
  const cores = coresEnviadasPorTam(notaAtual);

  TAMS.forEach(tam => {
    const saiu = saidas[tam] || 0;
    const jaChegou = chegou[tam] || 0;
    const pendente = saiu - jaChegou;

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tam = tam;
    col.dataset.saiu = saiu;
    col.dataset.jaChegou = jaChegou;
    col.dataset.pendente = pendente;

    const coresTxt = (cores[tam] || []).map(c => `${c.cor} ${c.qtd}`).join(', ') || '—';

    col.innerHTML = `
      <div class="col-h">
        <span>${tam}</span>
        <span class="pendente">
          pendente <b>${pendente}</b>
          ${pendente > 0 ? `<button class="btn-defeito" data-tam="${tam}" data-max="${pendente}" title="Registrar defeito neste tamanho">⚠ defeito</button>` : ''}
        </span>
      </div>
      <div class="entrada-chegada">
        <input type="number" class="chegou-input" placeholder="0" min="0" max="${pendente}" value="0" ${pendente === 0 ? 'disabled' : ''}>
        <button class="btn-tudo" ${pendente === 0 ? 'disabled' : ''}>TUDO ${pendente}</button>
      </div>
      <div class="cores-enviadas"><b>enviado:</b> ${coresTxt}</div>
      <div class="subtot-col">
        <div class="cell saiu"><span>saída</span><b>${saiu}</b></div>
        <div class="cell chegou"><span>já veio</span><b>${jaChegou}</b></div>
        <div class="cell fora"><span>fora</span><b>${pendente}</b></div>
      </div>
    `;

    const input = col.querySelector('.chegou-input');
    const btnTudo = col.querySelector('.btn-tudo');

    input.addEventListener('input', () => {
      let v = parseInt(input.value) || 0;
      if (v > pendente) v = pendente;
      if (v < 0) v = 0;
      if (String(v) !== input.value) input.value = String(v);
      atualizarEstadoColuna(col, v);
      recalcTotal();
    });
    input.addEventListener('focus', () => input.select());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        // Pula pro próximo input HABILITADO (ignora colunas com pendente=0)
        const inputs = [...document.querySelectorAll('.chegou-input')];
        const idx = inputs.indexOf(input);
        for (let i = idx + 1; i < inputs.length; i++) {
          if (!inputs[i].disabled) {
            inputs[i].focus();
            return;
          }
        }
        // Não achou próximo habilitado → foca no botão Registrar
        document.getElementById('btn-registrar').focus();
      }
    });

    btnTudo.addEventListener('click', () => {
      const v = parseInt(input.value) || 0;
      // Toggle: se já tá no máximo, zera. Senão, coloca no máximo.
      const novo = v >= pendente ? 0 : pendente;
      input.value = String(novo);
      atualizarEstadoColuna(col, novo);
      recalcTotal();
    });

    grade.appendChild(col);
  });

  recalcTotal();
}

function atualizarEstadoColuna(col, chegou) {
  const pendente = parseInt(col.dataset.pendente);
  col.classList.remove('completo', 'parcial');
  if (chegou > 0) {
    if (chegou === pendente) col.classList.add('completo');
    else col.classList.add('parcial');
  }
  const btn = col.querySelector('.btn-tudo');
  if (btn) btn.textContent = chegou >= pendente ? 'LIMPAR' : `TUDO ${pendente}`;
}

function recalcTotal() {
  let total = 0, fora = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const v = parseInt(col.querySelector('.chegou-input').value) || 0;
    total += v;
    fora += (parseInt(col.dataset.pendente) || 0) - v;
    document.querySelector(`.ct[data-ct="${tam}"] b`).textContent = v;
  });
  document.getElementById('lbl-chegando').textContent = total;
  const foraLbl = document.getElementById('lbl-fora');
  if (total === 0) foraLbl.textContent = '';
  else if (fora > 0) foraLbl.textContent = `(ainda ficam ${fora} peças fora com a costureira)`;
  else foraLbl.innerHTML = '<span style="color:var(--success)">✓ nota completa após esta chegada</span>';
}

function fecharPainel() {
  document.getElementById('painel-nota').classList.remove('visivel');
  notaAtual = null;
}

// Calcula total chegado considerando uma nova chegada que ainda não foi salva
function calcularTotalCheguoComQtds(nota, novaChegada, campoCampo) {
  const c1 = campoCampo === 'chegada_1' ? novaChegada.qtds : (nota.chegada_1?.qtds || {});
  const c2 = campoCampo === 'chegada_2' ? novaChegada.qtds : (nota.chegada_2?.qtds || {});
  const por = {};
  TAMS.forEach(t => por[t] = (c1[t] || 0) + (c2[t] || 0));
  return por;
}

async function registrarChegada() {
  if (!notaAtual) return;
  const btn = document.getElementById('btn-registrar');
  btn.disabled = true;

  const qualChegada = document.querySelector('input[name="qual-chegada"]:checked').value;
  const dataChegada = document.getElementById('p-data-chegada').value;

  if (!dataChegada) {
    toast('Preencha a data da chegada', 'err');
    btn.disabled = false;
    return;
  }

  // Coleta quantidades por tam
  const qtds = {};
  let total = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const v = parseInt(col.querySelector('.chegou-input').value) || 0;
    if (v > 0) {
      qtds[tam] = v;
      total += v;
    }
  });

  if (total === 0) {
    toast('Marque ao menos uma peça pra registrar', 'err');
    btn.disabled = false;
    return;
  }

  try {
    // Acumula com a chegada existente (soma, não substitui)
    const chegadaCampo = qualChegada === '1' ? 'chegada_1' : 'chegada_2';
    const chegadaExistente = notaAtual[chegadaCampo] || { data: '', qtds: {} };
    const novasQtds = { ...(chegadaExistente.qtds || {}) };
    Object.entries(qtds).forEach(([tam, v]) => {
      novasQtds[tam] = (novasQtds[tam] || 0) + v;
    });

    const novaChegada = {
      data: dataChegada,
      qtds: novasQtds
    };

    await atualizarNota(notaAtual.numero, { [chegadaCampo]: novaChegada });
    // Verificar se ficou com pendente zero → finalizar automaticamente
    const chegouAtual = calcularTotalCheguoComQtds(notaAtual, novaChegada, chegadaCampo);
    const totalChegouAgora = Object.values(chegouAtual).reduce((a, v) => a + v, 0);
    const ficouCompleto = totalChegouAgora >= (notaAtual.total_saida || 0);

    if (ficouCompleto) {
      await atualizarNota(notaAtual.numero, { retorno_finalizado: true });
      toast(`✓ ${total} peças registradas — retorno completo! Nota #${notaAtual.numero} finalizada.`, 'ok');
    } else {
      toast(`✓ ${total} peças registradas na ${qualChegada}ª chegada da nota #${notaAtual.numero}`, 'ok');
    }

    // Recarrega tudo
    setTimeout(async () => {
      await carregarNotasAbertas();
      fecharPainel();
      btn.disabled = false;
    }, 1200);
  } catch (e) {
    console.error('Erro ao registrar:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
  }
}

// ==== TROCAR COSTUREIRA ====
function abrirModalTrocar() {
  if (!notaAtual) return;
  document.getElementById('trocar-cost-atual').textContent = notaAtual.costureira || '?';
  const inputCost = document.getElementById('trocar-cost-nova');
  inputCost.value = '';
  document.getElementById('trocar-preco').value = '';
  document.getElementById('modal-trocar').classList.add('visivel');
  atualizarBtnTroca();
  // Foca no campo pra facilitar
  setTimeout(() => inputCost.focus(), 100);
}

function atualizarBtnTroca() {
  const nova = document.getElementById('trocar-cost-nova').value.trim().toUpperCase();
  const btn = document.getElementById('btn-confirmar-troca');
  if (!nova) {
    btn.disabled = true;
    btn.textContent = '✓ Trocar';
    return;
  }
  if (nova === notaAtual.costureira) {
    btn.disabled = true;
    btn.textContent = '⚠ Mesma costureira';
    return;
  }
  btn.disabled = false;
  btn.textContent = `✓ Trocar pra ${nova}`;
}

async function confirmarTroca() {
  const novaCost = document.getElementById('trocar-cost-nova').value.trim().toUpperCase();
  let novoPreco = parseFloat(document.getElementById('trocar-preco').value);

  if (!novaCost) return;
  if (novaCost === notaAtual.costureira) return;

  const btn = document.getElementById('btn-confirmar-troca');
  btn.disabled = true;
  btn.textContent = '⏳ Trocando...';

  try {
    // Se não informou preço novo, tenta buscar da matriz
    if (!novoPreco || novoPreco <= 0) {
      novoPreco = await precoDe(notaAtual.ref, novaCost);
      if (!novoPreco || novoPreco <= 0) {
        toast(`${novaCost} não tem preço cadastrado pra ref ${notaAtual.ref}. Digite o preço.`, 'err');
        atualizarBtnTroca();
        return;
      }
    } else {
      // Salva o novo preço na matriz
      await salvarPreco(notaAtual.ref, novaCost, novoPreco);
    }

    const novoValor = notaAtual.total_saida * novoPreco;
    await atualizarNota(notaAtual.numero, {
      costureira: novaCost,
      preco_peca: novoPreco,
      valor_nota: novoValor
    });

    toast(`✓ Nota #${notaAtual.numero} transferida pra ${novaCost}`, 'ok');
    document.getElementById('modal-trocar').classList.remove('visivel');

    setTimeout(async () => {
      await carregarNotasAbertas();
      fecharPainel();
    }, 1200);
  } catch (e) {
    console.error('Erro na troca:', e);
    toast('Erro: ' + e.message, 'err');
    atualizarBtnTroca();
  }
}

// ==== DEFEITO ====
function abrirModalDefeito(tam, pendente) {
  document.getElementById('def-tam').textContent = tam;
  document.getElementById('def-pendente').textContent = pendente;
  document.getElementById('def-qtd').value = '';
  document.getElementById('def-qtd').max = pendente;
  document.getElementById('def-cor').value = '';

  // Popular cores da nota atual
  const dl = document.getElementById('def-cores-list');
  dl.innerHTML = '';
  if (notaAtual) {
    const coresDoTam = new Set();
    (notaAtual.itens || []).forEach(i => {
      if (i.tam === tam) coresDoTam.add(i.cor);
    });
    coresDoTam.forEach(cor => {
      const opt = document.createElement('option');
      opt.value = cor;
      dl.appendChild(opt);
    });
    document.getElementById('def-cor').setAttribute('list', 'def-cores-list');
  }

  document.getElementById('modal-defeito').classList.add('visivel');
  setTimeout(() => document.getElementById('def-qtd').focus(), 100);
}

async function confirmarDefeito() {
  const tam = document.getElementById('def-tam').textContent;
  const qtd = parseInt(document.getElementById('def-qtd').value);
  const cor = document.getElementById('def-cor').value.trim().toUpperCase() || 'GERAL';
  const pendente = parseInt(document.getElementById('def-pendente').textContent);

  if (!qtd || qtd <= 0) { toast('Digite a quantidade com defeito', 'err'); return; }
  if (qtd > pendente) { toast(`Máximo é ${pendente} peças pendentes`, 'err'); return; }

  const btn = document.getElementById('btn-confirmar-defeito');
  btn.disabled = true;

  try {
    // Registra o defeito como uma chegada especial (qtd negativa não — usa campo defeito)
    const defeitosExistentes = notaAtual.defeitos || {};
    const chave = `${tam}_${cor}`;
    defeitosExistentes[chave] = (defeitosExistentes[chave] || 0) + qtd;

    // Também registra na chegada_1 pra fechar o pendente
    const chegadaCampo = 'chegada_1';
    const chegadaExistente = notaAtual[chegadaCampo] || { data: '', qtds: {} };
    const novasQtds = { ...(chegadaExistente.qtds || {}) };
    novasQtds[tam] = (novasQtds[tam] || 0) + qtd;

    await atualizarNota(notaAtual.numero, {
      defeitos: defeitosExistentes,
      [chegadaCampo]: { data: chegadaExistente.data || hojeISO(), qtds: novasQtds }
    });

    toast(`✓ ${qtd} peças com defeito registradas no ${tam} — pendente atualizado`, 'ok');
    document.getElementById('modal-defeito').classList.remove('visivel');

    setTimeout(async () => {
      await carregarNotasAbertas();
      fecharPainel();
      btn.disabled = false;
    }, 1200);
  } catch (e) {
    console.error('Erro registrando defeito:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
  }
}

// ==== FINALIZAR RETORNO ====
async function finalizarRetorno() {
  if (!notaAtual) return;
  const totalChegou = calcularTotalChegou(notaAtual);
  const totalSaida = notaAtual.total_saida || 0;
  const falta = totalSaida - totalChegou;

  let msg = `Finalizar o retorno da nota #${notaAtual.numero}?

Ela vai sair da lista de ativas e ficar disponível só pra consulta.`;
  if (falta > 0) {
    msg += `

⚠ Ainda faltam ${falta} peças chegar. Confirma mesmo assim?`;
  }
  if (!confirm(msg)) return;

  try {
    await atualizarNota(notaAtual.numero, { retorno_finalizado: true });
    toast(`✓ Retorno da nota #${notaAtual.numero} finalizado`, 'ok');
    setTimeout(async () => {
      await carregarNotasAbertas();
      fecharPainel();
    }, 1000);
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

// ==== DEVOLVER PRA DESIGNAÇÃO ====
async function devolverParaDesignacao() {
  if (!notaAtual) return;

  const totalChegou = calcularTotalChegou(notaAtual);
  let msg = `Devolver a nota #${notaAtual.numero} pra designação?\n\nA nota vai ser cancelada e as peças voltam pro corte pra serem designadas de novo.`;
  if (totalChegou > 0) {
    msg += `\n\n⚠ ATENÇÃO: já foram registradas ${totalChegou} peças chegando dessa nota. Se cancelar, esses registros de chegada também somem.`;
  }
  if (!confirm(msg)) return;

  try {
    await deletarNota(notaAtual.numero);
    // Atualiza status do corte pra "designado_parcial" (pode voltar a ser designado)
    if (notaAtual.corte_id) {
      await colCortes().doc(notaAtual.corte_id).update({ status: 'designado_parcial' });
    }
    toast(`Nota #${notaAtual.numero} cancelada — peças liberadas pra redesignar`, 'ok');
    setTimeout(async () => {
      await carregarNotasAbertas();
      fecharPainel();
    }, 1200);
  } catch (e) {
    console.error('Erro devolvendo:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
