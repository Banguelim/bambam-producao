// Tela de Designação
// Se URL tem ?corte=ID, abre esse corte. Senão mostra lista pra escolher.

let corteAtual = null;   // {id, lote, refs, itens, ...}
let costureiraSel = null;
let precoBase = null;  // preço da matriz (só pra saber se tem cadastrado)

async function init() {
  await protegerRota();
  document.getElementById('data-designacao').value = hojeISO();

  // Popular datalist de costureiras
  try {
    const cs = await listarCostureiras();
    const dl = document.getElementById('costureiras-list');
    cs.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;
      dl.appendChild(opt);
    });
  } catch (e) { console.warn('Costureiras não carregadas:', e); }

  // Handlers do bloco de nota
  document.getElementById('costureira').addEventListener('change', onMudarCostureira);
  document.getElementById('costureira').addEventListener('blur', onMudarCostureira);
  document.getElementById('preco').addEventListener('input', recalcValor);
  document.getElementById('btn-voltar').addEventListener('click', () => { window.location.href = 'designacao.html'; });
  document.getElementById('btn-gerar').addEventListener('click', gerarNota);

  // Busca de cortes
  document.getElementById('busca-corte')?.addEventListener('input', (e) => {
    if (window._cortesCache) {
      renderListaCortes(window._cortesCache, window._infosCache, e.target.value);
    }
  });

  // Modal de editar corte
  document.getElementById('edcorte-cancelar').addEventListener('click', () => {
    document.getElementById('modal-editar-corte').classList.remove('visivel');
    edCorteAtual = null;
  });
  document.getElementById('edcorte-salvar').addEventListener('click', salvarEdicaoCorte);

  // Ver se veio corte pela URL
  const params = new URLSearchParams(window.location.search);
  const corteId = params.get('corte');
  if (corteId) {
    await abrirCorte(corteId);
  } else {
    await mostrarSelecao();
  }
}

async function mostrarSelecao() {
  document.getElementById('tela-selecao').style.display = 'block';
  document.getElementById('tela-designar').style.display = 'none';
  document.getElementById('hint-tela').textContent = 'Escolha um corte pra designar';

  try {
    const pendentes = await listarCortesPendentes();
    if (pendentes.length === 0) {
      document.getElementById('lista-cortes').innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">Nenhum corte pendente. Crie um novo em <a href="novo-corte.html">Novo corte</a></div>';
      return;
    }

    // Buscar infos de designação de cada corte
    const infos = await Promise.all(pendentes.map(async c => {
      try {
        const snap = await colNotas().where('corte_id', '==', c.id).get();
        let designado = 0, numNotas = 0;
        const porCostureira = {};
        snap.forEach(d => {
          const n = d.data();
          designado += n.total_saida || 0;
          numNotas++;
          const nome = n.costureira || '?';
          if (!porCostureira[nome]) porCostureira[nome] = { total: 0, tams: {} };
          porCostureira[nome].total += n.total_saida || 0;
          (n.itens || []).forEach(i => {
            porCostureira[nome].tams[i.tam] = (porCostureira[nome].tams[i.tam] || 0) + i.qtd;
          });
        });
        return { designado, numNotas, porCostureira };
      } catch (e) { return { designado: 0, numNotas: 0, porCostureira: {} }; }
    }));

    // Armazena pra busca filtrar sem rebuscar
    window._cortesCache = pendentes;
    window._infosCache = infos;
    renderListaCortes(pendentes, infos, '');
  } catch (e) {
    console.error('Erro carregando cortes:', e);
    document.getElementById('lista-cortes').innerHTML = '<div style="color:var(--text-danger)">Erro carregando cortes</div>';
  }
}

