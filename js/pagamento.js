// Tela de Pagamento — paga costureira agrupando notas em aberto

let costureiraAtual = null;
let notasCarregadas = [];   // notas em aberto da costureira
let saldoAdiantAtual = 0;

async function init() {
  await protegerRota();
  document.getElementById('data-pag').value = hojeISO();

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

  // Handlers
  document.getElementById('costureira').addEventListener('change', onCostureiraChange);
  document.getElementById('costureira').addEventListener('blur', onCostureiraChange);
  document.getElementById('btn-marcar-todas').addEventListener('click', marcarTodas);
  document.getElementById('btn-desmarcar').addEventListener('click', desmarcarTodas);
  document.getElementById('btn-cancelar').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('btn-pagar').addEventListener('click', registrarPagamento);
  document.getElementById('btn-novo-adiant').addEventListener('click', abrirModalNovoAdiantamento);
  document.getElementById('btn-confirmar-adiant').addEventListener('click', confirmarNovoAdiantamento);

  // Radios de adiantamento
  document.querySelectorAll('input[name="usar-adiant"]').forEach(r => {
    r.addEventListener('change', onMudarUsoAdiant);
  });
  document.getElementById('adiant-parcial').addEventListener('input', recalcTotal);
}

async function onCostureiraChange() {
  const nome = document.getElementById('costureira').value.trim().toUpperCase();
  if (!nome || nome === costureiraAtual) return;
  costureiraAtual = nome;
  await carregarDadosCostureira();
}

async function carregarDadosCostureira() {
  if (!costureiraAtual) return;

  // Carrega adiantamentos e notas em paralelo
  try {
    const [saldo, notas] = await Promise.all([
      saldoAdiantamento(costureiraAtual),
      notasEmAbertoDaCostureira(costureiraAtual)
    ]);
    saldoAdiantAtual = saldo;
    notasCarregadas = notas;
    renderAdiantamento();
    renderNotas();
  } catch (e) {
    console.error('Erro carregando dados:', e);
    toast('Erro: ' + e.message, 'err');
  }
}

function renderAdiantamento() {
  const bloco = document.getElementById('bloco-adiantamento');
  document.getElementById('saldo-adiant').textContent = formatBRL(saldoAdiantAtual);
  bloco.classList.add('visivel');
  // Reset opções
  document.querySelector('input[name="usar-adiant"][value="nao"]').checked = true;
  document.getElementById('adiant-parcial').value = '';
  document.getElementById('adiant-parcial').classList.remove('visivel');
}

