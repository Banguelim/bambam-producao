// Tela de Contas a Receber — parcelas geradas quando um Pedido é concluído.

let todasContas = [];

async function init() {
  await protegerRota();
  document.getElementById('f-status').addEventListener('change', render);
  document.getElementById('f-busca').addEventListener('input', render);
  await carregar();
}

async function carregar() {
  try {
    todasContas = await listarContasReceber();
    render();
  } catch (e) {
    console.error(e);
    toast('Erro ao carregar contas: ' + e.message, 'err');
  }
}

function statusReal(c) {
  if (c.status === 'pago') return 'pago';
  return c.data_vencimento && c.data_vencimento < hojeISO() ? 'vencido' : 'aberto';
}

function render() {
  const filtro = document.getElementById('f-status').value;
  const busca = (document.getElementById('f-busca').value || '').toUpperCase();

  const filtradas = todasContas.filter(c => {
    const st = statusReal(c);
    if (filtro === 'aberto' && st !== 'aberto') return false;
    if (filtro === 'vencido' && st !== 'vencido') return false;
    if (filtro === 'pago' && st !== 'pago') return false;
    if (filtro === 'pendentes' && st === 'pago') return false;
    if (busca) {
      const alvo = `${c.cliente || ''} ${c.pedido_id || ''}`.toUpperCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  // Estatísticas sobre TODAS as contas (não só as filtradas)
  let somaAberto = 0, somaVencido = 0, somaPago = 0;
  todasContas.forEach(c => {
    const st = statusReal(c);
    if (st === 'aberto') somaAberto += c.valor || 0;
    else if (st === 'vencido') somaVencido += c.valor || 0;
    else somaPago += c.valor_pago ?? c.valor ?? 0;
  });
  document.getElementById('s-aberto').textContent = formatBRL(somaAberto);
  document.getElementById('s-vencido').textContent = formatBRL(somaVencido);
  document.getElementById('s-pago').textContent = formatBRL(somaPago);
  document.getElementById('s-total').textContent = todasContas.length;

  const corpo = document.getElementById('contas-corpo');
  const vazio = document.getElementById('contas-vazio');
  corpo.innerHTML = '';

  if (filtradas.length === 0) {
    document.getElementById('tabela-contas').style.display = 'none';
    vazio.style.display = 'block';
    return;
  }
  document.getElementById('tabela-contas').style.display = '';
  vazio.style.display = 'none';

  filtradas.forEach(c => {
    const st = statusReal(c);
    const tr = document.createElement('tr');
    tr.className = st === 'vencido' ? 'vencida' : (st === 'pago' ? 'paga' : '');
    tr.innerHTML = `
      <td>${c.pedido_id ? `<a href="pedido.html?pedido=${c.pedido_id}">${c.pedido_id}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="cliente">${c.cliente || '—'}</td>
      <td>${c.parcela_num}/${c.parcelas_total}</td>
      <td>${formatDataBR(c.data_vencimento)}</td>
      <td class="num">${formatBRL(c.valor)}</td>
      <td><span class="badge ${st}">${st === 'pago' ? '✓ pago' : (st === 'vencido' ? '⚠ vencido' : 'aberto')}</span></td>
      <td></td>
    `;
    const acaoTd = tr.lastElementChild;
    if (st === 'pago') {
      const btn = document.createElement('button');
      btn.className = 'btn-mini';
      btn.textContent = '↺ reabrir';
      btn.addEventListener('click', () => reabrirBtn(c));
      acaoTd.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn-mini success';
      btn.textContent = '✓ dar baixa';
      btn.addEventListener('click', () => darBaixaBtn(c));
      acaoTd.appendChild(btn);
    }
    corpo.appendChild(tr);
  });
}

async function darBaixaBtn(c) {
  const dataPag = prompt(`Data do pagamento (AAAA-MM-DD):`, hojeISO());
  if (!dataPag) return;
  const valorStr = prompt(`Valor recebido:`, String(c.valor));
  if (!valorStr) return;
  const valor = parseFloat(valorStr.replace(',', '.'));
  if (!valor || valor <= 0) { toast('Valor inválido', 'err'); return; }
  try {
    await darBaixaConta(c.id, dataPag, valor);
    toast(`✓ Baixa registrada — parcela ${c.parcela_num}/${c.parcelas_total} de ${c.cliente}`, 'ok');
    await carregar();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

async function reabrirBtn(c) {
  if (!confirm(`Reabrir a parcela ${c.parcela_num}/${c.parcelas_total} de ${c.cliente}? Ela volta pra "em aberto".`)) return;
  try {
    await reabrirConta(c.id);
    toast('✓ Parcela reaberta', 'ok');
    await carregar();
  } catch (e) {
    toast('Erro: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', init);