// Busca o lote em TODOS os cortes (qualquer status) e recalcula o status de
// cada um comparando o total mesclado com o que já foi designado nas notas.
// Corrige cortes que ficaram com status desatualizado (ex: acrescentaram
// um tamanho a um corte já designado, numa versão anterior à correção que
// passou a recalcular isso na hora).
async function corrigirStatusDoLote(lote) {
  try {
    const snap = await colCortes().where('lote', '==', lote).get();
    if (snap.empty) { toast(`Nenhum corte encontrado com lote "${lote}" (nem já designado)`, 'err'); return; }

    let corrigidos = 0;
    for (const doc of snap.docs) {
      const c = doc.data();
      const notasSnap = await colNotas().where('corte_id', '==', doc.id).get();
      const designadoPorSku = {};
      notasSnap.forEach(d => {
        (d.data().itens || []).forEach(i => {
          const chave = `${i.cor}_${i.tam}`;
          designadoPorSku[chave] = (designadoPorSku[chave] || 0) + i.qtd;
        });
      });
      const restante = (c.itens || []).reduce((a, i) => {
        const desig = designadoPorSku[`${i.cor}_${i.tam}`] || 0;
        return a + Math.max(0, i.qtd - desig);
      }, 0);
      const statusCerto = notasSnap.empty ? 'cortado' : (restante > 0 ? 'designado_parcial' : 'designado_total');
      if (statusCerto !== c.status) {
        await colCortes().doc(doc.id).update({ status: statusCerto });
        corrigidos++;
      }
    }

    if (corrigidos > 0) {
      toast(`✓ ${corrigidos} corte(s) do lote "${lote}" corrigido(s) — atualizando lista`, 'ok');
    } else {
      toast(`Lote "${lote}" já estava com status correto — se não aparece, pode estar 100% designado mesmo`, '');
    }
    document.getElementById('busca-corte').value = '';
    await mostrarSelecao();
  } catch (e) {
    console.error('Erro corrigindo status:', e);
    toast('Erro ao verificar: ' + e.message, 'err');
  }
}

