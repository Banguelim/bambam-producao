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
  document.getElementById('btn-voltar').addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('btn-gerar').addEventListener('click', gerarNota);

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
    const cortes = await listarCortesRecentes(30);
    const lista = document.getElementById('lista-cortes');
    // Filtra só os que não estão totalmente designados
    const pendentes = cortes.filter(c => c.status !== 'designado_total');
    if (pendentes.length === 0) {
      lista.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">Nenhum corte pendente. Crie um novo em <a href="novo-corte.html">Novo corte</a></div>';
      return;
    }
    lista.innerHTML = '';

    // Buscar quantas peças já foram designadas de cada corte (em paralelo)
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

    pendentes.forEach((c, idx) => {
      const info = infos[idx];
      const div = document.createElement('div');
      div.className = 'item-corte';
      const statusClass = c.status === 'designado_parcial' ? 'parcial' : 'cortado';
      const statusTxt = c.status === 'designado_parcial' ? 'parcial' : 'aguardando';

      // Detalhe compacto por costureira: NOME: RN 30 P 20 (50)
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
        ${detalheDesig}
      `;
      div.addEventListener('click', () => abrirCorte(c.id));
      lista.appendChild(div);
    });
  } catch (e) {
    console.error('Erro carregando cortes:', e);
    document.getElementById('lista-cortes').innerHTML = '<div style="color:var(--text-danger)">Erro carregando cortes</div>';
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
    recalc();
  } catch (e) {
    console.error('Erro abrindo corte:', e);
    toast('Erro ao abrir corte: ' + e.message, 'err');
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

  // Agrupar por tamanho e cores
  const qtds = {};
  const coresPorTam = {};
  TAMS.forEach(t => { qtds[t] = 0; coresPorTam[t] = []; });
  itens.forEach(i => {
    qtds[i.tam] += i.qtd;
    coresPorTam[i.tam].push(`${i.cor} ${i.qtd}`);
  });

  // Cores agrupadas (todas cores enviadas)
  const cores = new Set();
  itens.forEach(i => cores.add(i.cor));
  const coresTxt = [...cores].join(', ');

  const caixa = document.getElementById('caixa-nota');
  caixa.innerHTML = `
    <div class="cabecalho-nota">
      <h2>BAMBAM BABY</h2>
      <div class="num">Nota #${numero}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <!-- SAÍDA (peças enviadas) -->
        <tr class="destaque">
          <td class="tam-cel">${qtds.RN}</td>
          <td class="tam-cel">${qtds.P}</td>
          <td class="tam-cel">${qtds.M}</td>
          <td class="tam-cel">${qtds.G}</td>
          <td class="tam-cel">${qtds.GG}</td>
          <td class="tam-cel">${totalPecas}</td>
        </tr>
        <tr>
          <td colspan="6" class="cores-linha"><b>Cores:</b> ${coresTxt}</td>
        </tr>
        <tr>
          <td class="esq">${formatDataBR(data)}</td>
          <td colspan="2" class="esq">Lote <b>${corteAtual.lote}</b></td>
          <td class="esq">Ref <b>${refsTxt}</b></td>
          <td colspan="2" class="esq">Preço/peça <b>${formatBRL(preco)}</b></td>
        </tr>
        <tr>
          <td colspan="4" class="esq">Costureira <b style="font-size:14px">${costureira}</b></td>
          <td colspan="2" class="valor-total-cel">Total ${formatBRL(valor)}</td>
        </tr>

        <!-- 1ª CHEGADA -->
        <tr>
          <td colspan="6" class="barra-preta">1ª CHEGADA — data ___/___/________</td>
        </tr>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <tr class="row-vazio">
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>

        <!-- 2ª CHEGADA -->
        <tr>
          <td colspan="6" class="barra-preta">2ª CHEGADA — data ___/___/________</td>
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
      <button class="btn-imp" onclick="window.print()">🖨 Imprimir nota</button>
      <button class="btn-cont" id="btn-continuar">✓ Continuar</button>
    </div>
  `;

  document.getElementById('modal-nota').classList.add('visivel');

  // Handler do continuar (recarrega pra próxima designação)
  document.getElementById('btn-continuar').addEventListener('click', () => {
    if (window._sobrouAlgo) {
      window.location.href = 'designacao.html?corte=' + corteAtual.id;
    } else {
      window.location.href = 'designacao.html';
    }
  });
}

async function gerarNota() {
  const btn = document.getElementById('btn-gerar');
  btn.disabled = true;

  const nome = document.getElementById('costureira').value.trim().toUpperCase();
  const preco = parseFloat(document.getElementById('preco').value);
  const data = document.getElementById('data-designacao').value;

  if (!nome) { toast('Escolha uma costureira', 'err'); btn.disabled = false; return; }
  if (!preco || preco <= 0) { toast('Digite o preço por peça', 'err'); btn.disabled = false; return; }
  if (!data) { toast('Preencha a data', 'err'); btn.disabled = false; return; }

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

  if (totalSaida === 0) {
    toast('Marque ao menos uma cor + qtd', 'err');
    btn.disabled = false;
    return;
  }

  try {
    const numero = await proximoNumeroNota(false);  // agora incrementa de verdade
    const valorNota = totalSaida * preco;
    const refPrincipal = corteAtual.refs[0];

    // Se o preço mudou vs matriz, atualiza a matriz
    if (precoBase === null || Math.abs(precoBase - preco) > 0.001) {
      await salvarPreco(refPrincipal, nome, preco);
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

    await salvarNota(nota);

    // Atualiza status do corte
    const restanteAntes = await calcularRestante(corteAtual);
    const sobrouAlgo = restanteAntes.reduce((a, i) => a + i.qtd, 0) - totalSaida > 0;
    const novoStatus = sobrouAlgo ? 'designado_parcial' : 'designado_total';
    await colCortes().doc(corteAtual.id).update({ status: novoStatus });

    // Guarda pra decidir onde ir depois do modal
    window._sobrouAlgo = sobrouAlgo;

    // Abre o modal da nota gerada (com botões IMPRIMIR / CONTINUAR)
    mostrarModalNota(numero, itens, totalSaida, preco, valorNota, nome, data);
  } catch (e) {
    console.error('Erro ao gerar nota:', e);
    toast('Erro ao gerar nota: ' + e.message, 'err');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
