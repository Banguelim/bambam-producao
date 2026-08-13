// Tela de Arremate
// Dados vêm do Retorno (chegada_1 + chegada_2 das notas)
// Distribui em: Estoque / Defeito / Pendente

let notasComRetorno = [];
let notaAtual = null;

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();

  document.getElementById('filtro-lote').addEventListener('input', renderChips);
  document.getElementById('filtro-cost').addEventListener('input', renderChips);
  document.getElementById('btn-fechar').addEventListener('click', fecharPainel);
  document.getElementById('btn-confirmar').addEventListener('click', confirmarArremate);

  await carregarDados();
}

async function carregarDados() {
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">carregando...</span>';
  try {
    const snap = await colNotas().get();
    console.log('[arremate] total notas no banco:', snap.size);
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Notas que têm algum retorno (qualquer chegada > 0)
    notasComRetorno = todas.filter(n => {
      const chegou = totalChegouDaNota(n);
      const total = Object.values(chegou).some(v => v > 0);
      console.log('[arremate] nota', n.numero, 'chegou:', chegou, 'temRetorno:', total);
      return total;
    });
    notasComRetorno.sort((a, b) => (b.data_saida || '').localeCompare(a.data_saida || ''));

    // Datalists
    const dlLotes = document.getElementById('lotes-list');
    const dlCost = document.getElementById('costureiras-list');
    dlLotes.innerHTML = ''; dlCost.innerHTML = '';
    const lotesVisto = new Set(), costVisto = new Set();
    notasComRetorno.forEach(n => {
      const loteRef = `${n.lote}/${n.ref}`;
      if (!lotesVisto.has(loteRef)) {
        const o = document.createElement('option'); o.value = loteRef;
        dlLotes.appendChild(o); lotesVisto.add(loteRef);
      }
      if (n.costureira && !costVisto.has(n.costureira)) {
        const o = document.createElement('option'); o.value = n.costureira;
        dlCost.appendChild(o); costVisto.add(n.costureira);
      }
    });

    renderChips();
  } catch (e) {
    console.error('Erro:', e);
    chips.innerHTML = `<span style="color:var(--text-danger);font-size:12px">Erro: ${e.message}</span>`;
  }
}

function totalChegouDaNota(n) {
  const c1 = n.chegada_1?.qtds || {};
  const c2 = n.chegada_2?.qtds || {};
  const por = {};
  TAMS.forEach(t => por[t] = (c1[t] || 0) + (c2[t] || 0));
  return por;
}

function totalArremateAtual(n) {
  const arr = n.arremate || {};
  const por = {};
  TAMS.forEach(t => {
    por[t] = {
      estoque: arr[t]?.estoque || 0,
      defeito: arr[t]?.defeito || 0,
      pendente: arr[t]?.pendente || 0
    };
  });
  return por;
}

function renderChips() {
  const fl = document.getElementById('filtro-lote').value.trim().toUpperCase();
  const fc = document.getElementById('filtro-cost').value.trim().toUpperCase();
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '';

  let filtradas = notasComRetorno;
  if (fl) filtradas = filtradas.filter(n => `${n.lote}/${n.ref}`.toUpperCase().includes(fl));
  if (fc) filtradas = filtradas.filter(n => (n.costureira || '').toUpperCase().includes(fc));

  document.getElementById('contador-chips').textContent = `(${filtradas.length})`;

  if (filtradas.length === 0) {
    if (notasComRetorno.length === 0) {
      document.getElementById('estado-vazio').style.display = 'block';
      chips.style.display = 'none';
    } else {
      chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Nenhum resultado</span>';
    }
    return;
  }
  document.getElementById('estado-vazio').style.display = 'none';
  chips.style.display = 'flex';

  filtradas.forEach(n => {
    const chegou = totalChegouDaNota(n);
    const totalChegou = Object.values(chegou).reduce((a, v) => a + v, 0);
    const arr = n.arremate || {};
    const totalArr = TAMS.reduce((a, t) => a + (arr[t]?.estoque || 0) + (arr[t]?.defeito || 0), 0);
    const completo = totalArr >= totalChegou && totalChegou > 0;

    const chip = document.createElement('div');
    chip.className = 'chip-nota';
    chip.innerHTML = `
      <span class="dot ${completo ? 'ok' : ''}"></span>
      <span>${n.lote}/${n.ref}</span>
      <span class="meta">${n.costureira} · ${totalChegou}pç retornadas${totalArr > 0 ? ` · ${totalArr} arrem` : ''}</span>
    `;
    chip.addEventListener('click', () => abrirNota(n));
    chips.appendChild(chip);
  });
}