function renderNotas() {
  const bloco = document.getElementById('bloco-notas');
  const vazio = document.getElementById('estado-vazio');
  const lista = document.getElementById('lista-notas');
  document.getElementById('contador-notas').textContent = `(${notasCarregadas.length})`;

  if (notasCarregadas.length === 0) {
    bloco.classList.remove('visivel');
    vazio.style.display = 'block';
    document.getElementById('bloco-total').classList.remove('visivel');
    return;
  }
  vazio.style.display = 'none';
  bloco.classList.add('visivel');

  lista.innerHTML = '';
  notasCarregadas.forEach(n => {
    const chegou = calcularTotalChegou(n);
    const fora = (n.total_saida || 0) - chegou;
    const jaPago = totalJaPagoDaNota(n);
    const valorRestante = (n.valor_nota || 0) - jaPago;
    const pecasSugeridas = chegou > 0 ? chegou : (n.total_saida || 0);

    const linha = document.createElement('div');
    linha.className = 'nota-linha';
    linha.dataset.numero = n.numero;
    linha.dataset.chegou = chegou;
    linha.dataset.totalSaida = n.total_saida || 0;
    linha.dataset.precoOriginal = n.preco_peca || 0;
    linha.dataset.valorPagoAnterior = jaPago;

    linha.innerHTML = `
      <div class="nota-cab">
        <input type="checkbox" class="chk-nota">
        <span class="num">#${n.numero}</span>
        <span class="lote-ref">${n.lote}/${n.ref}</span>
        <span class="status-pecas">
          <b>${chegou}</b>/${n.total_saida} chegou${fora > 0 ? ` · <span class="fora">${fora} fora</span>` : ''}
        </span>
        <span class="preco">${formatBRL(n.preco_peca || 0)}/pç</span>
        <span class="valor" data-valor-atual>${formatBRL(valorRestante)}</span>
        <span class="caret">▼</span>
      </div>
      <div class="nota-detalhes">
        <div class="campos">
          <div class="campo">
            <label>Peças a pagar</label>
            <input type="number" class="in-pecas" min="0" max="${n.total_saida}" value="${pecasSugeridas}">
          </div>
          <div class="campo">
            <label>Preço/peça (R$)</label>
            <input type="number" class="in-preco" step="0.01" min="0" value="${(n.preco_peca || 0).toFixed(2)}">
          </div>
          <div class="campo">
            <label>Valor desta nota</label>
            <input type="text" class="in-valor" readonly value="${formatBRL(pecasSugeridas * (n.preco_peca || 0))}" style="background:var(--surface-2);color:var(--success);font-weight:800;font-size:14px">
          </div>
        </div>
        <div class="info-linha">
          Saída original: <b>${n.total_saida} peças</b> em ${formatDataBR(n.data_saida)} · Já chegaram: <b>${chegou}</b> · Ainda fora: <b>${fora}</b>${jaPago > 0 ? ` · Já pago antes: <b>${formatBRL(jaPago)}</b>` : ''}
        </div>
      </div>
    `;

    const chk = linha.querySelector('.chk-nota');
    const cab = linha.querySelector('.nota-cab');
    const inPecas = linha.querySelector('.in-pecas');
    const inPreco = linha.querySelector('.in-preco');
    const inValor = linha.querySelector('.in-valor');
    const spValorAtual = linha.querySelector('[data-valor-atual]');

    // Click no cabeçalho abre/fecha detalhes (exceto no checkbox)
    cab.addEventListener('click', (ev) => {
      if (ev.target === chk) return;
      linha.classList.toggle('aberta');
    });

    chk.addEventListener('change', () => {
      linha.classList.toggle('marcada', chk.checked);
      recalcTotal();
    });

    function atualizaValor() {
      const p = parseInt(inPecas.value) || 0;
      const pr = parseFloat(inPreco.value) || 0;
      const v = p * pr;
      inValor.value = formatBRL(v);
      spValorAtual.textContent = formatBRL(v);
      if (chk.checked) recalcTotal();
    }
    inPecas.addEventListener('input', atualizaValor);
    inPreco.addEventListener('input', atualizaValor);

    lista.appendChild(linha);
  });
  recalcTotal();
}

function calcularTotalChegou(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  let t = 0;
  TAMS.forEach(tam => t += (c1[tam] || 0) + (c2[tam] || 0));
  return t;
}

function totalJaPagoDaNota(n) {
  return (n.pagamentos || []).reduce((a, p) => a + (p.valor || 0), 0);
}

function marcarTodas() {
  document.querySelectorAll('.chk-nota').forEach(chk => {
    chk.checked = true;
    chk.closest('.nota-linha').classList.add('marcada');
  });
  recalcTotal();
}
function desmarcarTodas() {
  document.querySelectorAll('.chk-nota').forEach(chk => {
    chk.checked = false;
    chk.closest('.nota-linha').classList.remove('marcada');
  });
  recalcTotal();
}

function onMudarUsoAdiant() {
  const modo = document.querySelector('input[name="usar-adiant"]:checked').value;
  document.getElementById('adiant-parcial').classList.toggle('visivel', modo === 'parcial');
  recalcTotal();
}

function calcularValorMarcadas() {
  let total = 0, qtd = 0;
  document.querySelectorAll('.nota-linha').forEach(linha => {
    const chk = linha.querySelector('.chk-nota');
    if (!chk.checked) return;
    const pecas = parseInt(linha.querySelector('.in-pecas').value) || 0;
    const preco = parseFloat(linha.querySelector('.in-preco').value) || 0;
    total += pecas * preco;
    qtd++;
  });
  return { total, qtd };
}

function calcularUsoAdiantamento() {
  const modo = document.querySelector('input[name="usar-adiant"]:checked').value;
  if (modo === 'nao') return 0;
  if (modo === 'tudo') return saldoAdiantAtual;
  if (modo === 'parcial') {
    const v = parseFloat(document.getElementById('adiant-parcial').value) || 0;
    return Math.min(v, saldoAdiantAtual);
  }
  return 0;
}

