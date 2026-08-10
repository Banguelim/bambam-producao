// Tela de Estoque — lista retornos e confirma entrada no estoque

let notasComRetorno = [];
let notaAtual = null;

async function init() {
  await protegerRota();

  document.getElementById('filtro-lote').addEventListener('input', renderChips);
  document.getElementById('filtro-ref').addEventListener('input', renderChips);
  document.getElementById('btn-fechar').addEventListener('click', fecharPainel);
  document.getElementById('btn-confirmar').addEventListener('click', confirmarEntrada);

  await carregarDados();
}

async function carregarDados() {
  const chips = document.getElementById('chips-lotes');
  chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">carregando...</span>';
  try {
    // Todas as notas com algum retorno (1ª ou 2ª chegada)
    const snap = await colNotas().get();
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    notasComRetorno = todas.filter(n => {
      const chegou1 = Object.values(n.chegada_1?.qtds || {}).reduce((a, v) => a + v, 0);
      const chegou2 = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0);
      return chegou1 > 0 || chegou2 > 0;
    });
    notasComRetorno.sort((a, b) => (b.data_saida || '').localeCompare(a.data_saida || ''));

    // Datalists
    const dlLotes = document.getElementById('lotes-list');
    const dlRefs = document.getElementById('refs-list');
    dlLotes.innerHTML = ''; dlRefs.innerHTML = '';
    const lotesVisto = new Set(), refsVisto = new Set();
    notasComRetorno.forEach(n => {
      if (!lotesVisto.has(n.lote)) { const o = document.createElement('option'); o.value = n.lote; dlLotes.appendChild(o); lotesVisto.add(n.lote); }
      if (!refsVisto.has(n.ref))  { const o = document.createElement('option'); o.value = n.ref;  dlRefs.appendChild(o);  refsVisto.add(n.ref);  }
    });

    renderChips();
    await renderEstoqueAtual();
  } catch (e) {
    console.error('Erro:', e);
    chips.innerHTML = `<span style="color:var(--text-danger);font-size:12px">Erro: ${e.message}</span>`;
  }
}

function calcularChegouTotal(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  const por = {};
  TAMS.forEach(t => por[t] = (c1[t] || 0) + (c2[t] || 0));
  return por;
}

function renderChips() {
  const fl = document.getElementById('filtro-lote').value.trim().toUpperCase();
  const fr = document.getElementById('filtro-ref').value.trim().toUpperCase();
  const chips = document.getElementById('chips-lotes');
  chips.innerHTML = '';

  let filtradas = notasComRetorno;
  if (fl) filtradas = filtradas.filter(n => n.lote?.toUpperCase().includes(fl));
  if (fr) filtradas = filtradas.filter(n => n.ref?.toUpperCase().includes(fr));

  document.getElementById('contador-chips').textContent = `(${filtradas.length})`;

  if (filtradas.length === 0) {
    if (notasComRetorno.length === 0) {
      document.getElementById('estado-vazio').style.display = 'block';
      chips.style.display = 'none';
    } else {
      chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Nenhum resultado com esse filtro</span>';
    }
    return;
  }

  document.getElementById('estado-vazio').style.display = 'none';
  chips.style.display = 'flex';

  filtradas.forEach(n => {
    const chegou = calcularChegouTotal(n);
    const totalChegou = Object.values(chegou).reduce((a, v) => a + v, 0);
    const tem2a = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0) > 0;

    const chip = document.createElement('div');
    chip.className = 'chip-lote';
    chip.style.borderColor = tem2a ? 'var(--success)' : 'var(--warning)';
    chip.innerHTML = `
      <span class="dot" style="background:${tem2a ? 'var(--success)' : 'var(--warning)'}"></span>
      <span>${n.lote}/${n.ref}</span>
      <span class="meta">${n.costureira} · ${totalChegou}pç · ${tem2a ? '1ª+2ª' : '1ª'}</span>
    `;
    chip.addEventListener('click', () => abrirNota(n));
    chips.appendChild(chip);
  });
}