function abrirNota(n) {
  notaAtual = n;
  const chegou = totalChegouDaNota(n);
  const totalChegou = Object.values(chegou).reduce((a, v) => a + v, 0);

  document.getElementById('p-lote').textContent = n.lote;
  document.getElementById('p-ref').textContent = n.ref;
  document.getElementById('p-num').textContent = `#${n.numero}`;
  document.getElementById('p-cost').textContent = n.costureira || '?';
  document.getElementById('p-chegou').textContent = totalChegou;
  document.getElementById('p-data').value = hojeISO();

  renderizarGrade(chegou);
  document.getElementById('painel-arremate').classList.add('visivel');
  document.getElementById('painel-arremate').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function coresEnviadasPorTam(n) {
  const mapa = {};
  TAMS.forEach(t => mapa[t] = []);
  (n.itens || []).forEach(i => {
    if (!mapa[i.tam]) mapa[i.tam] = [];
    mapa[i.tam].push(`${i.cor} ${i.qtd}`);
  });
  return mapa;
}

function renderizarGrade(chegouPorTam) {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';
  const coresPorTam = coresEnviadasPorTam(notaAtual);
  const arrAtual = totalArremateAtual(notaAtual);

  TAMS.forEach(tam => {
    const chegou = chegouPorTam[tam] || 0;
    const jArr = arrAtual[tam];
    const coresTxt = (coresPorTam[tam] || []).join(', ') || '—';

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tam = tam;
    col.dataset.chegou = chegou;

    col.innerHTML = `
      <div class="col-h">
        <span>${tam}</span>
        <span style="font-size:9px;color:var(--text-secondary);font-weight:700">retorno <b>${chegou}</b></span>
      </div>
      <div class="entradas-arremate">
        <div class="campo-arremate">
          <label class="ok">✓ estoque</label>
          <input type="number" class="in-ok" min="0" max="${chegou}" value="${jArr.estoque}" ${chegou===0?'disabled':''}>
        </div>
        <div class="campo-arremate">
          <label class="def">✗ defeito</label>
          <input type="number" class="in-def" min="0" max="${chegou}" value="${jArr.defeito}" ${chegou===0?'disabled':''}>
        </div>
        <div class="campo-arremate">
          <label class="pend">⏳ pendente</label>
          <input type="number" class="in-pend" min="0" max="${chegou}" value="${jArr.pendente}" readonly style="background:var(--surface-2);opacity:0.7">
        </div>
      </div>
      <div class="col-status" id="status-${tam}"></div>
      <div class="cores-ref"><b>cores:</b> ${coresTxt}</div>
      <div class="subtot-col">
        <div class="cell chegou"><span>retorno</span><b>${chegou}</b></div>
        <div class="cell ok"><span>estoque</span><b data-ok>${jArr.estoque}</b></div>
        <div class="cell def"><span>defeito</span><b data-def>${jArr.defeito}</b></div>
        <div class="cell pend"><span>pendente</span><b data-pend>${jArr.pendente}</b></div>
      </div>
    `;

    const inOk = col.querySelector('.in-ok');
    const inDef = col.querySelector('.in-def');
    const inPend = col.querySelector('.in-pend');
    const statusEl = col.querySelector(`#status-${tam}`);

    function calcPendente() {
      const ok = parseInt(inOk.value) || 0;
      const def = parseInt(inDef.value) || 0;
      const pend = Math.max(0, chegou - ok - def);
      inPend.value = pend;
      col.querySelector('[data-ok]').textContent = ok;
      col.querySelector('[data-def]').textContent = def;
      col.querySelector('[data-pend]').textContent = pend;

      // Feedback visual
      const total = ok + def;
      if (total > chegou) {
        statusEl.textContent = `⚠ soma ${total} > ${chegou}`;
        statusEl.className = 'col-status err';
      } else if (total === chegou) {
        statusEl.textContent = `✓ completo`;
        statusEl.className = 'col-status ok';
      } else if (total > 0) {
        statusEl.textContent = `${pend} pendente`;
        statusEl.className = 'col-status';
        statusEl.style.color = 'var(--warning)';
      } else {
        statusEl.textContent = '';
      }

      recalcResumo();
    }

    inOk.addEventListener('input', calcPendente);
    inDef.addEventListener('input', calcPendente);
    inOk.addEventListener('focus', () => inOk.select());
    inDef.addEventListener('focus', () => inDef.select());

    inOk.addEventListener('keydown', e => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault(); inDef.focus();
      }
    });
    inDef.addEventListener('keydown', e => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        // Próxima coluna habilitada
        const todos = [...document.querySelectorAll('.in-ok')];
        const cols = [...document.querySelectorAll('.col[data-tam]')];
        const idx = cols.findIndex(c => c.dataset.tam === tam);
        for (let i = idx + 1; i < cols.length; i++) {
          const prox = cols[i].querySelector('.in-ok');
          if (prox && !prox.disabled) { prox.focus(); return; }
        }
        document.getElementById('btn-confirmar').focus();
      }
    });

    // Inicializar cálculo
    calcPendente();
    grade.appendChild(col);
  });

  recalcResumo();
}

