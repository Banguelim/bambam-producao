// Tela de Relatórios — BAMBAM BABY

// Dados em cache
let _notas = null;
let _cortes = null;
let _pagamentos = null;

// ===== ABAS =====
document.querySelectorAll('.abas button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.abas button').forEach(b => b.classList.remove('ativa'));
    document.querySelectorAll('.painel').forEach(p => p.classList.remove('ativo'));
    btn.classList.add('ativa');
    document.querySelector(`.painel[data-painel="${btn.dataset.aba}"]`).classList.add('ativo');
  });
});

async function init() {
  await protegerRota();

  // Popular costureiras
  try {
    const cs = await listarCostureiras();
    const dl = document.getElementById('costureiras-list');
    cs.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nome;
      dl.appendChild(opt);
    });
  } catch (e) { console.warn('Costureiras:', e); }

  // Datas padrão: último mês
  const hoje = new Date();
  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  document.getElementById('pag-de').value = mesPassado.toISOString().slice(0, 10);
  document.getElementById('pag-ate').value = hoje.toISOString().slice(0, 10);
}

// ===== BUSCAR TODAS AS NOTAS (cache) =====
async function getNotas() {
  if (!_notas) {
    const snap = await colNotas().get();
    _notas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return _notas;
}
async function getCortes() {
  if (!_cortes) {
    const snap = await colCortes().get();
    _cortes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return _cortes;
}
async function getPagamentos() {
  if (!_pagamentos) {
    const snap = await colPagamentos().get();
    _pagamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _pagamentos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }
  return _pagamentos;
}

function calcChegou(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  return TAMS.reduce((a, t) => a + (c1[t]||0) + (c2[t]||0), 0);
}

// ===== ABA: O QUE ESTÁ FORA =====
async function buscarFora() {
  const cost = document.getElementById('fora-cost').value.trim().toUpperCase();
  const ref  = document.getElementById('fora-ref').value.trim().toUpperCase();
  const tbody = document.getElementById('fora-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="vazio">carregando...</td></tr>';

  try {
    const notas = await getNotas();
    // "Fora" = notas abertas com pendente > 0 e não finalizadas
    let lista = notas.filter(n => {
      if (n.retorno_finalizado) return false;
      const chegou = calcChegou(n);
      return chegou < (n.total_saida || 0);
    });
    if (cost) lista = lista.filter(n => (n.costureira||'').toUpperCase().includes(cost));
    if (ref)  lista = lista.filter(n => (n.ref||'').toUpperCase().includes(ref));
    lista.sort((a, b) => (a.costureira||'').localeCompare(b.costureira||''));

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="vazio">Nenhuma nota encontrada</td></tr>';
      document.getElementById('fora-cards').style.display = 'none';
      document.getElementById('fora-tfoot').style.display = 'none';
      return;
    }

    let sumSaiu=0, sumChegou=0, sumPend=0, sumValor=0;
    tbody.innerHTML = '';
    lista.forEach(n => {
      const chegou = calcChegou(n);
      const pend = (n.total_saida||0) - chegou;
      const valor = n.valor_nota || 0;
      sumSaiu += n.total_saida||0;
      sumChegou += chegou;
      sumPend += pend;
      sumValor += valor;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="muted">#${n.numero}</td>
        <td class="destaque">${n.costureira||'?'}</td>
        <td>${n.lote}/${n.ref}</td>
        <td class="muted">${formatDataBR(n.data_saida)}</td>
        <td class="num">${n.total_saida||0}</td>
        <td class="num azul">${chegou}</td>
        <td class="num laranja">${pend}</td>
        <td class="num verde">${formatBRL(valor)}</td>
      `;
      tbody.appendChild(tr);
    });

    // Cards e rodapé
    document.getElementById('fora-cards').style.display = 'grid';
    document.getElementById('fora-tot-notas').textContent = lista.length;
    document.getElementById('fora-tot-pecas').textContent = sumSaiu;
    document.getElementById('fora-tot-pend').textContent = sumPend;
    document.getElementById('fora-tot-valor').textContent = formatBRL(sumValor);
    document.getElementById('fora-tfoot').style.display = '';
    document.getElementById('fora-sum-saiu').textContent = sumSaiu;
    document.getElementById('fora-sum-chegou').textContent = sumChegou;
    document.getElementById('fora-sum-pend').textContent = sumPend;
    document.getElementById('fora-sum-valor').textContent = formatBRL(sumValor);

    // Salva pra exportar
    window._dadosFora = lista;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="vazio" style="color:var(--text-danger)">Erro: ${e.message}</td></tr>`;
  }
}

// ===== ABA: O QUE TEM PRA MANDAR =====
async function buscarParaMandar() {
  const ref    = document.getElementById('pman-ref').value.trim().toUpperCase();
  const status = document.getElementById('pman-status').value;
  const tbody  = document.getElementById('pman-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="vazio">carregando...</td></tr>';

  try {
    const cortes = await getCortes();
    let lista = cortes.filter(c => c.status !== 'designado_total');
    if (ref)    lista = lista.filter(c => (c.refs||[]).some(r => r.toUpperCase().includes(ref)));
    if (status !== 'todos') lista = lista.filter(c => c.status === status);
    lista.sort((a, b) => (a.data_corte||'').localeCompare(b.data_corte||''));

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum corte encontrado</td></tr>';
      document.getElementById('pman-cards').style.display = 'none';
      document.getElementById('pman-tfoot').style.display = 'none';
      return;
    }

    let sumPecas = 0;
    tbody.innerHTML = '';
    lista.forEach(c => {
      sumPecas += c.total_pecas||0;
      const statusTxt = c.status === 'cortado' ? 'Aguardando designação' : 'Designado parcialmente';
      const statusCls = c.status === 'cortado' ? 'laranja' : 'azul';

      // Resumo de tamanhos
      const tamRes = {};
      (c.itens||[]).forEach(i => { tamRes[i.tam] = (tamRes[i.tam]||0) + i.qtd; });
      const tamTxt = TAMS.filter(t => tamRes[t]).map(t => `${t}:${tamRes[t]}`).join(' ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="destaque">${c.lote}</td>
        <td>${(c.refs||[]).join('+')}</td>
        <td class="muted">${formatDataBR(c.data_corte)}</td>
        <td class="num">${c.total_pecas||0}</td>
        <td class="${statusCls}">${statusTxt}</td>
        <td class="muted">${tamTxt}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('pman-cards').style.display = 'grid';
    document.getElementById('pman-tot-cortes').textContent = lista.length;
    document.getElementById('pman-tot-pecas').textContent = sumPecas;
    document.getElementById('pman-tfoot').style.display = '';
    document.getElementById('pman-sum-pecas').textContent = sumPecas;
    window._dadosPman = lista;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="vazio" style="color:var(--text-danger)">Erro: ${e.message}</td></tr>`;
  }
}

// ===== ABA: HISTÓRICO DE PAGAMENTOS =====
async function buscarPagamentos() {
  const cost = document.getElementById('pag-cost').value.trim().toUpperCase();
  const de   = document.getElementById('pag-de').value;
  const ate  = document.getElementById('pag-ate').value;
  const tbody = document.getElementById('pag-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="vazio">carregando...</td></tr>';

  try {
    const pags = await getPagamentos();
    let lista = pags;
    if (cost) lista = lista.filter(p => (p.costureira||'').toUpperCase().includes(cost));
    if (de)   lista = lista.filter(p => (p.data||'') >= de);
    if (ate)  lista = lista.filter(p => (p.data||'') <= ate);

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="vazio">Nenhum pagamento encontrado</td></tr>';
      document.getElementById('pag-cards').style.display = 'none';
      document.getElementById('pag-tfoot').style.display = 'none';
      return;
    }

    let sumBruto=0, sumAdiant=0, sumLiq=0;
    tbody.innerHTML = '';
    lista.forEach(p => {
      sumBruto  += p.valor_bruto||0;
      sumAdiant += p.adiantamento_usado||0;
      sumLiq    += p.valor_liquido||0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDataBR(p.data)}</td>
        <td class="destaque">${p.costureira||'?'}</td>
        <td>${p.forma||'—'}</td>
        <td class="num">${(p.notas_pagas||[]).length}</td>
        <td class="num">${formatBRL(p.valor_bruto||0)}</td>
        <td class="num ${p.adiantamento_usado>0?'laranja':''}">${p.adiantamento_usado>0 ? '−'+formatBRL(p.adiantamento_usado) : '—'}</td>
        <td class="num verde">${formatBRL(p.valor_liquido||0)}</td>
        <td class="muted">${p.observacao||'—'}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('pag-cards').style.display = 'grid';
    document.getElementById('pag-tot-pags').textContent = lista.length;
    document.getElementById('pag-tot-valor').textContent = formatBRL(sumLiq);
    document.getElementById('pag-tot-adiant').textContent = formatBRL(sumAdiant);
    document.getElementById('pag-tfoot').style.display = '';
    document.getElementById('pag-sum-bruto').textContent = formatBRL(sumBruto);
    document.getElementById('pag-sum-adiant').textContent = formatBRL(sumAdiant);
    document.getElementById('pag-sum-liq').textContent = formatBRL(sumLiq);
    window._dadosPag = lista;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="vazio" style="color:var(--text-danger)">Erro: ${e.message}</td></tr>`;
  }
}

// ===== ABA: HISTÓRICO DE RETORNOS =====
async function buscarRetornos() {
  const cost = document.getElementById('ret-cost').value.trim().toUpperCase();
  const ref  = document.getElementById('ret-ref').value.trim().toUpperCase();
  const tbody = document.getElementById('ret-tbody');
  tbody.innerHTML = '<tr><td colspan="9" class="vazio">carregando...</td></tr>';

  try {
    const notas = await getNotas();
    let lista = notas.filter(n => calcChegou(n) > 0); // só as que tiveram retorno
    if (cost) lista = lista.filter(n => (n.costureira||'').toUpperCase().includes(cost));
    if (ref)  lista = lista.filter(n => (n.ref||'').toUpperCase().includes(ref));
    lista.sort((a, b) => (a.costureira||'').localeCompare(b.costureira||''));

    if (lista.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="vazio">Nenhum retorno encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    lista.forEach(n => {
      const chegou = calcChegou(n);
      const pend = (n.total_saida||0) - chegou;
      const finalizado = n.retorno_finalizado || chegou >= (n.total_saida||0);
      const pendCls = pend > 0 ? 'laranja' : 'verde';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="muted">#${n.numero}</td>
        <td class="destaque">${n.costureira||'?'}</td>
        <td>${n.lote}/${n.ref}</td>
        <td class="muted">${formatDataBR(n.data_saida)}</td>
        <td class="muted">${n.chegada_1?.data ? formatDataBR(n.chegada_1.data) : '—'}</td>
        <td class="muted">${n.chegada_2?.data ? formatDataBR(n.chegada_2.data) : '—'}</td>
        <td class="num">${n.total_saida||0}</td>
        <td class="num azul">${chegou}</td>
        <td class="num ${pendCls}">${pend > 0 ? pend : '✓'}</td>
      `;
      tbody.appendChild(tr);
    });
    window._dadosRetornos = lista;
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="vazio" style="color:var(--text-danger)">Erro: ${e.message}</td></tr>`;
  }
}

// ===== EXPORTAR EXCEL (CSV) =====
function exportarExcel(tipo) {
  const bom = '\uFEFF';
  let csv = '';
  const linhas = [];

  if (tipo === 'fora' && window._dadosFora) {
    linhas.push(['#', 'Costureira', 'Lote', 'Ref', 'Data Saída', 'Saiu', 'Chegou', 'Pendente', 'Valor Nota']);
    window._dadosFora.forEach(n => {
      const chegou = calcChegou(n);
      linhas.push([n.numero, n.costureira, n.lote, n.ref, n.data_saida, n.total_saida, chegou, (n.total_saida||0)-chegou, n.valor_nota||0]);
    });
  } else if (tipo === 'para-mandar' && window._dadosPman) {
    linhas.push(['Lote', 'Ref', 'Data Corte', 'Total Peças', 'Status']);
    window._dadosPman.forEach(c => {
      linhas.push([c.lote, (c.refs||[]).join('+'), c.data_corte, c.total_pecas, c.status]);
    });
  } else if (tipo === 'pagamentos' && window._dadosPag) {
    linhas.push(['Data', 'Costureira', 'Forma', 'Notas Pagas', 'Valor Bruto', 'Adiantamento', 'Total Pago', 'Obs']);
    window._dadosPag.forEach(p => {
      linhas.push([p.data, p.costureira, p.forma, (p.notas_pagas||[]).length, p.valor_bruto||0, p.adiantamento_usado||0, p.valor_liquido||0, p.observacao||'']);
    });
  } else if (tipo === 'retornos' && window._dadosRetornos) {
    linhas.push(['#', 'Costureira', 'Lote', 'Ref', 'Data Saída', '1ª Chegada', '2ª Chegada', 'Saiu', 'Chegou', 'Pendente']);
    window._dadosRetornos.forEach(n => {
      const chegou = calcChegou(n);
      linhas.push([n.numero, n.costureira, n.lote, n.ref, n.data_saida, n.chegada_1?.data||'', n.chegada_2?.data||'', n.total_saida, chegou, (n.total_saida||0)-chegou]);
    });
  } else {
    toast('Faça uma busca primeiro', 'err');
    return;
  }

  csv = linhas.map(r => r.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bambam-${tipo}-${hojeISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', init);
