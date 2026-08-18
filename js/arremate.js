// Tela de Arremate — agrupa por REFERÊNCIA (não por nota/lote)
// Soma tudo que chegou da mesma ref de qualquer costureira
//
// FIX 18/08/2026:
//  (1) inclui retornos finalizados no filtro (fallback via itens[] se qtds vazio)
//  (2) distribui arremate proporcionalmente entre notas do mesmo ref
//      (antes escrevia valor total em cada nota → dupla contagem quando 2+ notas)
//  (3) try/catch em abrirRef pra capturar erro do painel não abrir

let notasComRetorno = [];
let refAtual = null;
let dadosRefAtual = null;

async function init() {
  await protegerRota();
  document.getElementById('p-data').value = hojeISO();
  document.getElementById('filtro-ref').addEventListener('input', renderChips);
  document.getElementById('btn-fechar').addEventListener('click', fecharPainel);
  document.getElementById('btn-confirmar').addEventListener('click', confirmarArremate);
  await carregarDados();
}

// Quanto chegou (chegada_1 + chegada_2) daquela nota naquele tamanho.
// Se o retorno estiver finalizado mas as qtds estiverem vazias, cai no itens[]
// como fallback (todas as peças chegaram por definição).
function chegouNota(n, tam) {
  const c1 = Number(n.chegada_1?.qtds?.[tam]) || 0;
  const c2 = Number(n.chegada_2?.qtds?.[tam]) || 0;
  const total = c1 + c2;
  if (total > 0) return total;
  if (n.retorno_finalizado === true) {
    return (n.itens || [])
      .filter(i => i.tam === tam)
      .reduce((a, i) => a + (Number(i.qtd) || 0), 0);
  }
  return 0;
}

function totalChegouNota(n) {
  return TAMS.reduce((a, t) => a + chegouNota(n, t), 0);
}

async function carregarDados() {
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '<span style="color:var(--text-muted);font-size:12px">carregando...</span>';
  try {
    const snap = await colNotas().get();
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Inclui TODAS as notas que tiveram qualquer chegada — ativas E finalizadas
    notasComRetorno = todas.filter(n => totalChegouNota(n) > 0);
    console.log(`[arremate] ${todas.length} notas total, ${notasComRetorno.length} com retorno`);
    renderChips();
  } catch (e) {
    console.error('Erro:', e);
    chips.innerHTML = `<span style="color:var(--text-danger);font-size:12px">Erro: ${e.message}</span>`;
  }
}

function agruparPorRef(notas) {
  const grupos = {};
  notas.forEach(n => {
    const ref = n.ref;
    if (!grupos[ref]) {
      grupos[ref] = {
        ref, notas: [],
        totalChegouPorTam: { RN:0, P:0, M:0, G:0, GG:0 },
        coresPorTam: { RN:{}, P:{}, M:{}, G:{}, GG:{} },
        costureiras: new Set(),
        arrematePorTam: {}
      };
      TAMS.forEach(t => grupos[ref].arrematePorTam[t] = { estoque:0, defeito:0, pendente:0 });
    }
    const g = grupos[ref];
    g.notas.push(n);
    if (n.costureira) g.costureiras.add(n.costureira);

    TAMS.forEach(t => { g.totalChegouPorTam[t] += chegouNota(n, t); });

    (n.itens || []).forEach(i => {
      if (!g.coresPorTam[i.tam]) g.coresPorTam[i.tam] = {};
      g.coresPorTam[i.tam][i.cor] = (g.coresPorTam[i.tam][i.cor] || 0) + i.qtd;
    });

    const arr = n.arremate || {};
    TAMS.forEach(t => {
      g.arrematePorTam[t].estoque += Number(arr[t]?.estoque) || 0;
      g.arrematePorTam[t].defeito += Number(arr[t]?.defeito) || 0;
    });
  });

  Object.values(grupos).forEach(g => {
    TAMS.forEach(t => {
      const chegou = g.totalChegouPorTam[t];
      const jaArr = g.arrematePorTam[t].estoque + g.arrematePorTam[t].defeito;
      g.arrematePorTam[t].pendente = Math.max(0, chegou - jaArr);
    });
  });
  return grupos;
}