function renderListaCortes(pendentes, infos, filtro) {
  const lista = document.getElementById('lista-cortes');
  const f = filtro.trim().toUpperCase();
  const filtradas = f
    ? pendentes.filter(c =>
        c.lote?.toUpperCase().includes(f) ||
        (c.refs || []).some(r => r.toUpperCase().includes(f)) ||
        (c.data_corte || '').includes(f)
      )
    : pendentes;

  lista.innerHTML = '';
  if (filtradas.length === 0) {
    if (f) {
      // Pode ser um corte com status desatualizado (ex: mesclado antes da
      // correção de 31/08/2026) — oferece checar/corrigir em TODOS os cortes,
      // não só nos que já estão marcados como pendentes.
      const div = document.createElement('div');
      div.style.cssText = 'text-align:center;padding:20px';
      div.innerHTML = `
        <div style="color:var(--text-muted);margin-bottom:10px">Nenhum corte pendente encontrado com "${f}"</div>
        <button class="btn btn-secondary" id="btn-verificar-lote">🔧 Verificar/corrigir status do lote "${f}"</button>
      `;
      div.querySelector('#btn-verificar-lote').addEventListener('click', () => corrigirStatusDoLote(f));
      lista.appendChild(div);
    } else {
      lista.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">Nenhum corte encontrado</div>';
    }
    return;
  }

  filtradas.forEach(c => {
    const idx = pendentes.indexOf(c);
    const info = infos[idx] || { designado: 0, numNotas: 0, porCostureira: {} };
    const div = document.createElement('div');
    div.className = 'item-corte';
    const statusClass = c.status === 'designado_parcial' ? 'parcial' : 'cortado';
    const statusTxt = c.status === 'designado_parcial' ? 'parcial' : 'aguardando';

    let detalheDesig = '';
    if (info.numNotas > 0) {
      const partes = Object.entries(info.porCostureira).map(([nome, d]) => {
        const tamsStr = TAMS.filter(t => d.tams[t]).map(t => `${t}${d.tams[t]}`).join(' ');
        return `<b>${nome}:</b> ${tamsStr} <span style="color:var(--text-muted)">(${d.total})</span>`;
      });
      detalheDesig = `<div class="detalhe-linha">${partes.join(' · ')}</div>`;
    }

    div.innerHTML = `
      <span class="lote">${c.lote}</span>
      <span class="ref">${(c.refs || []).join(' + ')}</span>
      <span class="info">${formatDataBR(c.data_corte)}</span>
      <span class="pecas">${c.total_pecas} peças</span>
      <span class="status ${statusClass}">${statusTxt}</span>
      <button class="btn-editar-corte" title="Editar quantidades deste corte">✎</button>
      <button class="btn-excluir-corte" title="Excluir este corte">✕</button>
      ${detalheDesig}
    `;

    // Clique na linha abre o corte (exceto nos botões editar/excluir)
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-excluir-corte') || e.target.classList.contains('btn-editar-corte')) return;
      abrirCorte(c.id);
    });

    // Botão editar (corrige qtd digitada errado, entrada de teste a mais, etc)
    div.querySelector('.btn-editar-corte').addEventListener('click', (e) => {
      e.stopPropagation();
      abrirEditarCorte(c);
    });

    // Botão excluir
    div.querySelector('.btn-excluir-corte').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir o corte ${c.lote}/${(c.refs||[]).join('+')}?\n\nIsso remove o corte permanentemente. As notas já geradas NÃO são apagadas.`)) return;
      try {
        await colCortes().doc(c.id).delete();
        toast(`Corte ${c.lote} excluído`, 'ok');
        await mostrarSelecao();
      } catch (err) {
        toast('Erro ao excluir: ' + err.message, 'err');
      }
    });

    lista.appendChild(div);
  });
}

// ==== EDITAR CORTE (corrigir qtd digitada errado, entrada de teste a mais, etc) ====
let edCorteAtual = null;
let edItensAtual = [];
let edCorteDesignadoPorSku = {};
let edCorteTemNotas = false;

async function abrirEditarCorte(corte) {
  edCorteAtual = corte;
  edItensAtual = (corte.itens || []).map(i => ({ ...i }));
  document.getElementById('edcorte-titulo').textContent = `Editar corte — Lote ${corte.lote} / Ref ${(corte.refs || []).join('+')}`;

  // Descobre quanto já foi designado por cor+tam — não deixa reduzir/remover abaixo disso
  edCorteDesignadoPorSku = {};
  try {
    const notasSnap = await colNotas().where('corte_id', '==', corte.id).get();
    edCorteTemNotas = !notasSnap.empty;
    notasSnap.forEach(d => {
      (d.data().itens || []).forEach(i => {
        const chave = `${i.cor}_${i.tam}`;
        edCorteDesignadoPorSku[chave] = (edCorteDesignadoPorSku[chave] || 0) + i.qtd;
      });
    });
  } catch (e) { console.warn('Erro buscando notas do corte:', e); }

  renderLinhasEditar();
  document.getElementById('modal-editar-corte').classList.add('visivel');
}

function renderLinhasEditar() {
  const cont = document.getElementById('edcorte-linhas');
  cont.innerHTML = '';
  edItensAtual.forEach((it, idx) => {
    const chave = `${it.cor}_${it.tam}`;
    const minQtd = edCorteDesignadoPorSku[chave] || 0;
    const linha = document.createElement('div');
    linha.className = 'linha-edcorte';
    linha.innerHTML = `
      <span>${it.cor}</span>
      <span style="text-align:center;font-weight:700">${it.tam}</span>
      <input type="number" min="${minQtd}" value="${it.qtd}">
      <button class="x-linha" title="remover linha">×</button>
    `;
    const input = linha.querySelector('input');
    input.addEventListener('input', () => {
      let v = parseInt(input.value) || 0;
      if (v < minQtd) {
        v = minQtd;
        input.value = v;
        toast(`Não dá pra reduzir abaixo de ${minQtd} — já foi designado essa quantidade`, 'err');
      }
      edItensAtual[idx].qtd = v;
      atualizarTotalEditar();
    });
    linha.querySelector('.x-linha').addEventListener('click', () => {
      if (minQtd > 0) {
        toast(`Não dá pra remover — ${minQtd} peça(s) de ${it.cor} ${it.tam} já foi designada`, 'err');
        return;
      }
      if (!confirm(`Remover ${it.cor} ${it.tam} (${it.qtd} peças) do corte?`)) return;
      edItensAtual.splice(idx, 1);
      renderLinhasEditar();
    });
    cont.appendChild(linha);
  });
  atualizarTotalEditar();
}

function atualizarTotalEditar() {
  document.getElementById('edcorte-total').textContent = edItensAtual.reduce((a, i) => a + i.qtd, 0);
}

async function salvarEdicaoCorte() {
  if (!edCorteAtual) return;
  const novoTotal = edItensAtual.reduce((a, i) => a + i.qtd, 0);
  if (novoTotal === 0) {
    toast('O corte precisa ter ao menos uma peça — pra remover tudo, exclua o corte inteiro na lista', 'err');
    return;
  }
  try {
    const restante = edItensAtual.reduce((a, i) => {
      const desig = edCorteDesignadoPorSku[`${i.cor}_${i.tam}`] || 0;
      return a + Math.max(0, i.qtd - desig);
    }, 0);
    const novoStatus = !edCorteTemNotas ? 'cortado' : (restante > 0 ? 'designado_parcial' : 'designado_total');
    await colCortes().doc(edCorteAtual.id).update({ itens: edItensAtual, total_pecas: novoTotal, status: novoStatus });
    toast(`✓ Corte ${edCorteAtual.lote} atualizado (${novoTotal} peças)`, 'ok');
    document.getElementById('modal-editar-corte').classList.remove('visivel');
    edCorteAtual = null;
    await mostrarSelecao();
  } catch (e) {
    console.error('Erro salvando edição do corte:', e);
    toast('Erro ao salvar: ' + e.message, 'err');
  }
}

async function abrirCorte(id) {
  document.getElementById('tela-selecao').style.display = 'none';
  document.getElementById('tela-designar').style.display = 'block';
  document.getElementById('hint-tela').textContent = 'Marque o que vai designar e escolha a costureira';

  try {
    corteAtual = await buscarCorte(id);
    if (!corteAtual) {
      toast('Corte não encontrado', 'err');
      await mostrarSelecao();
      return;
    }

    // Info do corte
    const nNota = await proximoNumeroNota(true);  // só peek (não incrementa)
    document.getElementById('num-nota').textContent = `Nota #${nNota}`;
    const refsTxt = (corteAtual.refs || []).join(' + ');
    document.getElementById('info-txt').innerHTML =
      `Corte <b>${corteAtual.lote}</b> · Ref <b>${refsTxt}</b> · <b>${corteAtual.total_pecas}</b> peças · ${formatDataBR(corteAtual.data_corte)}`;

    // Descobre o que ainda pode ser designado (subtrai o que já foi)
    const restante = await calcularRestante(corteAtual);
    renderizarGrade(restante);

    // Carrega e mostra as notas já geradas desse corte
    await mostrarNotasExistentes(id);

    recalc();
  } catch (e) {
    console.error('Erro abrindo corte:', e);
    toast('Erro ao abrir corte: ' + e.message, 'err');
  }
}

