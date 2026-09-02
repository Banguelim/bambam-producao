// Tela de Pedido de venda — cliente + itens (ref/cor/tamanho) + preço.
// "Salvar" grava como rascunho (status aberto), sem mexer em estoque/financeiro.
// "Concluir pedido" trava o pedido, dá baixa no estoque (produção) e gera as
// parcelas em Contas a Receber. Também imprime 2 romaneios: separação
// (detalhado por ref/cor/tamanho) e conferência (resumido por ref).

let pClientes = [];
let pVendedores = [];
let pTabelas = [];
let pedidoItens = [];      // [{ref, cor, descricao, qtds:{RN,P,M,G,GG}, qtd, preco, subtotal}]
let numeroPedidoAtual = null;
let statusPedidoAtual = 'aberto';
let itDescricaoAtual = '';  // descrição do produto da ref sendo digitada agora
let clienteBloqueadoAtual = null; // objeto do cliente quando ele está 🔒 bloqueado (inadimplente)

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();
  sugerirVencimento();

  try {
    const [cs, vs, ts, refs] = await Promise.all([
      listarClientes(), listarVendedores(), listarTabelas(), listarRefs()
    ]);
    pClientes = cs || [];
    pVendedores = vs || [];
    pTabelas = ts || [];
    popularDatalistsCabecalho(refs || []);
  } catch (e) { console.warn('Falha ao carregar cadastros:', e); }

  // Cores: pré-definidas + salvas
  try {
    const dl = document.getElementById('cores-list');
    const jaTem = new Set();
    CORES.forEach(c => { const o = document.createElement('option'); o.value = c; dl.appendChild(o); jaTem.add(c); });
    const salvas = await listarCoresSalvas();
    salvas.forEach(nome => {
      if (!jaTem.has(nome.toUpperCase())) {
        const o = document.createElement('option'); o.value = nome; dl.appendChild(o);
      }
    });
  } catch (e) { console.warn('Cores não carregadas:', e); }

  // Grade de 5 colunas (RN P M G GG) pra digitar cor+qtd rápido — igual ao Novo Corte
  const grade = document.getElementById('grade-item');
  TAMS.forEach(tam => grade.appendChild(buildColItem(tam)));
  recalcItem();

  document.getElementById('p-cliente').addEventListener('change', onClienteChange);
  document.getElementById('it-ref').addEventListener('change', onRefChange);
  document.getElementById('it-tabela').addEventListener('change', onRefChange);
  document.getElementById('p-desconto').addEventListener('input', renderItens);
  document.getElementById('btn-add-ref').addEventListener('click', confirmarRefNoPedido);
  document.getElementById('btn-novo-pedido').addEventListener('click', () => { if (confirm('Descartar e começar um pedido novo?')) limparFormulario(); });
  document.getElementById('btn-salvar-pedido').addEventListener('click', () => salvarPedidoBtn(false));
  document.getElementById('btn-concluir-pedido').addEventListener('click', concluirPedidoBtn);
  document.getElementById('btn-romaneio-separacao').addEventListener('click', () => imprimirRomaneio('separacao'));
  document.getElementById('btn-romaneio-conferencia').addEventListener('click', () => imprimirRomaneio('conferencia'));
  document.getElementById('btn-confirmacao').addEventListener('click', imprimirConfirmacao);
  document.getElementById('btn-email-cliente').addEventListener('click', enviarPorEmail);
  document.getElementById('btn-whatsapp-cliente').addEventListener('click', enviarPorWhatsapp);

  renderItens();

  // Abrir direto se veio ?pedido=NNNN
  const params = new URLSearchParams(location.search);
  const num = params.get('pedido');
  if (num) await abrirPedido(num);
}

function popularDatalistsCabecalho(refs) {
  const dlCli = document.getElementById('clientes-list');
  dlCli.innerHTML = '';
  pClientes.forEach(c => { const o = document.createElement('option'); o.value = c.nome; dlCli.appendChild(o); });

  const dlVend = document.getElementById('vendedores-list');
  dlVend.innerHTML = '';
  pVendedores.forEach(v => { const o = document.createElement('option'); o.value = v.nome; dlVend.appendChild(o); });

  const dlRef = document.getElementById('refs-list');
  dlRef.innerHTML = '';
  refs.forEach(r => { const o = document.createElement('option'); o.value = r.ref; dlRef.appendChild(o); });

  // Tabela do cabeçalho do pedido (padrão do cliente) e tabela da entrada de
  // item (pode ser trocada por ref/leva — ex: essa ref sai pela tabela B)
  ['p-tabela', 'it-tabela'].forEach(id => {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    pTabelas.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o); });
  });
}

function sugerirVencimento() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  document.getElementById('p-vencimento').value = d.toISOString().slice(0, 10);
}

