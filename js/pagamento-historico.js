// pagamento-historico.js v2 (20/08/2026)
//
// Segundo plano na tela de Pagamento: seção "✓ Notas quitadas" que mostra as
// notas já pagas da costureira selecionada, UMA LINHA POR NOTA (mais recente
// em cima). Cada linha tem botão 🗑 pra APAGAR o pagamento — todas as notas
// daquele pagamento voltam pra "em aberto" e o adiantamento (se houve) é
// devolvido no saldo dela. Assim, se você pagou errado, apaga e refaz.
//
// Como o pagamento é uma unidade (pode ter várias notas juntas + adiantamento),
// a exclusão avisa claramente TODAS as notas que serão afetadas antes de
// confirmar.
//
// 100% autônomo — não toca no pagamento.js. Só usa colPagamentos(), colNotas(),
// firebase.firestore() (do db.js). Depois de apagar, força o pagamento.js a
// recarregar as notas da costureira disparando um 'change' no input.

(function() {
  let TODAS_NOTAS_HIST = [];
  let debounceTimer = null;
  let costureiraAnterior = '';
  let jaInicializou = false;

  async function init() {
    if (jaInicializou) return;
    jaInicializou = true;

    try {
      if (typeof protegerRota === 'function') await protegerRota();
    } catch (e) { /* já protegido pelo pagamento.js */ }

    const inpCost = document.getElementById('costureira');
    if (!inpCost) { console.warn('[pag-hist] campo #costureira não encontrado'); return; }

    try {
      const snap = await colNotas().get();
      TODAS_NOTAS_HIST = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('[pag-hist] falha carregando notas pra lookup:', e);
    }

    inpCost.addEventListener('input', agendarRecarga);
    inpCost.addEventListener('change', agendarRecarga);
    inpCost.addEventListener('blur', agendarRecarga);

    const bloco = document.getElementById('bloco-notas-pagas');
    if (bloco) {
      const titulo = bloco.querySelector('.tit-pagas');
      if (titulo) titulo.addEventListener('click', () => bloco.classList.toggle('aberto'));
    }

    agendarRecarga();
  }

  function agendarRecarga() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recarregar, 400);
  }

  async function recarregar(forcar = false) {
    const inpCost = document.getElementById('costureira');
    const bloco = document.getElementById('bloco-notas-pagas');
    if (!inpCost || !bloco) return;

    const nome = inpCost.value.trim().toUpperCase();
    if (!nome) {
      bloco.classList.remove('visivel', 'aberto');
      costureiraAnterior = '';
      return;
    }
    if (!forcar && nome === costureiraAnterior) return;
    costureiraAnterior = nome;

    const lista = document.getElementById('lista-pagas');
    const contador = document.getElementById('contador-pagas');
    lista.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:6px">carregando...</div>';

    try {
      const _colPag = (typeof colPagamentos === 'function')
        ? colPagamentos
        : () => firebase.firestore().collection('producao_dados').doc('op').collection('pagamentos');

      const snap = await _colPag().where('costureira', '==', nome).get();
      const pagamentos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Expande em UMA LINHA POR NOTA (mais recente em cima)
      const linhas = [];
      pagamentos.forEach(p => {
        (p.notas_pagas || []).forEach(np => {
          if (!np) return;
          linhas.push({ pag: p, np });
        });
      });
      linhas.sort((a, b) => (toDateH(b.pag.data) || 0) - (toDateH(a.pag.data) || 0));

      // Atualizar cache local de notas (pra lookup lote/ref ficar fresco)
      try {
        const snapN = await colNotas().get();
        TODAS_NOTAS_HIST = snapN.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (_) {}

      if (linhas.length === 0) {
        bloco.classList.remove('visivel', 'aberto');
        return;
      }

      bloco.classList.add('visivel');
      contador.textContent = `(${linhas.length})`;
      lista.innerHTML = '';
      linhas.forEach(l => renderLinha(l.pag, l.np, lista));
    } catch (e) {
      console.error('[pag-hist] erro:', e);
      lista.innerHTML = `<div style="color:var(--text-danger);font-size:11px;padding:6px">Erro: ${escH(e.message)}</div>`;
    }
  }

  function renderLinha(pag, np, container) {
    let numero, valor, pecas;
    if (typeof np === 'number' || typeof np === 'string') {
      numero = np;
    } else {
      numero = np.nota_numero ?? np.numero ?? np.num ?? np.id;
      valor  = np.valor ?? np.valor_nota;
      pecas  = np.pecas_pagas ?? np.pecas;
    }
    const nota = TODAS_NOTAS_HIST.find(n => Number(n.numero) === Number(numero));
    const lote = (np && np.lote) || (nota && nota.lote) || '?';
    const ref  = (np && np.ref)  || (nota && nota.ref)  || '?';

    const item = document.createElement('div');
    item.className = 'pag-item pag-linha-nota';
    item.innerHTML = `
      <div class="pag-linha-cab">
        <span class="pn-num">#${escH(numero || '?')}</span>
        <span class="pn-loteref">${escH(lote)}/${escH(ref)}</span>
        <span class="pn-pecas">${pecas != null ? pecas + 'pç' : '—'}</span>
        <span class="pn-valor">${(valor != null && !isNaN(Number(valor))) ? fmtBRLh(valor) : '—'}</span>
        <span class="pn-data">pago ${dataBR(pag.data)}</span>
        <span class="pn-forma">${escH(pag.forma || '?')}</span>
        <button class="pn-apagar" title="Apagar este pagamento (todas as notas dele voltam pra em aberto)">🗑</button>
      </div>
    `;
    item.querySelector('.pn-apagar').addEventListener('click', () => confirmarApagar(pag));
    container.appendChild(item);
  }

  async function confirmarApagar(pag) {
    const notasDoPag = pag.notas_pagas || [];
    const outrasNotas = notasDoPag.filter(np => true);
    const qtd = outrasNotas.length;

    let msg = `Apagar este pagamento?\n\n`;
    msg += `Data: ${dataBR(pag.data)}\n`;
    msg += `Forma: ${pag.forma || '?'}\n`;
    msg += `Valor: ${fmtBRLh(pag.valor_liquido || 0)}\n\n`;

    if (qtd === 1) {
      const np = outrasNotas[0];
      const num = np.nota_numero ?? np.numero ?? np.num ?? '?';
      msg += `A nota #${num} vai voltar pra lista de "em aberto".`;
    } else {
      msg += `⚠ Este pagamento tem ${qtd} notas juntas:\n`;
      outrasNotas.forEach(np => {
        const num = np.nota_numero ?? np.numero ?? np.num ?? '?';
        const nota = TODAS_NOTAS_HIST.find(n => Number(n.numero) === Number(num));
        const lote = (np && np.lote) || (nota && nota.lote) || '?';
        const ref  = (np && np.ref)  || (nota && nota.ref)  || '?';
        msg += `  · #${num} — ${lote}/${ref} (${np.valor != null ? fmtBRLh(np.valor) : '?'})\n`;
      });
      msg += `\nTODAS vão voltar pra "em aberto".`;
    }

    const adiantUsado = Number(pag.adiantamento_usado) || 0;
    if (adiantUsado > 0) {
      msg += `\n\n💰 O adiantamento de ${fmtBRLh(adiantUsado)} vai ser devolvido no saldo dela.`;
    }

    msg += `\n\nContinuar?`;
    if (!confirm(msg)) return;

    await apagarPagamento(pag);
  }

  async function apagarPagamento(pag) {
    try {
      const db = firebase.firestore();
      const _colPag = (typeof colPagamentos === 'function')
        ? colPagamentos
        : () => db.collection('producao_dados').doc('op').collection('pagamentos');

      // 1) Reverter cada nota do pagamento
      for (const np of (pag.notas_pagas || [])) {
        const numero = np.nota_numero ?? np.numero ?? np.num ?? np.id;
        if (numero == null) continue;

        // Busca a nota atual (pega o estado mais fresco)
        let notaAtual = TODAS_NOTAS_HIST.find(n => Number(n.numero) === Number(numero));
        try {
          const snap = await colNotas().where('numero', '==', numero).get();
          if (!snap.empty) notaAtual = { id: snap.docs[0].id, ...snap.docs[0].data() };
          else {
            const snap2 = await colNotas().where('numero', '==', String(numero)).get();
            if (!snap2.empty) notaAtual = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
          }
        } catch (_) {}

        if (!notaAtual) {
          console.warn(`[pag-hist] nota #${numero} não achada — pulando reversão dela`);
          continue;
        }

        // Remove o pagamento deste array de pagamentos da nota
        const pagsAntes = notaAtual.pagamentos || [];
        const pagsDepois = pagsAntes.filter(p => p.pag_id !== pag.id);

        // Recalcula status
        let novoStatus = 'aberta';
        if (pagsDepois.length > 0) {
          const pecasPagas = pagsDepois.reduce((a, p) => a + (Number(p.pecas) || 0), 0);
          if (pecasPagas >= (Number(notaAtual.total_saida) || 0)) novoStatus = 'paga_total';
          else novoStatus = 'paga_parcial';
        }

        // Atualiza a nota
        await atualizarNota(numero, {
          pagamentos: pagsDepois,
          status: novoStatus
        });
      }

      // 2) Devolver adiantamento se houve
      const consumidos = pag.adiantamentos_consumidos || [];
      for (const c of consumidos) {
        if (!c || !c.adiant_id || !c.valor) continue;
        try {
          const adiantRef = db.collection('producao_dados').doc('op')
            .collection('adiantamentos').doc(c.adiant_id);
          const doc = await adiantRef.get();
          if (doc.exists) {
            const saldoAtual = Number(doc.data().saldo) || 0;
            await adiantRef.update({ saldo: saldoAtual + Number(c.valor) });
          }
        } catch (e) {
          console.warn(`[pag-hist] falha devolvendo adiantamento ${c.adiant_id}:`, e);
        }
      }

      // 3) Apagar o registro do pagamento
      await _colPag().doc(pag.id).delete();

      if (typeof toast === 'function') {
        toast(`✓ Pagamento apagado — notas voltaram pra em aberto`, 'ok');
      }

      // 4) Forçar o pagamento.js a recarregar disparando change no input
      const inpCost = document.getElementById('costureira');
      if (inpCost) {
        inpCost.dispatchEvent(new Event('change'));
      }

      // Recarrega o próprio histórico
      costureiraAnterior = '';
      setTimeout(() => recarregar(true), 400);
    } catch (e) {
      console.error('[pag-hist] erro apagando pagamento:', e);
      if (typeof toast === 'function') toast('Erro ao apagar: ' + e.message, 'err');
      else alert('Erro ao apagar: ' + e.message);
    }
  }

  // Helpers isolados
  function toDateH(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function dataBR(v) {
    const d = toDateH(v);
    return d ? d.toLocaleDateString('pt-BR') : '—';
  }
  function fmtBRLh(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function escH(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // CSS específico das linhas por nota (injetado — não precisa mexer no HTML)
  const CSS_LINHAS = `
    .pag-linha-nota { border-radius: 6px; }
    .pag-linha-cab {
      display: grid;
      grid-template-columns: auto 1fr auto auto auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 7px 10px 7px 12px;
      font-size: 12px;
    }
    .pag-linha-cab:hover { background: color-mix(in srgb, var(--bg-accent) 8%, transparent); }
    .pn-num {
      font-weight: 800;
      color: var(--text-accent);
      font-family: 'Courier New', ui-monospace, monospace;
    }
    .pn-loteref {
      font-weight: 700;
      color: var(--text-primary);
      font-family: 'Courier New', ui-monospace, monospace;
    }
    .pn-pecas { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
    .pn-valor {
      color: var(--success);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      min-width: 80px;
      text-align: right;
    }
    .pn-data { color: var(--text-secondary); font-size: 11px; white-space: nowrap; }
    .pn-forma {
      color: var(--text-secondary);
      font-size: 10px;
      padding: 2px 8px;
      background: var(--surface-1);
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .pn-apagar {
      background: none;
      border: 0.5px solid var(--border);
      color: var(--text-muted);
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .pn-apagar:hover {
      color: var(--text-danger);
      border-color: var(--text-danger);
      background: color-mix(in srgb, var(--text-danger) 10%, transparent);
    }
    @media (max-width: 720px) {
      .pag-linha-cab {
        grid-template-columns: auto 1fr auto auto;
        gap: 6px;
        font-size: 11px;
      }
      .pn-pecas, .pn-forma { display: none; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = CSS_LINHAS;
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();