async function mostrarNotasExistentes(corteId) {
  const painel = document.getElementById('notas-existentes');
  const lista = document.getElementById('notas-lista');
  const contador = document.getElementById('notas-contador');
  try {
    const notas = await listarNotasDoCorte(corteId);
    if (notas.length === 0) {
      painel.style.display = 'none';
      return;
    }
    painel.style.display = 'block';
    contador.textContent = `(${notas.length})`;
    lista.innerHTML = '';
    notas.forEach(n => {
      // Detalhes: RN 30 P 20 (por tamanho)
      const porTam = {};
      TAMS.forEach(t => porTam[t] = 0);
      (n.itens || []).forEach(i => { porTam[i.tam] += i.qtd; });
      const detTxt = TAMS.filter(t => porTam[t]).map(t => `${t}${porTam[t]}`).join(' ');

      const item = document.createElement('div');
      item.className = 'nota-item';
      item.innerHTML = `
        <span class="num">#${n.numero}</span>
        <span class="cost">${n.costureira || '?'}</span>
        <span class="detalhes">${detTxt} · ${n.total_saida || 0}pç · ${formatDataBR(n.data_saida)}</span>
        <span class="valor">${formatBRL(n.valor_nota || 0)}</span>
        <div class="acoes">
          <button class="btn-mini" data-acao="reimprimir">🖨 imprimir</button>
          <button class="btn-mini danger" data-acao="cancelar">✗ cancelar</button>
        </div>
      `;
      item.querySelector('[data-acao="reimprimir"]').addEventListener('click', () => reimprimirNota(n));
      item.querySelector('[data-acao="cancelar"]').addEventListener('click', () => cancelarNota(n));
      lista.appendChild(item);
    });
  } catch (e) {
    console.error('Erro listando notas:', e);
  }
}