function onClienteChange() {
  const nome = document.getElementById('p-cliente').value.trim();
  const c = pClientes.find(x => x.nome.toUpperCase() === nome.toUpperCase());
  if (c) {
    document.getElementById('p-vendedor').value = c.vendedor || '';
    if (c.tabela_preco) {
      document.getElementById('p-tabela').value = c.tabela_preco;
      document.getElementById('it-tabela').value = c.tabela_preco;
    }
  }
  verificarBloqueioCliente();
}

// Cliente 🔒 bloqueado (inadimplente, marcado manualmente em Clientes) — trava
// total: mostra aviso e desabilita Salvar/Concluir enquanto ele estiver
// selecionado. Só desbloqueando na ficha do cliente (Clientes) libera de novo.
function verificarBloqueioCliente() {
  const nome = document.getElementById('p-cliente').value.trim();
  const c = pClientes.find(x => x.nome.toUpperCase() === nome.toUpperCase());

  if (c && c.bloqueado === true) {
    clienteBloqueadoAtual = c;
  } else if (c && clienteInativoHaMuitoTempo(c)) {
    // Ainda não foi "pego" pela tela de Clientes (aplicarBloqueioPorInatividade)
    // — trava aqui mesmo assim, e tenta persistir em segundo plano (não
    // trava a tela se falhar, o aviso já protege de qualquer forma).
    const motivo = `Inativo — sem pedidos há mais de 2 anos (última compra: ${formatDataBR(c.data_ultimo_pedido)})`;
    clienteBloqueadoAtual = { ...c, motivo_bloqueio: motivo };
    if (!c.bloqueado) {
      salvarCliente({ id: c.id, bloqueado: true, motivo_bloqueio: motivo }).catch(() => {});
      c.bloqueado = true; // evita reenviar o mesmo salvamento a cada troca de campo
      c.motivo_bloqueio = motivo;
    }
  } else {
    clienteBloqueadoAtual = null;
  }

  const aviso = document.getElementById('aviso-cliente-bloqueado');
  if (clienteBloqueadoAtual) {
    document.getElementById('aviso-bloqueio-nome').textContent = clienteBloqueadoAtual.nome;
    document.getElementById('aviso-bloqueio-motivo').textContent = clienteBloqueadoAtual.motivo_bloqueio || 'sem motivo registrado';
    aviso.style.display = '';
  } else {
    aviso.style.display = 'none';
  }
  atualizarCabecalhoNumero();
}

// Preço puxado pela tabela escolhida NA ENTRADA DE ITEM (it-tabela), que
// pode ser diferente da tabela padrão do cabeçalho — ex: cliente é tabela A
// mas essa ref específica sai pela tabela B. Também busca a descrição do
// produto cadastrado, pra mostrar o que é essa ref enquanto digita.
async function onRefChange() {
  const ref = document.getElementById('it-ref').value.trim().toUpperCase();
  const tabela = document.getElementById('it-tabela').value;
  itDescricaoAtual = '';
  document.getElementById('it-descricao-linha').style.display = 'none';
  if (!ref) return;
  try {
    const produto = await buscarProdutoVenda(ref);
    if (produto && produto.nome) {
      itDescricaoAtual = produto.nome;
      document.getElementById('it-descricao-texto').textContent = produto.nome;
      document.getElementById('it-descricao-linha').style.display = '';
    }
  } catch (e) { console.warn('Produto não encontrado:', e); }
  if (!tabela) return;
  try {
    const p = await precoVendaDe(ref, tabela);
    if (p !== null && p > 0) document.getElementById('it-preco').value = p.toFixed(2);
  } catch (e) { console.warn('Preço não encontrado:', e); }
}

// ==== GRADE DE ENTRADA (5 colunas RN/P/M/G/GG, igual ao Novo Corte) ====
// Cada coluna guarda suas próprias linhas cor+qtd, de forma independente
// (aqui NÃO replica pras outras colunas — cada tamanho tem sua quantidade,
// porque num pedido de venda os tamanhos raramente vêm iguais).

function buildColItem(tam) {
  const col = document.createElement('div');
  col.className = 'col';
  col.dataset.tam = tam;
  col.innerHTML = `
    <div class="col-h">
      <span>${tam} <span class="check">✓</span></span>
    </div>
    <div class="entradas"></div>
    <div class="nova-entrada">
      <div class="cor-field">
        <input list="cores-list" class="cor-input" placeholder="cor">
        <span class="arrow">▾</span>
      </div>
      <input type="number" class="qty-input" placeholder="qtd">
    </div>
    <button class="confirmar-btn">desabilitar ${tam}</button>
    <div class="subtot-col">
      <div class="cell"><span>total</span><b data-total>0</b></div>
    </div>
  `;

  const corInput = col.querySelector('.cor-input');
  const qtyInput = col.querySelector('.qty-input');
  corInput.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === 'Tab') && corInput.value.trim()) {
      e.preventDefault(); qtyInput.focus();
    }
  });
  qtyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); salvarEntradaNovaEmColItem(col); }
  });

  col.querySelector('.confirmar-btn').addEventListener('click', () => {
    col.classList.toggle('desabilitada');
    col.querySelector('.entradas').style.opacity = col.classList.contains('desabilitada') ? '0.3' : '1';
    corInput.disabled = qtyInput.disabled = col.classList.contains('desabilitada');
    atualizarBtnColItem(col);
    recalcItem();
  });

  atualizarBtnColItem(col);
  return col;
}

