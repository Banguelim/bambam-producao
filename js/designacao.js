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
  document.getElementById('btn-previa').addEventListener('click', mostrarPrevia);
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
    pendentes.forEach(c => {
      const div = document.createElement('div');
      div.className = 'item-corte';
      const statusClass = c.status === 'designado_parcial' ? 'parcial' : 'cortado';
      const statusTxt = c.status === 'designado_parcial' ? 'parcial' : 'aguardando';
      div.innerHTML = `
        <span class="lote">${c.lote}</span>
        <span class="ref">${(c.refs || []).join(' + ')}</span>
        <span class="info">${formatDataBR(c.data_corte)}</span>
        <span class="pecas">${c.total_pecas} peças</span>
        <span class="status ${statusClass}">${statusTxt}</span>
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
      <input type="checkbox" class="chk" checked>
      <span class="cor" title="${item.cor}">${item.cor}</span>
      <span class="qmax">/${item.qtd}</span>
      <span class="q" contenteditable="true" spellcheck="false" inputmode="numeric">${item.qtd}</span>
    `;

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

  // Botão TODOS: marca tudo
  col.querySelector('[data-todos]').addEventListener('click', () => {
    col.querySelectorAll('.cor-linha').forEach(e => {
      const max = parseInt(e.dataset.max);
      e.querySelector('.q').textContent = String(max);
      e.querySelector('.chk').checked = true;
      e.classList.remove('desmarcada', 'parcial');
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
  });
  document.getElementById('lbl-designando').textContent = totalGeral;
  document.getElementById('lbl-sobra').textContent = sobraGeral > 0 ? `(sobram ${sobraGeral} pra outra costureira)` : '';
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

function mostrarPrevia() {
  const previa = document.getElementById('previa-nota');
  const nNota = document.getElementById('num-nota').textContent.replace('Nota #', '');
  const totalPecas = parseInt(document.getElementById('lbl-designando').textContent) || 0;
  const preco = parseFloat(document.getElementById('preco').value) || 0;
  const valor = totalPecas * preco;
  const costureira = document.getElementById('costureira').value.trim().toUpperCase() || '—';
  const data = document.getElementById('data-designacao').value;
  const refsTxt = corteAtual.refs.join(' + ');

  // Coletar quantidades por tam
  const qtds = {};
  const itensPorTam = {};
  TAMS.forEach(tam => {
    qtds[tam] = 0;
    itensPorTam[tam] = [];
    document.querySelectorAll(`.col[data-tam="${tam}"] .cor-linha`).forEach(e => {
      const v = parseInt(e.querySelector('.q').textContent) || 0;
      if (v > 0) {
        qtds[tam] += v;
        itensPorTam[tam].push({ cor: e.dataset.cor, qtd: v });
      }
    });
  });

  // Cores enviadas (agrupadas)
  const cores = new Set();
  Object.values(itensPorTam).forEach(arr => arr.forEach(i => cores.add(i.cor)));
  const coresTxt = [...cores].join(', ');

  previa.innerHTML = `
    <div class="tit-nota">Nota <b>#${nNota}</b> · BAMBAM BABY</div>
    <table>
      <thead>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align:center;font-weight:700">${qtds.RN}</td>
          <td style="text-align:center;font-weight:700">${qtds.P}</td>
          <td style="text-align:center;font-weight:700">${qtds.M}</td>
          <td style="text-align:center;font-weight:700">${qtds.G}</td>
          <td style="text-align:center;font-weight:700">${qtds.GG}</td>
          <td style="text-align:center;font-weight:800;background:#eef">${totalPecas}</td>
        </tr>
        <tr>
          <td>Data</td>
          <td colspan="2">Lote <b>${corteAtual.lote}</b></td>
          <td>Ref <b>${refsTxt}</b></td>
          <td colspan="2">Preço/peça <b>${formatBRL(preco)}</b></td>
        </tr>
        <tr>
          <td>${formatDataBR(data)}</td>
          <td colspan="3">Costureira <b>${costureira}</b></td>
          <td colspan="2" style="text-align:right">Total <b style="color:#080">${formatBRL(valor)}</b></td>
        </tr>
        <tr>
          <td colspan="6"><b>Cores:</b> ${coresTxt || '—'}</td>
        </tr>
        <tr>
          <td colspan="6" style="background:#000;color:white;text-align:center;padding:6px">1ª CHEGADA — data ___/___/______</td>
        </tr>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <tr>
          <td style="height:34px">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        </tr>
        <tr>
          <td colspan="6" style="background:#000;color:white;text-align:center;padding:6px">2ª CHEGADA — data ___/___/______</td>
        </tr>
        <tr>
          <th>RN</th><th>P</th><th>M</th><th>G</th><th>GG</th><th>TOTAL</th>
        </tr>
        <tr>
          <td style="height:34px">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <div style="text-align:center;margin-top:10px">
      <button onclick="window.print()" style="padding:6px 16px;font-size:12px;background:#000;color:white;border:none;border-radius:4px;cursor:pointer">🖨 Imprimir</button>
    </div>
  `;
  previa.classList.add('visivel');
  previa.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    toast(`✓ Nota #${numero} gerada — ${totalSaida} peças pra ${nome}`, 'ok');
    setTimeout(() => {
      if (sobrouAlgo) {
        // Recarrega o mesmo corte com o que sobrou
        window.location.href = 'designacao.html?corte=' + corteAtual.id;
      } else {
        // Volta pra seleção
        window.location.href = 'designacao.html';
      }
    }, 1500);
  } catch (e) {
    console.error('Erro ao gerar nota:', e);
    toast('Erro ao gerar nota: ' + e.message, 'err');
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
