// Tela de Estoque — consulta do estoque disponível

let estoqueCompleto = [];

async function init() {
  await protegerRota();
  document.getElementById('f-ref').addEventListener('input', renderTabela);
  document.getElementById('f-cor').addEventListener('input', renderTabela);
  document.getElementById('btn-limpar').addEventListener('click', () => {
    document.getElementById('f-ref').value = '';
    document.getElementById('f-cor').value = '';
    renderTabela();
  });
  await carregarEstoque();
}

async function carregarEstoque() {
  try {
    estoqueCompleto = await listarEstoque();
    renderTabela();
  } catch (e) {
    console.error('Erro:', e);
    document.getElementById('tbody-est').innerHTML =
      `<tr><td colspan="5" style="text-align:center;color:var(--text-danger);padding:20px">Erro: ${e.message}</td></tr>`;
  }
}

function renderTabela() {
  const fr = document.getElementById('f-ref').value.trim().toUpperCase();
  const fc = document.getElementById('f-cor').value.trim().toUpperCase();

  let filtrado = estoqueCompleto;
  if (fr) filtrado = filtrado.filter(e => e.ref?.toUpperCase().includes(fr));
  if (fc) filtrado = filtrado.filter(e => e.cor?.toUpperCase().includes(fc));

  // Resumo
  const totalPecas = filtrado.reduce((a, e) => a + (e.qtd || 0), 0);
  const refs = new Set(filtrado.map(e => e.ref));
  document.getElementById('tot-skus').textContent = filtrado.length;
  document.getElementById('tot-pecas').textContent = totalPecas;
  document.getElementById('tot-refs').textContent = refs.size;
  document.getElementById('hint-total').textContent =
    fr || fc ? `${filtrado.length} de ${estoqueCompleto.length} SKUs` : `${estoqueCompleto.length} SKUs no total`;

  const tbody = document.getElementById('tbody-est');
  if (filtrado.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">Nenhum item encontrado</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtrado.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="ref">${e.ref}</span></td>
      <td><span class="cor">${e.cor}</span></td>
      <td><span class="tam">${e.tam}</span></td>
      <td><span class="qtd">${e.qtd || 0}</span></td>
      <td><span class="data">${e.ultima_entrada ? formatDataBR(e.ultima_entrada) : '—'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', init);