function salvarEntradaNovaEmColItem(col) {
  const corInput = col.querySelector('.cor-input');
  const qtyInput = col.querySelector('.qty-input');
  const cor = corInput.value.trim().toUpperCase();
  const q = parseInt(qtyInput.value);
  if (!cor || !q) return;

  addEntradaItem(col, cor, q);
  salvarCorSeNova(cor);

  corInput.value = '';
  qtyInput.value = '';
  corInput.focus();
  atualizarBtnColItem(col);
  recalcItem();
}

function addEntradaItem(col, cor, q) {
  const e = document.createElement('div');
  e.className = 'cor-linha';
  e.innerHTML = `
    <span class="cor" title="${cor}">${abrevCor(cor)}</span>
    <span class="q" contenteditable="true" spellcheck="false" inputmode="numeric"
          style="min-width:28px;text-align:right;cursor:text;border-bottom:1px dashed var(--border-accent)">${q}</span>
    <button class="x">×</button>
  `;
  const qEl = e.querySelector('.q');
  qEl.addEventListener('focus', () => selecionarTudo(qEl));
  qEl.addEventListener('input', () => { sanitizarQtd(qEl); atualizarBtnColItem(col); recalcItem(); });
  qEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); qEl.blur(); } });
  e.querySelector('.x').addEventListener('click', () => { e.remove(); atualizarBtnColItem(col); recalcItem(); });
  col.querySelector('.entradas').appendChild(e);
}

function atualizarBtnColItem(col) {
  const btn = col.querySelector('.confirmar-btn');
  const tam = col.dataset.tam;
  const desabilitada = col.classList.contains('desabilitada');
  btn.textContent = desabilitada ? `habilitar ${tam}` : `desabilitar ${tam}`;
  btn.style.opacity = desabilitada ? '0.6' : '1';
}

function recalcItem() {
  let totGeral = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`#grade-item .col[data-tam="${tam}"]`);
    const desabilitada = col.classList.contains('desabilitada');
    let c = 0;
    if (!desabilitada) col.querySelectorAll('.cor-linha .q').forEach(q => c += parseInt(q.textContent) || 0);
    col.querySelector('[data-total]').textContent = desabilitada ? '—' : c;
    const ct = document.querySelector(`#col-totais-item .ct[data-ct="${tam}"]`);
    ct.querySelector('b').textContent = desabilitada ? '—' : c;
    totGeral += desabilitada ? 0 : c;
  });
  document.getElementById('lbl-t-item').textContent = totGeral;
}

function limparGradeItem() {
  document.getElementById('it-ref').value = '';
  document.getElementById('it-preco').value = '';
  itDescricaoAtual = '';
  document.getElementById('it-descricao-linha').style.display = 'none';
  document.querySelectorAll('#grade-item .col').forEach(col => {
    col.querySelector('.entradas').innerHTML = '';
    col.querySelector('.cor-input').value = '';
    col.querySelector('.qty-input').value = '';
    col.classList.remove('desabilitada');
    col.querySelector('.entradas').style.opacity = '1';
    col.querySelector('.cor-input').disabled = false;
    col.querySelector('.qty-input').disabled = false;
    atualizarBtnColItem(col);
  });
  recalcItem();
  document.getElementById('it-ref').focus();
}