function recalcTotal() {
  const { total, qtd } = calcularValorMarcadas();
  document.getElementById('qtd-marcadas').textContent = qtd;
  document.getElementById('v-marcadas').textContent = formatBRL(total);

  const usoAdiant = calcularUsoAdiantamento();
  // Adiantamento não pode ser mais que o valor das notas
  const adiantEfetivo = Math.min(usoAdiant, total);
  const totalPagar = total - adiantEfetivo;

  const kAdiant = document.getElementById('k-adiant');
  const vAdiant = document.getElementById('v-adiant');
  if (adiantEfetivo > 0) {
    kAdiant.style.display = 'block';
    vAdiant.style.display = 'block';
    vAdiant.textContent = '− ' + formatBRL(adiantEfetivo);
  } else {
    kAdiant.style.display = 'none';
    vAdiant.style.display = 'none';
  }

  document.getElementById('v-total').textContent = formatBRL(totalPagar);

  const bloco = document.getElementById('bloco-total');
  if (qtd > 0) bloco.classList.add('visivel');
  else bloco.classList.remove('visivel');
}

// ==== Novo Adiantamento ====
function abrirModalNovoAdiantamento() {
  if (!costureiraAtual) return;
  document.getElementById('novo-adiant-cost').textContent = costureiraAtual;
  document.getElementById('novo-adiant-valor').value = '';
  document.getElementById('modal-novo-adiant').classList.add('visivel');
  setTimeout(() => document.getElementById('novo-adiant-valor').focus(), 100);
}