function recalcResumo() {
  let totOk = 0, totDef = 0, totPend = 0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    totOk += parseInt(col.querySelector('.in-ok')?.value) || 0;
    totDef += parseInt(col.querySelector('.in-def')?.value) || 0;
    totPend += parseInt(col.querySelector('.in-pend')?.value) || 0;
  });
  document.getElementById('tot-estoque').textContent = totOk;
  document.getElementById('tot-defeito').textContent = totDef;
  document.getElementById('tot-pendente').textContent = totPend;
}

function fecharPainel() {
  document.getElementById('painel-arremate').classList.remove('visivel');
  notaAtual = null;
}

async function confirmarArremate() {
  const btn = document.getElementById('btn-confirmar');
  const data = document.getElementById('p-data').value;
  if (!data) { toast('Preencha a data', 'err'); return; }

  // Verifica se tem erro de soma
  let temErro = false;
  const arrPorTam = {};
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const chegou = parseInt(col.dataset.chegou) || 0;
    const ok = parseInt(col.querySelector('.in-ok')?.value) || 0;
    const def = parseInt(col.querySelector('.in-def')?.value) || 0;
    const pend = parseInt(col.querySelector('.in-pend')?.value) || 0;
    if (ok + def > chegou) { temErro = true; }
    arrPorTam[tam] = { estoque: ok, defeito: def, pendente: pend };
  });

  if (temErro) { toast('⚠ Corrija as colunas onde a soma ultrapassa o retorno', 'err'); return; }

  const totOk = Object.values(arrPorTam).reduce((a, v) => a + v.estoque, 0);
  const totDef = Object.values(arrPorTam).reduce((a, v) => a + v.defeito, 0);
  const totPend = Object.values(arrPorTam).reduce((a, v) => a + v.pendente, 0);

  if (totOk + totDef + totPend === 0) { toast('Preencha ao menos um campo', 'err'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Registrando...';

  try {
    // 1. Salvar arremate na nota
    await atualizarNota(notaAtual.numero, {
      arremate: arrPorTam,
      data_arremate: data
    });

    // 2. Se tem peças pro estoque, adicionar
    if (totOk > 0) {
      const itensPorTam = {};
      (notaAtual.itens || []).forEach(i => {
        if (!itensPorTam[i.tam]) itensPorTam[i.tam] = [];
        itensPorTam[i.tam].push({ cor: i.cor, qtd: i.qtd });
      });

      for (const [tam, vals] of Object.entries(arrPorTam)) {
        if (!vals.estoque) continue;
        const itensDoTam = itensPorTam[tam] || [];
        const totalDoTam = itensDoTam.reduce((a, i) => a + i.qtd, 0);

        if (!itensDoTam.length || !totalDoTam) {
          await adicionarAoEstoque(notaAtual.ref, 'SEM COR', tam, vals.estoque, data);
          continue;
        }

        // Distribui por cor proporcionalmente
        let restante = vals.estoque;
        for (let i = 0; i < itensDoTam.length; i++) {
          const item = itensDoTam[i];
          const ultimo = i === itensDoTam.length - 1;
          const prop = ultimo ? restante : Math.round((item.qtd / totalDoTam) * vals.estoque);
          if (prop > 0) {
            await adicionarAoEstoque(notaAtual.ref, item.cor, tam, prop, data);
            restante -= prop;
          }
        }
      }
    }

    let msg = `✓ Arremate registrado`;
    if (totOk > 0) msg += ` · ${totOk} peças no estoque`;
    if (totDef > 0) msg += ` · ${totDef} defeito`;
    if (totPend > 0) msg += ` · ${totPend} pendente`;
    toast(msg, 'ok');

    setTimeout(async () => {
      await carregarDados();
      fecharPainel();
      btn.disabled = false;
      btn.textContent = '✓ Confirmar arremate';
    }, 1500);
  } catch (e) {
    console.error('Erro:', e);
    toast('Erro: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = '✓ Confirmar arremate';
  }
}

document.addEventListener('DOMContentLoaded', init);