function reimprimirNota(n) {
  // Reabre o modal da nota com os dados originais
  mostrarModalNota(
    n.numero,
    n.itens || [],
    n.total_saida || 0,
    n.preco_peca || 0,
    n.valor_nota || 0,
    n.costureira || '?',
    n.data_saida
  );
}

async function cancelarNota(n) {
  if (!confirm(`Cancelar a nota #${n.numero} de ${n.costureira}?\n\nAs ${n.total_saida} peças voltam pra designar de novo.\n\n[OK] cancela · [Cancelar] volta`)) return;
  try {
    await deletarNota(n.numero);
    toast(`Nota #${n.numero} cancelada — peças liberadas`, 'ok');
    // Recarrega a tela pra atualizar tudo
    setTimeout(() => {
      window.location.href = 'designacao.html?corte=' + corteAtual.id;
    }, 800);
  } catch (e) {
    console.error('Erro cancelando nota:', e);
    toast('Erro ao cancelar: ' + e.message, 'err');
  }
}

// Calcula o que ainda pode ser designado desse corte
// = itens do corte - itens já designados nas notas anteriores
async function calcularRestante(corte) {
  const restante = {};  // {ref_cor_tam: qtd}
  // Começa com o total do corte
  corte.itens.forEach(i => {
    const chave = `${i.ref}_${i.cor}_${i.tam}`;
    restante[chave] = (restante[chave] || 0) + i.qtd;
  });
  // Subtrai o que já foi designado
  try {
    const snap = await colNotas().where('corte_id', '==', corte.id).get();
    snap.forEach(doc => {
      const n = doc.data();
      (n.itens || []).forEach(i => {
        const chave = `${n.ref}_${i.cor}_${i.tam}`;
        if (restante[chave]) restante[chave] -= i.qtd;
        if (restante[chave] <= 0) delete restante[chave];
      });
    });
  } catch (e) { console.warn('Sem notas anteriores ou erro:', e); }
  // Converte pra lista
  const lista = [];
  Object.entries(restante).forEach(([chave, qtd]) => {
    const [ref, cor, tam] = chave.split('_');
    lista.push({ ref, cor, tam, qtd });
  });
  return lista;
}

function renderizarGrade(itens) {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';
  TAMS.forEach(tam => grade.appendChild(buildCol(tam, itens)));
}