function abrirNota(n) {
  notaAtual = n;
  const chegou = calcularChegouTotal(n);
  const totalChegou = Object.values(chegou).reduce((a, v) => a + v, 0);
  const tem2a = Object.values(n.chegada_2?.qtds || {}).reduce((a, v) => a + v, 0) > 0;

  document.getElementById('p-lote').textContent = n.lote;
  document.getElementById('p-ref').textContent = n.ref;
  document.getElementById('p-num').textContent = `#${n.numero}`;
  document.getElementById('p-cost').textContent = n.costureira || '?';
  document.getElementById('p-chegou').textContent = totalChegou;
  document.getElementById('p-chegada-tipo').textContent = tem2a ? '1ª e 2ª chegada' : 'somente 1ª chegada';
  document.getElementById('p-data').value = hojeISO();

  renderizarGrade(chegou);
  document.getElementById('painel-estoque').classList.add('visivel');
  document.getElementById('painel-estoque').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderizarGrade(chegou) {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';

  // Cores por tamanho (da nota original)
  const coresPorTam = {};
  (notaAtual.itens || []).forEach(i => {
    if (!coresPorTam[i.tam]) coresPorTam[i.tam] = [];
    coresPorTam[i.tam].push(`${i.cor} ${i.qtd}`);
  });

  TAMS.forEach(tam => {
    const qtd = chegou[tam] || 0;
    const coresTxt = (coresPorTam[tam] || []).join(', ') || '—';

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tam = tam;
    col.dataset.qtd = qtd;

    col.innerHTML = `
      <div class="col-h"><span>${tam}</span></div>
      <div style="padding:12px 8px;text-align:center">
        <div style="font-size:32px;font-weight:900;color:var(--success);font-variant-numeric:tabular-nums">${qtd}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">peças</div>
      </div>
      <div class="cores-ref" style="padding:4px 6px;font-size:10px;color:var(--text-muted);border-top:0.5px dashed var(--border)"><b>cores:</b> ${coresTxt}</div>
      <div class="subtot-col">
        <div class="cell"><span>chegou</span><b style="color:var(--success)">${qtd}</b></div>
      </div>
    `;

    grade.appendChild(col);
  });

  // Total no rodapé
  const total = Object.values(chegou).reduce((a, v) => a + v, 0);
  document.getElementById('lbl-entrando').textContent = total;
  TAMS.forEach(tam => {
    const ct = document.querySelector(`.ct[data-ct="${tam}"] b`);
    if (ct) ct.textContent = chegou[tam] || 0;
  });
}

function fecharPainel() {
  document.getElementById('painel-estoque').classList.remove('visivel');
  notaAtual = null;
}

async function confirmarEntrada() {
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true;
  const data = document.getElementById('p-data').value;
  if (!data) { toast('Preencha a data', 'err'); btn.disabled = false; return; }

  const chegou = calcularChegouTotal(notaAtual);
  const total = Object.values(chegou).reduce((a, v) => a + v, 0);
  if (total === 0) { toast('Nenhuma peça pra entrar', 'err'); btn.disabled = false; return; }

  try {
    // Distribuir por cor proporcionalmente e adicionar ao estoque
    const itensPorTam = {};
    (notaAtual.itens || []).forEach(i => {
      if (!itensPorTam[i.tam]) itensPorTam[i.tam] = [];
      itensPorTam[i.tam].push({ cor: i.cor, qtd: i.qtd });
    });

    for (const [tam, qtdEntrando] of Object.entries(chegou)) {
      if (!qtdEntrando) continue;
      const itensDoTam = itensPorTam[tam] || [];
      const totalDoTam = itensDoTam.reduce((a, i) => a + i.qtd, 0);

      if (!itensDoTam.length || !totalDoTam) {
        await adicionarAoEstoque(notaAtual.ref, 'SEM COR', tam, qtdEntrando, data);
        continue;
      }

      let restante = qtdEntrando;
      for (let i = 0; i < itensDoTam.length; i++) {
        const item = itensDoTam[i];
        const ultimo = i === itensDoTam.length - 1;
        const proporcional = ultimo
          ? restante
          : Math.round((item.qtd / totalDoTam) * qtdEntrando);
        if (proporcional > 0) {
          await adicionarAoEstoque(notaAtual.ref, item.cor, tam, proporcional, data);
          restante -= proporcional;
        }
      }
    }

    toast(`✓ ${total} peças do lote ${notaAtual.lote}/${notaAtual.ref} entraram no estoque!`, 'ok');
    setTimeout(async () => {
      await carregarDados();
      fecharPainel();
      btn.disabled = false;
    }, 1500);
  } catch (e) {
    console.error('Erro:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
  }
}

async function renderEstoqueAtual() {
  try {
    const estoque = await listarEstoque();
    const bloco = document.getElementById('bloco-consulta');
    const lista = document.getElementById('est-lista');
    if (!estoque.length) { bloco.style.display = 'none'; return; }

    bloco.style.display = 'block';
    document.getElementById('est-contagem').textContent = `(${estoque.length} SKUs)`;
    lista.innerHTML = '';
    estoque.forEach(e => {
      const item = document.createElement('div');
      item.className = 'estoque-item';
      item.innerHTML = `
        <span class="ref-est">${e.ref}</span>
        <span class="cor-est">${e.cor}</span>
        <span class="tam-est">${e.tam}</span>
        <span></span>
        <span class="qtd-est">${e.qtd}</span>
      `;
      lista.appendChild(item);
    });
  } catch (e) { console.warn('Erro estoque:', e); }
}

document.addEventListener('DOMContentLoaded', init);