// Lê as 5 colunas, agrupa por cor (juntando os tamanhos) e joga no pedido —
// tudo com a mesma ref e o mesmo preço (o preço do campo acima da grade).
function confirmarRefNoPedido() {
  const ref = document.getElementById('it-ref').value.trim().toUpperCase();
  const preco = parseFloat(document.getElementById('it-preco').value) || 0;
  if (!ref) { toast('Preencha a referência', 'err'); return; }
  if (!preco) { toast('Preencha o preço (ou cadastre a ref na tabela de preço)', 'err'); return; }

  const porCor = {}; // { COR: {RN,P,M,G,GG} }
  TAMS.forEach(tam => {
    const col = document.querySelector(`#grade-item .col[data-tam="${tam}"]`);
    if (col.classList.contains('desabilitada')) return;
    col.querySelectorAll('.cor-linha').forEach(e => {
      const cor = e.querySelector('.cor').title || e.querySelector('.cor').textContent;
      const q = parseInt(e.querySelector('.q').textContent) || 0;
      if (q <= 0) return;
      if (!porCor[cor]) porCor[cor] = { RN: 0, P: 0, M: 0, G: 0, GG: 0 };
      porCor[cor][tam] += q;
    });
  });

  const cores = Object.keys(porCor);
  if (cores.length === 0) { toast('Adicione ao menos uma cor + quantidade CONFIRMADA', 'err'); return; }

  cores.forEach(cor => {
    const qtds = porCor[cor];
    const qtd = Object.values(qtds).reduce((a, v) => a + v, 0);
    const subtotal = Math.round(qtd * preco * 100) / 100;
    const existente = pedidoItens.find(i => i.ref === ref && i.cor === cor && i.preco === preco);
    if (existente) {
      TAMS.forEach(t => existente.qtds[t] += qtds[t]);
      existente.qtd = Object.values(existente.qtds).reduce((a, v) => a + v, 0);
      existente.subtotal = Math.round(existente.qtd * existente.preco * 100) / 100;
    } else {
      pedidoItens.push({ ref, cor, descricao: itDescricaoAtual, qtds, qtd, preco, subtotal });
    }
  });

  toast(`✓ ${cores.length} cor(es) da ref ${ref} adicionadas ao pedido`, 'ok');
  limparGradeItem();
  renderItens();
}

function removerItem(idx) {
  pedidoItens.splice(idx, 1);
  renderItens();
}

// Corrige a quantidade de UM tamanho de um item já adicionado. Se zerar
// todos os tamanhos do item, remove a linha inteira (não faz sentido ficar
// uma linha com 0 peças).
function editarQtdItem(idx, tam, valorDigitado) {
  const it = pedidoItens[idx];
  if (!it) return;
  const v = Math.max(0, parseInt(valorDigitado) || 0);
  it.qtds[tam] = v;
  it.qtd = Object.values(it.qtds).reduce((a, x) => a + x, 0);
  it.subtotal = Math.round(it.qtd * it.preco * 100) / 100;
  if (it.qtd === 0) {
    pedidoItens.splice(idx, 1);
    toast(`Linha de ${it.ref} ${it.cor} removida (quantidade zerada)`, '');
  }
  renderItens();
}

// Corrige o preço (peça) de um item já adicionado.
function editarPrecoItem(idx, valorDigitado) {
  const it = pedidoItens[idx];
  if (!it) return;
  const v = parseFloat(valorDigitado);
  if (!v || v <= 0) { toast('Preço inválido', 'err'); renderItens(); return; }
  it.preco = v;
  it.subtotal = Math.round(it.qtd * it.preco * 100) / 100;
  renderItens();
}

// Desconto (%) do pedido — aplicado em cima do preço de CADA item, então
// reflete no valor individual de cada linha (não só no total geral).
function descontoAtual() {
  const v = parseFloat(document.getElementById('p-desconto').value);
  if (!v || v < 0) return 0;
  return Math.min(v, 100);
}
function precoComDesconto(preco, desconto) {
  return Math.round(preco * (1 - desconto / 100) * 10000) / 10000; // 4 casas pra não perder centavo no arredondamento do subtotal
}