function buildCol(tam, itens) {
  const itensDoTam = itens.filter(i => i.tam === tam);
  const col = document.createElement('div');
  col.className = 'col';
  col.dataset.tam = tam;
  col.innerHTML = `
    <div class="col-h">
      <span>${tam}</span>
      <button class="tudo-col azul" data-todos>TODOS</button>
    </div>
    <div class="entradas"></div>
    <div class="subtot-col">
      <div class="cell"><span>total</span><b data-total>0</b></div>
      <div class="cell saiu"><span>saiu</span><b data-saiu>0</b></div>
      <div class="cell sobrou"><span>sobra</span><b data-sobra>0</b></div>
    </div>
  `;

  const entradas = col.querySelector('.entradas');
  let totalCol = 0;
  itensDoTam.forEach(item => {
    totalCol += item.qtd;
    const e = document.createElement('div');
    e.className = 'cor-linha';
    e.dataset.max = item.qtd;
    e.dataset.cor = item.cor;
    e.dataset.ref = item.ref;
    e.innerHTML = `
      <input type="checkbox" class="chk">
      <span class="cor" title="${item.cor}">${item.cor}</span>
      <span class="qmax">/${item.qtd}</span>
      <span class="q" contenteditable="true" spellcheck="false" inputmode="numeric">0</span>
    `;
    e.classList.add('desmarcada');

    const chk = e.querySelector('.chk');
    const q = e.querySelector('.q');

    chk.addEventListener('change', () => {
      if (chk.checked) {
        q.textContent = String(item.qtd);
        e.classList.remove('desmarcada', 'parcial');
      } else {
        q.textContent = '0';
        e.classList.add('desmarcada');
        e.classList.remove('parcial');
      }
      recalc();
    });

    q.addEventListener('focus', () => selecionarTudo(q));
    q.addEventListener('input', () => {
      const v = sanitizarQtd(q, item.qtd);
      if (v === 0) {
        chk.checked = false;
        e.classList.add('desmarcada');
        e.classList.remove('parcial');
      } else {
        chk.checked = true;
        e.classList.remove('desmarcada');
        if (v < item.qtd) e.classList.add('parcial');
        else e.classList.remove('parcial');
      }
      recalc();
    });
    q.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        const qs = col.querySelectorAll('.q');
        const idx = Array.from(qs).indexOf(q);
        if (idx < qs.length - 1) qs[idx + 1].focus();
      }
    });

    entradas.appendChild(e);
  });

  col.querySelector('[data-total]').textContent = totalCol;

  // Botão TODOS: alterna marcar tudo / desmarcar tudo
  col.querySelector('[data-todos]').addEventListener('click', () => {
    const linhas = col.querySelectorAll('.cor-linha');
    const algumMarcado = [...linhas].some(e => (parseInt(e.querySelector('.q').textContent) || 0) > 0);
    linhas.forEach(e => {
      const max = parseInt(e.dataset.max);
      if (algumMarcado) {
        // Desmarcar tudo
        e.querySelector('.q').textContent = '0';
        e.querySelector('.chk').checked = false;
        e.classList.add('desmarcada');
        e.classList.remove('parcial');
      } else {
        // Marcar tudo
        e.querySelector('.q').textContent = String(max);
        e.querySelector('.chk').checked = true;
        e.classList.remove('desmarcada', 'parcial');
      }
    });
    recalc();
  });

  return col;
}

function recalc() {
  let totalGeral = 0, sobraGeral = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    let saiu = 0;
    col.querySelectorAll('.cor-linha').forEach(e => {
      const v = parseInt(e.querySelector('.q').textContent) || 0;
      saiu += v;
    });
    const total = parseInt(col.querySelector('[data-total]').textContent) || 0;
    col.querySelector('[data-saiu]').textContent = saiu;
    col.querySelector('[data-sobra]').textContent = total - saiu;
    document.querySelector(`.ct[data-ct="${tam}"] b`).textContent = saiu;
    totalGeral += saiu;
    sobraGeral += (total - saiu);
    // Atualiza texto do botão TODOS/LIMPAR
    const btn = col.querySelector('[data-todos]');
    if (btn) btn.textContent = saiu > 0 ? 'LIMPAR' : 'TODOS';
  });
  document.getElementById('lbl-designando').textContent = totalGeral;
  const sobra = document.getElementById('lbl-sobra');
  if (totalGeral === 0) {
    sobra.innerHTML = '<span style="color:var(--text-muted)">— marque as cores/qtds ou clique em TODOS numa coluna</span>';
  } else if (sobraGeral > 0) {
    sobra.textContent = `(sobram ${sobraGeral} pra outra costureira)`;
  } else {
    sobra.innerHTML = '<span style="color:var(--success)">✓ todo o corte designado</span>';
  }
  recalcValor();
}