function renderChips() {
  const fr = document.getElementById('filtro-ref').value.trim().toUpperCase();
  const chips = document.getElementById('chips-notas');
  chips.innerHTML = '';

  const grupos = agruparPorRef(notasComRetorno);
  let lista = Object.values(grupos);
  if (fr) lista = lista.filter(g => g.ref.toUpperCase().includes(fr));
  lista.sort((a, b) => a.ref.localeCompare(b.ref));

  document.getElementById('contador-chips').textContent = `(${lista.length})`;

  if (lista.length === 0) {
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

  lista.forEach(g => {
    const totalChegou = Object.values(g.totalChegouPorTam).reduce((a, v) => a + v, 0);
    const totalPend = TAMS.reduce((a, t) => a + g.arrematePorTam[t].pendente, 0);
    const completo = totalPend === 0 && totalChegou > 0;
    const costsStr = [...g.costureiras].slice(0,3).join(', ') + (g.costureiras.size > 3 ? '...' : '');

    const chip = document.createElement('div');
    chip.className = 'chip-nota';
    chip.style.borderColor = completo ? 'var(--success)' : 'var(--warning)';
    chip.innerHTML = `
      <span class="dot" style="background:${completo ? 'var(--success)' : 'var(--warning)'}"></span>
      <span style="font-size:15px;font-weight:900;font-family:monospace">${g.ref}</span>
      <span class="meta">${totalPend}/${totalChegou}pç pendente · ${g.notas.length} nota${g.notas.length>1?'s':''} · ${costsStr}</span>
    `;
    chip.addEventListener('click', () => {
      console.log('[arremate] clicou na ref:', g.ref, g);
      abrirRef(g);
    });
    chips.appendChild(chip);
  });
}

function abrirRef(g) {
  try {
    if (!g) { toast('Ref inválida', 'err'); return; }
    refAtual = g.ref;
    dadosRefAtual = g;
    const totalChegou = Object.values(g.totalChegouPorTam).reduce((a, v) => a + v, 0);
    document.getElementById('p-lote').textContent = g.ref;
    document.getElementById('p-num').textContent = `${g.notas.length} nota${g.notas.length>1?'s':''}`;
    document.getElementById('p-cost').textContent = [...g.costureiras].join(', ');
    document.getElementById('p-chegou').textContent = totalChegou;
    document.getElementById('p-chegada-tipo').textContent = 'todas as costureiras somadas';
    document.getElementById('p-data').value = hojeISO();
    renderizarGrade();
    document.getElementById('painel-arremate').classList.add('visivel');
    document.getElementById('painel-arremate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error('[arremate] erro ao abrir ref:', e);
    toast('Erro ao abrir painel: ' + e.message, 'err');
  }
}

function renderizarGrade() {
  const grade = document.getElementById('grade');
  grade.innerHTML = '';
  const g = dadosRefAtual;
  let totEstoque = 0;

  TAMS.forEach(tam => {
    const chegou = g.totalChegouPorTam[tam] || 0;
    const pendente = g.arrematePorTam[tam].pendente;
    const coresDoTam = Object.entries(g.coresPorTam[tam] || {}).map(([cor, qtd]) => `${cor} ${qtd}`).join(', ') || '—';

    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.tam = tam;
    col.dataset.chegou = chegou;
    col.dataset.pendente = pendente;

    col.innerHTML = `
      <div class="col-h">
        <span>${tam}</span>
        <span style="font-size:9px;color:var(--text-secondary);font-weight:700">retorno <b>${chegou}</b></span>
      </div>
      <div class="entradas-arremate">
        <div class="campo-arremate">
          <label class="ok">✓ estoque</label>
          <input type="number" class="in-ok" min="0" max="${pendente}" value="${pendente}" ${pendente===0?'disabled':''}>
        </div>
        <div class="campo-arremate">
          <label class="def">✗ defeito</label>
          <input type="number" class="in-def" min="0" max="${pendente}" value="0" ${pendente===0?'disabled':''}>
        </div>
        <div class="campo-arremate">
          <label class="pend">⏳ pendente</label>
          <input type="number" class="in-pend" value="0" readonly style="background:var(--surface-2);opacity:0.7">
        </div>
      </div>
      <div class="col-status" id="status-${tam}" style="font-size:10px;text-align:center;margin-top:2px"></div>
      <div style="padding:4px 6px;font-size:10px;color:var(--text-muted);border-top:0.5px dashed var(--border);margin-top:4px"><b>cores:</b> ${coresDoTam}</div>
      <div class="subtot-col">
        <div class="cell"><span>retorno</span><b>${chegou}</b></div>
        <div class="cell ok"><span>estoque</span><b data-ok>${pendente}</b></div>
        <div class="cell def"><span>defeito</span><b data-def>0</b></div>
        <div class="cell pend"><span>pend</span><b data-pend>0</b></div>
      </div>
    `;

    const inOk  = col.querySelector('.in-ok');
    const inDef = col.querySelector('.in-def');
    const inPend = col.querySelector('.in-pend');
    const statusEl = col.querySelector(`#status-${tam}`);

    function calc() {
      const ok  = parseInt(inOk.value)  || 0;
      const def = parseInt(inDef.value) || 0;
      const pend = Math.max(0, pendente - ok - def);
      inPend.value = pend;
      col.querySelector('[data-ok]').textContent  = ok;
      col.querySelector('[data-def]').textContent = def;
      col.querySelector('[data-pend]').textContent = pend;
      if (ok+def > pendente) { statusEl.textContent = `⚠ excede ${pendente}`; statusEl.style.color='var(--text-danger)'; }
      else if (ok+def===pendente && pendente>0) { statusEl.textContent='✓ completo'; statusEl.style.color='var(--success)'; }
      else if (ok+def>0) { statusEl.textContent=`${pend} pend`; statusEl.style.color='var(--warning)'; }
      else statusEl.textContent='';
      recalcResumo();
    }

    inOk.addEventListener('input', calc);
    inDef.addEventListener('input', calc);
    inOk.addEventListener('focus',  () => inOk.select());
    inDef.addEventListener('focus', () => inDef.select());
    inOk.addEventListener('keydown',  e => { if (e.key==='Tab'||e.key==='Enter') { e.preventDefault(); inDef.focus(); } });
    inDef.addEventListener('keydown', e => {
      if (e.key==='Tab'||e.key==='Enter') {
        e.preventDefault();
        const cols = [...document.querySelectorAll('.col[data-tam]')];
        const idx = cols.findIndex(c => c.dataset.tam===tam);
        for (let i=idx+1; i<cols.length; i++) {
          const prox = cols[i].querySelector('.in-ok');
          if (prox && !prox.disabled) { prox.focus(); return; }
        }
        document.getElementById('btn-confirmar').focus();
      }
    });

    calc();
    totEstoque += pendente;
    grade.appendChild(col);
  });

  document.getElementById('tot-estoque').textContent = totEstoque;
  document.getElementById('tot-defeito').textContent = 0;
  document.getElementById('tot-pendente').textContent = 0;
}

function recalcResumo() {
  let ok=0, def=0, pend=0;
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    ok   += parseInt(col.querySelector('.in-ok')?.value)   || 0;
    def  += parseInt(col.querySelector('.in-def')?.value)  || 0;
    pend += parseInt(col.querySelector('.in-pend')?.value) || 0;
  });
  document.getElementById('tot-estoque').textContent  = ok;
  document.getElementById('tot-defeito').textContent  = def;
  document.getElementById('tot-pendente').textContent = pend;
}