// Enquanto o pedido está aberto (não concluído), dá pra corrigir direto na
// tabela: quantidade de cada tamanho (clica no número, digita, Enter/sai do
// campo) e o preço (peça) — útil enquanto o pedido ainda está sendo separado
// e precisa de um ajuste. Depois de concluído, fica só leitura.
function renderItens() {
  const corpo = document.getElementById('itens-corpo');
  const tabela = document.getElementById('tabela-itens');
  const vazio = document.getElementById('itens-vazio');
  const desconto = descontoAtual();
  const editavel = statusPedidoAtual !== 'concluido';
  corpo.innerHTML = '';

  if (pedidoItens.length === 0) {
    tabela.style.display = 'none';
    vazio.style.display = 'block';
  } else {
    tabela.style.display = '';
    vazio.style.display = 'none';
    pedidoItens.forEach((it, idx) => {
      const precoFinal = desconto > 0 ? precoComDesconto(it.preco, desconto) : it.preco;
      const subtotalFinal = Math.round(it.qtd * precoFinal * 100) / 100;

      const tamsHtml = TAMS.filter(t => it.qtds[t] > 0).map(t => editavel
        ? `<span class="tam-chip">${t}:<span class="editavel" contenteditable="true" spellcheck="false" inputmode="numeric" data-idx="${idx}" data-tam="${t}">${it.qtds[t]}</span></span>`
        : `<span class="tam-chip">${t}:${it.qtds[t]}</span>`
      ).join(' ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ref">${it.ref}</td>
        <td class="desc" title="${it.descricao || ''}">${it.descricao || '—'}</td>
        <td>${it.cor}</td>
        <td class="qtds">${tamsHtml}</td>
        <td class="num">${it.qtd}</td>
        <td class="num preco">${editavel
          ? `<input type="number" class="preco-input" step="0.01" min="0" value="${it.preco}" data-idx="${idx}" style="width:72px;text-align:right;padding:3px 5px;font-weight:700">`
          : formatBRL(precoFinal)}</td>
        <td class="num sub">${formatBRL(subtotalFinal)}</td>
        <td><button class="btn-x" title="remover">×</button></td>
      `;
      tr.querySelector('.btn-x').addEventListener('click', () => removerItem(idx));

      if (editavel) {
        tr.querySelectorAll('.qtds .editavel').forEach(span => {
          span.addEventListener('focus', () => selecionarTudo(span));
          span.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); span.blur(); } });
          span.addEventListener('blur', () => editarQtdItem(parseInt(span.dataset.idx), span.dataset.tam, span.textContent));
        });
        const precoInput = tr.querySelector('.preco-input');
        precoInput.addEventListener('change', () => editarPrecoItem(idx, precoInput.value));
        precoInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); precoInput.blur(); } });
      }
      corpo.appendChild(tr);
    });
  }

  document.getElementById('th-preco').textContent = desconto > 0 ? `Preço (-${desconto}%)` : 'Preço';

  const totalPecas = pedidoItens.reduce((a, i) => a + i.qtd, 0);
  const totalSemDesconto = Math.round(pedidoItens.reduce((a, i) => a + i.subtotal, 0) * 100) / 100;
  const totalValor = totalPedido();
  document.getElementById('lbl-total-pecas').textContent = totalPecas;
  document.getElementById('lbl-total-valor').textContent = formatBRL(totalValor);

  const infoDesc = document.getElementById('lbl-desconto-info');
  if (desconto > 0 && totalSemDesconto > 0) {
    infoDesc.style.display = '';
    document.getElementById('lbl-desconto-pct').textContent = desconto + '%';
    document.getElementById('lbl-total-sem-desconto').textContent = formatBRL(totalSemDesconto);
  } else {
    infoDesc.style.display = 'none';
  }
}

// Total do pedido já com o desconto aplicado item a item (soma dos subtotais
// finais, não desconta em cima do total bruto — evita diferença de centavos).
function totalPedido() {
  const desconto = descontoAtual();
  return Math.round(pedidoItens.reduce((a, i) => {
    const precoFinal = desconto > 0 ? precoComDesconto(i.preco, desconto) : i.preco;
    return a + i.qtd * precoFinal;
  }, 0) * 100) / 100;
}

// ==== MONTAR / SALVAR PEDIDO ====
function montarPedidoObj() {
  const nome = document.getElementById('p-cliente').value.trim();
  const cliObj = pClientes.find(c => c.nome.toUpperCase() === nome.toUpperCase());
  return {
    numero: numeroPedidoAtual || null,
    cliente: nome,
    cliente_id: cliObj ? cliObj.id : null,
    vendedor: document.getElementById('p-vendedor').value.trim().toUpperCase(),
    tabela_preco: document.getElementById('p-tabela').value,
    data_pedido: document.getElementById('p-data').value,
    prazo_pagamento: document.getElementById('p-prazo').value.trim(),
    itens: pedidoItens,
    total_pecas: pedidoItens.reduce((a, i) => a + i.qtd, 0),
    desconto_pct: descontoAtual(),
    total_valor: totalPedido(),
    parcelas: parseInt(document.getElementById('p-parcelas').value) || 1,
    data_vencimento_base: document.getElementById('p-vencimento').value,
    status: statusPedidoAtual
  };
}

function validarCabecalho() {
  const cliente = document.getElementById('p-cliente').value.trim();
  const data = document.getElementById('p-data').value;
  if (!cliente) { toast('Escolha ou digite o cliente', 'err'); return false; }
  if (!data) { toast('Preencha a data', 'err'); return false; }
  if (pedidoItens.length === 0) { toast('Adicione ao menos um item', 'err'); return false; }
  // Trava mesmo se o aviso visual tiver sido burlado de algum jeito
  verificarBloqueioCliente();
  if (clienteBloqueadoAtual) {
    toast(`${clienteBloqueadoAtual.nome} está 🔒 bloqueado — não é possível salvar/concluir pedido pra esse cliente`, 'err');
    return false;
  }
  return true;
}

async function salvarPedidoBtn(silencioso) {
  if (!validarCabecalho()) return;
  const btn = document.getElementById('btn-salvar-pedido');
  btn.disabled = true;
  try {
    const pedido = montarPedidoObj();
    pedido.status = 'aberto';
    const numero = await salvarPedido(pedido);
    numeroPedidoAtual = numero;
    statusPedidoAtual = 'aberto';
    atualizarCabecalhoNumero();
    if (!silencioso) toast(`✓ Pedido ${numero} salvo`, 'ok');
    if (!(pedido.vendedor && pVendedores.some(v => v.nome === pedido.vendedor))) {
      if (pedido.vendedor) await salvarVendedor(pedido.vendedor);
    }
    return numero;
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function concluirPedidoBtn() {
  if (!validarCabecalho()) return;
  const parcelas = parseInt(document.getElementById('p-parcelas').value) || 1;
  const vencBase = document.getElementById('p-vencimento').value;
  if (!vencBase) { toast('Preencha a data do 1º vencimento', 'err'); return; }
  if (!confirm(`Concluir este pedido vai:\n\n• Dar baixa no estoque das peças\n• Gerar ${parcelas} parcela(s) em Contas a Receber\n\nDepois de concluído não dá mais pra editar os itens. Confirma?`)) return;

  const btn = document.getElementById('btn-concluir-pedido');
  btn.disabled = true;
  try {
    // 1) Garante que está salvo primeiro (pra ter número)
    const numero = numeroPedidoAtual || await salvarPedidoBtn(true);
    if (!numero) throw new Error('Não foi possível salvar o pedido');

    // 2) Baixa no estoque de produção (uma chamada por ref/cor/tamanho)
    const dataPedido = document.getElementById('p-data').value;
    for (const it of pedidoItens) {
      for (const t of TAMS) {
        const q = it.qtds[t] || 0;
        if (q > 0) await adicionarAoEstoque(it.ref, it.cor, t, -q, dataPedido);
      }
    }

    // 3) Marca concluído
    const pedido = montarPedidoObj();
    pedido.numero = numero;
    pedido.status = 'concluido';
    pedido.concluido_em = firebase.firestore.FieldValue.serverTimestamp();
    await salvarPedido(pedido);
    numeroPedidoAtual = numero;
    statusPedidoAtual = 'concluido';
    atualizarCabecalhoNumero();

    // 4) Gera contas a receber (parcelas)
    await gerarContasReceber({ numero, cliente: pedido.cliente, cliente_id: pedido.cliente_id, total_valor: pedido.total_valor }, parcelas, vencBase);

    toast(`✓ Pedido ${numero} concluído — estoque baixado e ${parcelas} parcela(s) geradas`, 'ok grande');
  } catch (e) {
    console.error(e);
    toast('Erro ao concluir: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

function atualizarCabecalhoNumero() {
  document.getElementById('lbl-num-pedido').textContent = numeroPedidoAtual || 'novo';
  document.getElementById('lbl-status-pedido').textContent = statusPedidoAtual === 'concluido' ? '✓ concluído' : 'rascunho';
  const pedidoConcluido = statusPedidoAtual === 'concluido';
  document.getElementById('btn-add-ref').disabled = pedidoConcluido;
  document.getElementById('btn-salvar-pedido').style.display = pedidoConcluido ? 'none' : '';
  document.getElementById('btn-concluir-pedido').style.display = pedidoConcluido ? 'none' : '';
  // Cliente bloqueado trava Salvar/Concluir (mas não esconde — o usuário
  // precisa ver que existem, só não consegue clicar)
  const travado = !pedidoConcluido && !!clienteBloqueadoAtual;
  document.getElementById('btn-salvar-pedido').disabled = travado;
  document.getElementById('btn-concluir-pedido').disabled = travado;
}

function limparFormulario() {
  numeroPedidoAtual = null;
  statusPedidoAtual = 'aberto';
  pedidoItens = [];
  document.getElementById('p-cliente').value = '';
  document.getElementById('p-vendedor').value = '';
  document.getElementById('p-tabela').selectedIndex = 0;
  document.getElementById('p-data').value = hojeISO();
  document.getElementById('p-prazo').value = '';
  document.getElementById('p-parcelas').value = 1;
  document.getElementById('p-desconto').value = 0;
  sugerirVencimento();
  limparGradeItem();
  verificarBloqueioCliente();
  atualizarCabecalhoNumero();
  renderItens();
  history.replaceState(null, '', location.pathname);
}

// A lista de pedidos (em aberto / concluídos) mora na tela "Pedidos"
// (pedido.html, js/pedidos.js) — aqui só abrimos um pedido específico
// quando a URL vem com ?pedido=NNNN (link que sai de lá).
async function abrirPedido(numero) {
  try {
    const p = await buscarPedido(numero);
    if (!p) { toast(`Pedido ${numero} não encontrado`, 'err'); return; }
    numeroPedidoAtual = p.numero;
    statusPedidoAtual = p.status || 'aberto';
    document.getElementById('p-cliente').value = p.cliente || '';
    document.getElementById('p-vendedor').value = p.vendedor || '';
    if (p.tabela_preco) document.getElementById('p-tabela').value = p.tabela_preco;
    document.getElementById('p-data').value = p.data_pedido || hojeISO();
    document.getElementById('p-prazo').value = p.prazo_pagamento || '';
    document.getElementById('p-parcelas').value = p.parcelas || 1;
    document.getElementById('p-vencimento').value = p.data_vencimento_base || '';
    document.getElementById('p-desconto').value = p.desconto_pct || 0;
    pedidoItens = (p.itens || []).map(i => ({ ...i }));
    limparGradeItem();
    verificarBloqueioCliente();
    atualizarCabecalhoNumero();
    renderItens();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    toast('Erro ao abrir pedido: ' + e.message, 'err');
  }
}

// ==== CONFIRMAÇÃO DE PEDIDO (impressão pro cliente aprovar) ====
// Documento comercial com preço — diferente dos romaneios (que só tem
// quantidade, pra separação/conferência do estoque). Pensado pra imprimir,
// salvar como PDF e mandar pro cliente confirmar o pedido antes de liberar.
function imprimirConfirmacao() {
  if (pedidoItens.length === 0) { toast('Adicione itens antes de imprimir', 'err'); return; }
  const desconto = descontoAtual();

  document.getElementById('cf-num').textContent = numeroPedidoAtual || '(rascunho)';
  document.getElementById('cf-cliente').textContent = document.getElementById('p-cliente').value.trim() || '—';
  document.getElementById('cf-vendedor').textContent = document.getElementById('p-vendedor').value.trim() || '—';
  document.getElementById('cf-data').textContent = formatDataBR(document.getElementById('p-data').value);

  const corpo = document.getElementById('cf-corpo');
  corpo.innerHTML = '';
  pedidoItens.forEach(it => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="ref">${it.ref}</td><td style="text-align:left">${it.descricao || ''}</td><td>${it.cor}</td>
      <td>${it.qtds.RN || ''}</td><td>${it.qtds.P || ''}</td><td>${it.qtds.M || ''}</td>
      <td>${it.qtds.G || ''}</td><td>${it.qtds.GG || ''}</td><td><b>${it.qtd}</b></td>
      <td>${formatBRL(it.preco)}</td><td><b>${formatBRL(it.subtotal)}</b></td>
    `;
    corpo.appendChild(tr);
  });

  const linhaDesc = document.getElementById('cf-linha-desconto');
  if (desconto > 0) {
    linhaDesc.style.display = '';
    document.getElementById('cf-desconto').textContent = `-${desconto}%`;
  } else {
    linhaDesc.style.display = 'none';
  }
  document.getElementById('cf-total').textContent = formatBRL(totalPedido());

  const parcelas = parseInt(document.getElementById('p-parcelas').value) || 1;
  const prazo = document.getElementById('p-prazo').value.trim();
  const linhaPrazo = prazo ? `Prazo: ${prazo} — ` : '';
  document.getElementById('cf-parcelas').textContent = linhaPrazo + (parcelas > 1
    ? `Pagamento em ${parcelas}x, 1ª parcela em ${formatDataBR(document.getElementById('p-vencimento').value)}`
    : `Pagamento à vista — vencimento em ${formatDataBR(document.getElementById('p-vencimento').value)}`);

  dispararImpressao('folha-confirmacao');
}

// Abre um rascunho de e-mail (o navegador chama o programa de e-mail do
// computador) já endereçado pro cliente, com o resumo do pedido no corpo.
// Não anexa arquivo (e-mail comum não deixa um site fazer isso sozinho) —
// a orientação é imprimir a Confirmação em PDF primeiro e anexar à mão.
function enviarPorEmail() {
  if (pedidoItens.length === 0) { toast('Adicione itens antes de enviar', 'err'); return; }
  const nomeCliente = document.getElementById('p-cliente').value.trim();
  const cliObj = pClientes.find(c => c.nome.toUpperCase() === nomeCliente.toUpperCase());
  if (!cliObj || !cliObj.email) {
    toast(`${nomeCliente || 'Esse cliente'} não tem e-mail cadastrado — cadastra em Clientes primeiro`, 'err');
    return;
  }
  const linhas = pedidoItens.map(it =>
    `${it.ref} ${it.descricao ? '- ' + it.descricao + ' ' : ''}(${it.cor}) — ${it.qtd} pç × ${formatBRL(it.preco)} = ${formatBRL(it.subtotal)}`
  ).join('\n');
  const assunto = `Confirmação de Pedido ${numeroPedidoAtual || ''} — BAMBAM BABY`;
  const prazo = document.getElementById('p-prazo').value.trim();
  const linhaPrazo = prazo ? `Prazo de pagamento: ${prazo}\n\n` : '';
  const corpo =
    `Olá, ${nomeCliente}!\n\nSegue o resumo do seu pedido pra confirmação:\n\n${linhas}\n\n` +
    `TOTAL: ${formatBRL(totalPedido())}\n\n${linhaPrazo}` +
    `Por favor confirme respondendo este e-mail. Segue em anexo o PDF (imprima a Confirmação do Pedido e anexe antes de enviar).\n\nObrigado!\nBAMBAM BABY`;
  const link = `mailto:${encodeURIComponent(cliObj.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.location.href = link;
  toast('Abrindo seu programa de e-mail — lembra de anexar o PDF da Confirmação (imprime ela primeiro)', '');
}

// Telefone cadastrado vem em qualquer formato ("(11) 98888-7777" etc) — aqui
// só ficam os dígitos, e garante o "55" do Brasil na frente (o wa.me exige
// o código do país). Se o número já vier com 55 na frente, não duplica.
function telefoneParaWhatsapp(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.startsWith('55') ? digitos : '55' + digitos;
}

// Mesma ideia do e-mail, mas abre o WhatsApp (app ou web) com a mensagem já
// pronta pro cliente confirmar — não dá pra anexar o PDF automaticamente
// aqui também (é limitação do navegador, não rola nem por e-mail nem por
// WhatsApp), então a orientação é a mesma: manda o texto, anexa o PDF à
// parte se precisar.
function enviarPorWhatsapp() {
  if (pedidoItens.length === 0) { toast('Adicione itens antes de enviar', 'err'); return; }
  const nomeCliente = document.getElementById('p-cliente').value.trim();
  const cliObj = pClientes.find(c => c.nome.toUpperCase() === nomeCliente.toUpperCase());
  const numero = telefoneParaWhatsapp(cliObj?.telefone);
  if (!numero) {
    toast(`${nomeCliente || 'Esse cliente'} não tem telefone cadastrado — cadastra em Clientes primeiro`, 'err');
    return;
  }
  const linhas = pedidoItens.map(it =>
    `${it.ref} ${it.descricao ? '- ' + it.descricao + ' ' : ''}(${it.cor}) — ${it.qtd} pç × ${formatBRL(it.preco)} = ${formatBRL(it.subtotal)}`
  ).join('\n');
  const prazo = document.getElementById('p-prazo').value.trim();
  const linhaPrazo = prazo ? `Prazo de pagamento: ${prazo}\n\n` : '';
  const mensagem =
    `Olá, ${nomeCliente}! Aqui é da BAMBAM BABY 👋\n\n` +
    `Segue o resumo do seu pedido${numeroPedidoAtual ? ` Nº ${numeroPedidoAtual}` : ''} pra confirmação:\n\n${linhas}\n\n` +
    `TOTAL: ${formatBRL(totalPedido())}\n\n${linhaPrazo}` +
    `Por favor confirme aqui pelo WhatsApp mesmo. Obrigado!`;
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  window.open(link, '_blank');
  toast('Abrindo o WhatsApp com a mensagem pronta', '');
}

// ==== ROMANEIOS (impressão) ====
function imprimirRomaneio(tipo) {
  if (pedidoItens.length === 0) { toast('Adicione itens antes de imprimir', 'err'); return; }
  const cliente = document.getElementById('p-cliente').value.trim() || '—';
  const data = formatDataBR(document.getElementById('p-data').value);
  const numero = numeroPedidoAtual || '(rascunho)';

  if (tipo === 'separacao') {
    document.getElementById('rs-num').textContent = numero;
    document.getElementById('rs-cliente').textContent = cliente;
    document.getElementById('rs-data').textContent = data;
    const corpo = document.getElementById('rs-corpo');
    corpo.innerHTML = '';
    let total = 0;
    pedidoItens.forEach(it => {
      total += it.qtd;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="ref">${it.ref}</td><td>${it.cor}</td>
        <td>${it.qtds.RN || ''}</td><td>${it.qtds.P || ''}</td><td>${it.qtds.M || ''}</td>
        <td>${it.qtds.G || ''}</td><td>${it.qtds.GG || ''}</td><td><b>${it.qtd}</b></td>
      `;
      corpo.appendChild(tr);
    });
    document.getElementById('rs-total').textContent = total;
    dispararImpressao('folha-separacao');
  } else {
    document.getElementById('rc-num').textContent = numero;
    document.getElementById('rc-cliente').textContent = cliente;
    document.getElementById('rc-data').textContent = data;
    const porRef = {};
    pedidoItens.forEach(it => { porRef[it.ref] = (porRef[it.ref] || 0) + it.qtd; });
    const corpo = document.getElementById('rc-corpo');
    corpo.innerHTML = '';
    let total = 0;
    Object.keys(porRef).sort().forEach(ref => {
      total += porRef[ref];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="ref">${ref}</td><td><b>${porRef[ref]}</b></td>`;
      corpo.appendChild(tr);
    });
    document.getElementById('rc-total').textContent = total;
    dispararImpressao('folha-conferencia');
  }
}

function dispararImpressao(idFolha) {
  const folha = document.getElementById(idFolha);
  folha.classList.add('imprimindo');
  setTimeout(() => {
    window.print();
    setTimeout(() => folha.classList.remove('imprimindo'), 300);
  }, 50);
}

document.addEventListener('DOMContentLoaded', init);