async function onMudarCostureira() {
  const nome = document.getElementById('costureira').value.trim().toUpperCase();
  if (!nome || !corteAtual) return;
  costureiraSel = nome;

  // Busca preço da matriz pra essa costureira × primeira ref do corte
  const refPrincipal = corteAtual.refs[0];
  try {
    const preco = await precoDe(refPrincipal, nome);
    precoBase = preco;
    const precoInput = document.getElementById('preco');
    const bloco = document.getElementById('bloco-nota');
    if (preco !== null && preco > 0) {
      precoInput.value = preco.toFixed(2);
      bloco.classList.remove('sem-preco');
    } else {
      precoInput.value = '';
      bloco.classList.add('sem-preco');
    }
    recalcValor();
  } catch (e) { console.warn('Sem preço cadastrado:', e); }
}

function recalcValor() {
  const totalPecas = parseInt(document.getElementById('lbl-designando').textContent) || 0;
  const preco = parseFloat(document.getElementById('preco').value) || 0;
  const valor = totalPecas * preco;
  document.getElementById('valor-total').textContent = formatBRL(valor);
}

function mostrarModalNota(numero, itens, totalPecas, preco, valor, costureira, data) {
  const refsTxt = corteAtual.refs.join(' + ');

  // Agrupar por tamanho
  const qtds = {};
  TAMS.forEach(t => qtds[t] = 0);
  itens.forEach(i => { qtds[i.tam] += i.qtd; });

  // Cores enviadas
  const cores = new Set();
  itens.forEach(i => cores.add(i.cor));
  const coresTxt = [...cores].join(', ');

  const caixa = document.getElementById('caixa-nota');
  caixa.innerHTML = `
    <div class="num-nota">Nota #${numero}</div>

    <table>
      <tbody>
        <!-- Cabeçalho tam -->
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <!-- SAÍDA -->
        <tr class="destaque">
          <td class="tam-cel">${qtds.RN}</td>
          <td class="tam-cel">${qtds.P}</td>
          <td class="tam-cel">${qtds.M}</td>
          <td class="tam-cel">${qtds.G}</td>
          <td class="tam-cel">${qtds.GG}</td>
          <td class="tam-cel">${totalPecas}</td>
        </tr>
        <!-- Cores -->
        <tr>
          <td colspan="6" class="cores-linha">${coresTxt}</td>
        </tr>
        <!-- Data / Lote / Ref / Preço -->
        <tr>
          <td class="esq"><b>${formatDataBR(data)}</b></td>
          <td colspan="2" class="esq">Lote <b style="font-size:16px;letter-spacing:1px">${corteAtual.lote}</b></td>
          <td class="esq">Ref <b style="font-size:15px">${refsTxt}</b></td>
          <td colspan="2" class="esq">Preço <b>${formatBRL(preco)}</b></td>
        </tr>
        <!-- Costureira + Total -->
        <tr>
          <td colspan="4" class="esq"><b style="font-size:17px;letter-spacing:0.5px">${costureira}</b></td>
          <td colspan="2" class="esq">Total <b style="font-size:14px">${formatBRL(valor)}</b></td>
        </tr>

        <!-- 1ª CHEGADA -->
        <tr>
          <td colspan="6" class="rot-chegada">1ª CHEGADA — data ___/___/________</td>
        </tr>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <tr class="row-vazio">
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>

        <!-- 2ª CHEGADA -->
        <tr>
          <td colspan="6" class="rot-chegada">2ª CHEGADA — data ___/___/________</td>
        </tr>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <tr class="row-vazio">
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>

    <div class="botoes">
      <button class="btn-imp" onclick="window.print()">🖨 Imprimir</button>
      <button class="btn-cont" id="btn-continuar">✓ Continuar</button>
    </div>
  `;

  document.getElementById('modal-nota').classList.add('visivel');

  // Continuar sempre volta pra tela inicial da designação
  document.getElementById('btn-continuar').addEventListener('click', () => {
    window.location.href = 'designacao.html';
  });
}