function fecharPainel() {
  document.getElementById('painel-arremate').classList.remove('visivel');
  refAtual = null; dadosRefAtual = null;
}

async function confirmarArremate() {
  const btn = document.getElementById('btn-confirmar');
  const data = document.getElementById('p-data').value;
  if (!data) { toast('Preencha a data', 'err'); return; }

  let temErro = false;
  const inputsPorTam = {};
  TAMS.forEach(tam => {
    const col = document.querySelector(`.col[data-tam="${tam}"]`);
    if (!col) return;
    const pendente = parseInt(col.dataset.pendente) || 0;
    const ok   = parseInt(col.querySelector('.in-ok')?.value)   || 0;
    const def  = parseInt(col.querySelector('.in-def')?.value)  || 0;
    if (ok+def > pendente) temErro = true;
    inputsPorTam[tam] = { ok, def, pendente };
  });

  if (temErro) { toast('⚠ Corrija as colunas com soma acima do retorno', 'err'); return; }

  const totOk   = Object.values(inputsPorTam).reduce((a, v) => a + v.ok, 0);
  const totDef  = Object.values(inputsPorTam).reduce((a, v) => a + v.def, 0);
  if (totOk+totDef===0) { toast('Preencha ao menos um campo', 'err'); return; }

  btn.disabled = true; btn.textContent = '⏳ Registrando...';

  try {
    const notas = dadosRefAtual.notas;
    // Deep clone do arremate atual de cada nota (base pra somar os novos valores)
    const updates = notas.map(n => ({
      nota: n,
      novoArremate: JSON.parse(JSON.stringify(n.arremate || {}))
    }));

    // Distribui o arremate DESTA SESSÃO proporcionalmente entre as notas.
    // Assim várias notas do mesmo ref não guardam valores duplicados que
    // depois somariam errado na agregação.
    for (const tam of TAMS) {
      const chegouTotal = dadosRefAtual.totalChegouPorTam[tam] || 0;
      const novoOk = inputsPorTam[tam]?.ok || 0;
      const novoDef = inputsPorTam[tam]?.def || 0;
      if (chegouTotal === 0 || (novoOk === 0 && novoDef === 0)) continue;

      const chegouPorNota = notas.map(n => chegouNota(n, tam));

      // Índice da última nota com chegou > 0 (recebe o resto do arredondamento)
      let ultimoIdx = -1;
      for (let i = chegouPorNota.length - 1; i >= 0; i--) {
        if (chegouPorNota[i] > 0) { ultimoIdx = i; break; }
      }

      let restanteOk = novoOk;
      let restanteDef = novoDef;

      for (let i = 0; i < notas.length; i++) {
        const chegou_i = chegouPorNota[i];
        if (chegou_i === 0) continue;

        let deltaOk, deltaDef;
        if (i === ultimoIdx) {
          deltaOk = restanteOk;
          deltaDef = restanteDef;
        } else {
          deltaOk = Math.floor((chegou_i / chegouTotal) * novoOk);
          deltaDef = Math.floor((chegou_i / chegouTotal) * novoDef);
        }
        restanteOk -= deltaOk;
        restanteDef -= deltaDef;

        const arr = updates[i].novoArremate;
        const arrTam = arr[tam] || { estoque: 0, defeito: 0, pendente: 0 };
        arrTam.estoque = (Number(arrTam.estoque) || 0) + deltaOk;
        arrTam.defeito = (Number(arrTam.defeito) || 0) + deltaDef;
        arrTam.pendente = Math.max(0, chegou_i - arrTam.estoque - arrTam.defeito);
        arr[tam] = arrTam;
      }
    }

    // Salvar cada nota que teve o arremate alterado
    for (const upd of updates) {
      const original = JSON.stringify(upd.nota.arremate || {});
      const novo = JSON.stringify(upd.novoArremate);
      if (original !== novo) {
        await atualizarNota(upd.nota.numero, {
          arremate: upd.novoArremate,
          data_arremate: data
        });
      }
    }

    // Adicionar ao estoque distribuído por cor (só o que foi pra ✓ estoque)
    if (totOk > 0) {
      for (const [tam, inputs] of Object.entries(inputsPorTam)) {
        if (!inputs.ok) continue;
        const coresDoTam = dadosRefAtual.coresPorTam[tam] || {};
        const totalCores = Object.values(coresDoTam).reduce((a, v) => a + v, 0);

        if (!totalCores) {
          await adicionarAoEstoque(refAtual, 'SEM COR', tam, inputs.ok, data);
          continue;
        }

        const entradas = Object.entries(coresDoTam);
        let restante = inputs.ok;
        for (let i = 0; i < entradas.length; i++) {
          const [cor, qtdOrig] = entradas[i];
          const ultimo = i === entradas.length - 1;
          const prop = ultimo ? restante : Math.round((qtdOrig / totalCores) * inputs.ok);
          if (prop > 0) { await adicionarAoEstoque(refAtual, cor, tam, prop, data); restante -= prop; }
        }
      }
    }

    let msg = `✓ Ref ${refAtual} — arremate registrado`;
    if (totOk > 0)   msg += ` · ${totOk} no estoque`;
    if (totDef > 0)  msg += ` · ${totDef} defeito`;
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
