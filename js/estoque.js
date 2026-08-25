// Consulta de Estoque — só leitura.
// Layout: card no estilo dark do sistema (Designação).
// Estoque é populado pela tela Arremate (adicionarAoEstoque).
//
// Defensivo pra 3 formatos possíveis de doc:
//   {ref, cor, tam, qtd}
//   {ref, cor, qtds: {RN, P, M, G, GG}}
//   {ref, cor, RN, P, M, G, GG}

const TAMS_E = ['RN','P','M','G','GG'];
let TODO_ESTOQUE = [];
let REFS_DISPONIVEIS = new Set();

async function init() {
  await protegerRota();
  document.getElementById('ref-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); buscar(); }
  });
  document.getElementById('btn-buscar').addEventListener('click', buscar);
  await carregarEstoque();
  document.getElementById('ref-input').focus();
}

async function carregarEstoque() {
  try {
    const _colEst = (typeof colEstoque === 'function')
      ? colEstoque
      : () => firebase.firestore().collection('producao_dados').doc('op').collection('estoque');
    const snap = await _colEst().get();
    TODO_ESTOQUE = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    REFS_DISPONIVEIS = new Set();
    TODO_ESTOQUE.forEach(i => { if (i.ref) REFS_DISPONIVEIS.add(String(i.ref).toUpperCase()); });

    const dl = document.getElementById('refs-list');
    dl.innerHTML = '';
    [...REFS_DISPONIVEIS].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
      .forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        dl.appendChild(opt);
      });

    document.getElementById('info-bar').textContent =
      `${REFS_DISPONIVEIS.size} referência${REFS_DISPONIVEIS.size!==1?'s':''} com estoque`;
    console.log(`[estoque] ${TODO_ESTOQUE.length} entradas, ${REFS_DISPONIVEIS.size} refs`);
  } catch (e) {
    console.error('Erro carregando estoque:', e);
    document.getElementById('info-bar').textContent = 'Erro: ' + e.message;
    if (typeof toast === 'function') toast('Erro ao carregar estoque: ' + e.message, 'err');
  }
}

function buscar() {
  const ref = document.getElementById('ref-input').value.trim().toUpperCase();
  const vazio = document.getElementById('vazio');
  const naoEnc = document.getElementById('nao-encontrado');
  const resultado = document.getElementById('resultado');

  if (!ref) {
    vazio.style.display = 'block';
    naoEnc.style.display = 'none';
    resultado.innerHTML = '';
    return;
  }

  const itens = TODO_ESTOQUE.filter(i =>
    String(i.ref || '').toUpperCase() === ref
  );

  // Diagnóstico no console
  console.group(`[estoque] Buscando REF ${ref}`);
  console.log(`Encontradas ${itens.length} entradas pra REF ${ref}`);
  if (itens.length > 0) {
    console.log('Primeiras 3 entradas (pra ver formato):');
    itens.slice(0, 3).forEach((it, idx) => console.log(`  [${idx}]`, JSON.stringify(it)));
  } else {
    console.warn(`NENHUMA entrada pra REF ${ref}!`);
    console.log(`Total geral no estoque: ${TODO_ESTOQUE.length} docs`);
    console.log(`REFs existentes:`, [...REFS_DISPONIVEIS].sort().join(', '));
    if (TODO_ESTOQUE.length > 0) {
      console.log('Formato de um doc de referência:', JSON.stringify(TODO_ESTOQUE[0], null, 2));
    }
  }
  console.groupEnd();

  if (itens.length === 0) {
    vazio.style.display = 'none';
    resultado.innerHTML = '';
    naoEnc.style.display = 'block';
    naoEnc.innerHTML = `Nenhum estoque encontrado pra REF <b>${escHtml(ref)}</b>.<br>
      <span style="font-size:12px;color:var(--text-muted)">(abra F12 → Console pra ver diagnóstico)</span>`;
    document.getElementById('info-topo').textContent = `REF ${ref} sem estoque`;
    return;
  }

  // Agrupa por cor com 3 formatos possíveis
  const porCor = {};
  itens.forEach(i => {
    const cor = String(i.cor || 'SEM COR').toUpperCase().trim();
    if (!porCor[cor]) porCor[cor] = { RN:0, P:0, M:0, G:0, GG:0 };

    if (i.tam && i.qtd != null) {
      const tam = String(i.tam).toUpperCase();
      if (porCor[cor][tam] !== undefined) porCor[cor][tam] += Number(i.qtd) || 0;
    } else if (i.qtds && typeof i.qtds === 'object') {
      TAMS_E.forEach(tam => { porCor[cor][tam] += Number(i.qtds[tam]) || 0; });
    } else {
      TAMS_E.forEach(tam => {
        if (i[tam] != null) porCor[cor][tam] += Number(i[tam]) || 0;
      });
    }
  });

  // Remove cores zeradas
  const coresValidas = {};
  Object.keys(porCor).forEach(cor => {
    const total = TAMS_E.reduce((a, t) => a + porCor[cor][t], 0);
    if (total > 0) coresValidas[cor] = porCor[cor];
  });

  if (Object.keys(coresValidas).length === 0) {
    vazio.style.display = 'none';
    resultado.innerHTML = '';
    naoEnc.style.display = 'block';
    naoEnc.innerHTML = `REF <b>${escHtml(ref)}</b> não tem peças em estoque (todas as cores zeradas).`;
    document.getElementById('info-topo').textContent = `REF ${ref} · 0 peças`;
    return;
  }

  render(ref, coresValidas);
}