async function gerarNota() {
  const btn = document.getElementById('btn-gerar');
  btn.disabled = true;

  const nome = document.getElementById('costureira').value.trim().toUpperCase();
  const preco = parseFloat(document.getElementById('preco').value);
  const data = document.getElementById('data-designacao').value;

  console.log('[gerarNota] iniciando', { nome, preco, data, corteAtual: corteAtual?.id });

  if (!nome) { toast('Escolha uma costureira', 'err'); btn.disabled = false; return; }
  if (!preco || preco <= 0) { toast('Digite o preço por peça', 'err'); btn.disabled = false; return; }
  if (!data) { toast('Preencha a data', 'err'); btn.disabled = false; return; }
  if (!corteAtual) { toast('Corte não carregado', 'err'); btn.disabled = false; return; }

  // Coletar itens marcados
  const itens = [];
  let totalSaida = 0;
  TAMS.forEach(tam => {
    document.querySelectorAll(`.col[data-tam="${tam}"] .cor-linha`).forEach(e => {
      const v = parseInt(e.querySelector('.q').textContent) || 0;
      if (v > 0) {
        itens.push({ cor: e.dataset.cor, tam, qtd: v });
        totalSaida += v;
      }
    });
  });

  console.log('[gerarNota] itens coletados:', itens, 'total:', totalSaida);

  if (totalSaida === 0) {
    toast('Marque ao menos uma cor + qtd', 'err');
    btn.disabled = false;
    return;
  }

  try {
    const numero = await proximoNumeroNota(false);
    console.log('[gerarNota] próximo número:', numero);

    const valorNota = totalSaida * preco;
    const refPrincipal = corteAtual.refs[0];

    // Se o preço mudou vs matriz, atualiza a matriz
    if (precoBase === null || Math.abs(precoBase - preco) > 0.001) {
      await salvarPreco(refPrincipal, nome, preco);
      console.log('[gerarNota] preço salvo na matriz');
    }

    const nota = {
      numero,
      corte_id: corteAtual.id,
      lote: corteAtual.lote,
      ref: refPrincipal,
      refs_completa: corteAtual.refs,
      costureira: nome,
      data_saida: data,
      itens,
      total_saida: totalSaida,
      preco_peca: preco,
      valor_nota: valorNota,
      chegada_1: { data: '', qtds: {} },
      chegada_2: { data: '', qtds: {} },
      pagamentos: [],
      status: 'aberta'
    };

    console.log('[gerarNota] salvando nota:', nota);
    await salvarNota(nota);
    console.log('[gerarNota] nota salva com sucesso');

    // Atualiza status do corte
    const restanteDepois = await calcularRestante(corteAtual);
    const totalRestante = restanteDepois.reduce((a, i) => a + i.qtd, 0);
    const sobrouAlgo = totalRestante > 0;
    const novoStatus = sobrouAlgo ? 'designado_parcial' : 'designado_total';
    await colCortes().doc(corteAtual.id).update({ status: novoStatus });
    console.log('[gerarNota] corte atualizado, sobrou:', totalRestante);

    // Abre o modal da nota gerada
    mostrarModalNota(numero, itens, totalSaida, preco, valorNota, nome, data);
  } catch (e) {
    console.error('[gerarNota] ERRO:', e);
    toast('Erro ao gerar nota: ' + e.message, 'err');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