async function confirmarNovoAdiantamento() {
  const valor = parseFloat(document.getElementById('novo-adiant-valor').value);
  if (!valor || valor <= 0) {
    toast('Digite um valor válido', 'err');
    return;
  }
  const btn = document.getElementById('btn-confirmar-adiant');
  btn.disabled = true;
  try {
    await registrarAdiantamento(costureiraAtual, valor, hojeISO());
    toast(`✓ Adiantamento de ${formatBRL(valor)} registrado pra ${costureiraAtual}`, 'ok');
    document.getElementById('modal-novo-adiant').classList.remove('visivel');
    await carregarDadosCostureira();
    btn.disabled = false;
  } catch (e) {
    console.error('Erro:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
  }
}

// ==== Registrar Pagamento ====
async function registrarPagamento() {
  const btn = document.getElementById('btn-pagar');
  btn.disabled = true;
  btn.textContent = '⏳ Registrando...';

  try {
    const dataPag = document.getElementById('data-pag').value;
    const forma = document.getElementById('forma-pag').value;
    const obs = document.getElementById('obs').value.trim();

    if (!dataPag) throw new Error('Preencha a data do pagamento');
    if (!costureiraAtual) throw new Error('Escolha a costureira');

    // Coletar notas marcadas
    const notasPagas = [];
    let valorBruto = 0;
    document.querySelectorAll('.nota-linha').forEach(linha => {
      const chk = linha.querySelector('.chk-nota');
      if (!chk.checked) return;
      const numero = linha.dataset.numero;
      const pecas = parseInt(linha.querySelector('.in-pecas').value) || 0;
      const preco = parseFloat(linha.querySelector('.in-preco').value) || 0;
      const valor = pecas * preco;
      if (valor > 0) {
        notasPagas.push({ nota_numero: numero, pecas_pagas: pecas, preco_peca: preco, valor });
        valorBruto += valor;
      }
    });

    if (notasPagas.length === 0) throw new Error('Marque ao menos 1 nota com valor > 0');

    // Consumir adiantamento (se escolhido)
    const usoAdiant = calcularUsoAdiantamento();
    const adiantEfetivo = Math.min(usoAdiant, valorBruto);
    const valorLiquido = valorBruto - adiantEfetivo;

    let consumoAdiant = { consumidos: [], faltou: 0 };
    if (adiantEfetivo > 0) {
      consumoAdiant = await consumirAdiantamentos(costureiraAtual, adiantEfetivo);
    }

    // Criar registro de pagamento
    const pag = {
      data: dataPag,
      costureira: costureiraAtual,
      forma,
      observacao: obs,
      notas_pagas: notasPagas,
      valor_bruto: valorBruto,
      adiantamento_usado: adiantEfetivo,
      valor_liquido: valorLiquido,
      adiantamentos_consumidos: consumoAdiant.consumidos
    };
    const pagId = await salvarPagamento(pag);

    // Atualiza cada nota: registra o pagamento, atualiza status
    for (const np of notasPagas) {
      const nota = notasCarregadas.find(n => n.numero === np.nota_numero);
      if (!nota) continue;
      const pagamentosAntes = nota.pagamentos || [];
      const novosPagamentos = [...pagamentosAntes, { pag_id: pagId, data: dataPag, valor: np.valor, pecas: np.pecas_pagas }];
      const totalPago = novosPagamentos.reduce((a, p) => a + (p.valor || 0), 0);
      const valorTotalNota = (nota.total_saida || 0) * (nota.preco_peca || 0);
      // Determinar status: paga_total se pagou tudo ou se todas as peças foram pagas
      let novoStatus = 'paga_parcial';
      const pecasPagasTotal = novosPagamentos.reduce((a, p) => a + (p.pecas || 0), 0);
      if (pecasPagasTotal >= nota.total_saida) novoStatus = 'paga_total';
      await atualizarNota(np.nota_numero, {
        pagamentos: novosPagamentos,
        status: novoStatus,
        // Se o preço mudou nesta nota, atualiza também (reajuste retroativo)
        preco_peca: np.preco_peca,
        valor_nota: (nota.total_saida || 0) * np.preco_peca
      });
    }

    toast(`✓ Pagamento de ${formatBRL(valorLiquido)} registrado pra ${costureiraAtual}`, 'ok');
    // Mostra o comprovante
    setTimeout(() => mostrarComprovante(pag, pagId), 800);
  } catch (e) {
    console.error('Erro pagamento:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = '✓ Registrar pagamento';
  }
}

function mostrarComprovante(pag, pagId) {
  const caixa = document.getElementById('caixa-comprovante');
  const linhasNotas = pag.notas_pagas.map(np => `
    <tr>
      <td class="n">#${np.nota_numero}</td>
      <td class="n">${np.pecas_pagas}</td>
      <td class="v">${formatBRL(np.preco_peca)}</td>
      <td class="v">${formatBRL(np.valor)}</td>
    </tr>
  `).join('');

  caixa.innerHTML = `
    <div class="cabec-comp">
      <div class="tit">RECIBO DE PAGAMENTO</div>
      <div class="data">Recebi de BAMBAM BABY</div>
    </div>

    <div style="font-family:'Courier New',monospace;font-size:13px;margin-bottom:12px">
      <b>${pag.costureira}</b><br>
      Data: <b>${formatDataBR(pag.data)}</b> · Forma: <b>${pag.forma}</b>
    </div>

    <table class="comp-tabela">
      <thead>
        <tr>
          <th>Nota</th><th>Peças</th><th>Preço</th><th>Valor</th>
        </tr>
      </thead>
      <tbody>
        ${linhasNotas}
        <tr class="subtotal">
          <td colspan="3">Subtotal notas</td>
          <td class="v">${formatBRL(pag.valor_bruto)}</td>
        </tr>
        ${pag.adiantamento_usado > 0 ? `
        <tr class="adiant">
          <td colspan="3">(−) Adiantamento usado</td>
          <td class="v">${formatBRL(pag.adiantamento_usado)}</td>
        </tr>` : ''}
        <tr class="total-final">
          <td colspan="3">TOTAL PAGO EM ${pag.forma.toUpperCase()}</td>
          <td class="v">${formatBRL(pag.valor_liquido)}</td>
        </tr>
      </tbody>
    </table>

    ${pag.observacao ? `<div class="comp-obs"><b>Obs:</b> ${pag.observacao}</div>` : ''}

    <div class="comp-assin">
      <div class="col-assin">
        <div class="linha">Assinatura da costureira</div>
      </div>
      <div class="col-assin">
        <div class="linha">Assinatura BAMBAM BABY</div>
      </div>
    </div>

    <div class="botoes" style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid #ddd">
      <button onclick="window.print()" style="padding:10px 20px;background:#000;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px">🖨 Imprimir recibo</button>
      <button onclick="window.location.reload()" style="padding:10px 20px;background:var(--bg-accent-strong);color:white;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px">✓ Concluir</button>
    </div>
  `;
  document.getElementById('modal-comprovante').classList.add('visivel');
}

document.addEventListener('DOMContentLoaded', init);