function render(ref, porCor) {
  document.getElementById('vazio').style.display = 'none';
  document.getElementById('nao-encontrado').style.display = 'none';
  const resultado = document.getElementById('resultado');

  const coresOrdenadas = Object.keys(porCor).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };
  coresOrdenadas.forEach(cor => {
    TAMS_E.forEach(t => totais[t] += porCor[cor][t]);
  });
  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);

  // Monta card estilo Designação: header escuro com REF + totais, corpo com linhas de cor
  const linhasHtml = coresOrdenadas.map(cor => {
    const q = porCor[cor];
    const tot = TAMS_E.reduce((a, t) => a + q[t], 0);
    return `
      <div class="cor-linha">
        <span class="cor-nome">${escHtml(cor)}</span>
        ${TAMS_E.map(t => {
          const v = q[t] || 0;
          return `<span class="qtd${v === 0 ? ' zero' : ''}">${v || '—'}</span>`;
        }).join('')}
        <span class="total-linha">= ${tot}</span>
      </div>
    `;
  }).join('');

  resultado.innerHTML = `
    <div class="card-ref">
      <div class="card-ref-header">
        <span class="ref-num"><span class="rot">REF</span>${escHtml(ref)}</span>
        <span class="contador-cores">${coresOrdenadas.length} cor${coresOrdenadas.length!==1?'es':''}</span>
        <span class="badge-total">${totalGeral} peças</span>
      </div>
      <div class="grade-cores">
        <div class="grade-header-cores">
          <span class="h-cor">COR</span>
          <span class="h-tam"><span class="tam-rot">RN</span> <b>${totais.RN || 0}</b></span>
          <span class="h-tam"><span class="tam-rot">P</span> <b>${totais.P  || 0}</b></span>
          <span class="h-tam"><span class="tam-rot">M</span> <b>${totais.M  || 0}</b></span>
          <span class="h-tam"><span class="tam-rot">G</span> <b>${totais.G  || 0}</b></span>
          <span class="h-tam"><span class="tam-rot">GG</span> <b>${totais.GG || 0}</b></span>
          <span class="h-tot">= <b>${totalGeral}</b></span>
        </div>
        ${linhasHtml}
      </div>
    </div>
  `;

  document.getElementById('info-topo').textContent =
    `REF ${ref} · ${coresOrdenadas.length} cor${coresOrdenadas.length!==1?'es':''} · ${totalGeral} peças`;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

document.addEventListener('DOMContentLoaded', init);
