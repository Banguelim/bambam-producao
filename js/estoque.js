// Consulta de Estoque — só leitura.
// Digita a REF, mostra uma linha por cor com quantidades por tamanho e total.
// O estoque é populado pela tela de Arremate (adicionarAoEstoque).
//
// Defensivo pra diferentes formatos possíveis de doc:
//   - {ref, cor, tam, qtd}                → soma tudo
//   - {ref, cor, qtds: {RN, P, M, G, GG}} → lê o objeto qtds
//   - {ref, cor, RN, P, M, G, GG}         → lê campos soltos por tam

const TAMS_E = ['RN','P','M','G','GG'];
let TODO_ESTOQUE = [];
let REFS_DISPONIVEIS = new Set();

async function init() {
  await protegerRota();
  document.getElementById('ref-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); buscar(); }
  });
  document.getElementById('btn-buscar').addEventListener('click', buscar);
  document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

  await carregarEstoque();
  document.getElementById('ref-input').focus();
}

async function carregarEstoque() {
  const info = document.getElementById('info');
  try {
    const _colEst = (typeof colEstoque === 'function')
      ? colEstoque
      : () => firebase.firestore().collection('producao_dados').doc('op').collection('estoque');
    const snap = await _colEst().get();
    TODO_ESTOQUE = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Descobre refs disponíveis pro autocomplete
    REFS_DISPONIVEIS = new Set();
    TODO_ESTOQUE.forEach(i => {
      if (i.ref) REFS_DISPONIVEIS.add(String(i.ref).toUpperCase());
    });
    const dl = document.getElementById('refs-list');
    dl.innerHTML = '';
    [...REFS_DISPONIVEIS].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true })
    ).forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      dl.appendChild(opt);
    });

    info.textContent = `${REFS_DISPONIVEIS.size} referência${REFS_DISPONIVEIS.size!==1?'s':''} com estoque`;
    console.log(`[estoque] ${TODO_ESTOQUE.length} entradas, ${REFS_DISPONIVEIS.size} refs`);
  } catch (e) {
    console.error('Erro carregando estoque:', e);
    info.textContent = 'Erro: ' + e.message;
    if (typeof toast === 'function') toast('Erro ao carregar estoque: ' + e.message, 'err');
  }
}

function buscar() {
  const ref = document.getElementById('ref-input').value.trim().toUpperCase();
  const vazio = document.getElementById('vazio');
  const naoEnc = document.getElementById('nao-encontrado');
  const folha = document.getElementById('folha');
  const btnImp = document.getElementById('btn-imprimir');

  if (!ref) {
    vazio.style.display = 'block';
    naoEnc.style.display = 'none';
    folha.style.display = 'none';
    btnImp.disabled = true;
    return;
  }

  // Filtra entradas da REF
  const itens = TODO_ESTOQUE.filter(i =>
    String(i.ref || '').toUpperCase() === ref
  );

  if (itens.length === 0) {
    vazio.style.display = 'none';
    folha.style.display = 'none';
    naoEnc.style.display = 'block';
    naoEnc.textContent = `Nenhum estoque encontrado pra REF ${ref}.`;
    btnImp.disabled = true;
    document.getElementById('info').textContent = `REF ${ref} sem estoque`;
    return;
  }

  // Agrupa por cor
  const porCor = {};
  itens.forEach(i => {
    const cor = String(i.cor || 'SEM COR').toUpperCase().trim();
    if (!porCor[cor]) porCor[cor] = { RN:0, P:0, M:0, G:0, GG:0 };

    // Formato 1: {tam, qtd} — um doc por SKU
    if (i.tam && i.qtd != null) {
      const tam = String(i.tam).toUpperCase();
      if (porCor[cor][tam] !== undefined) {
        porCor[cor][tam] += Number(i.qtd) || 0;
      }
    }
    // Formato 2: {qtds: {RN, P, M, ...}} — objeto aninhado
    else if (i.qtds && typeof i.qtds === 'object') {
      TAMS_E.forEach(tam => {
        porCor[cor][tam] += Number(i.qtds[tam]) || 0;
      });
    }
    // Formato 3: campos soltos {RN, P, M, G, GG}
    else {
      TAMS_E.forEach(tam => {
        if (i[tam] != null) porCor[cor][tam] += Number(i[tam]) || 0;
      });
    }
  });

  // Remove cores com zero em tudo (não faz sentido mostrar)
  const coresValidas = {};
  Object.keys(porCor).forEach(cor => {
    const total = TAMS_E.reduce((a, t) => a + porCor[cor][t], 0);
    if (total > 0) coresValidas[cor] = porCor[cor];
  });

  if (Object.keys(coresValidas).length === 0) {
    vazio.style.display = 'none';
    folha.style.display = 'none';
    naoEnc.style.display = 'block';
    naoEnc.textContent = `REF ${ref} não tem peças em estoque (todas zeradas).`;
    btnImp.disabled = true;
    document.getElementById('info').textContent = `REF ${ref} · 0 peças`;
    return;
  }

  render(ref, coresValidas);
}

function render(ref, porCor) {
  document.getElementById('vazio').style.display = 'none';
  document.getElementById('nao-encontrado').style.display = 'none';
  document.getElementById('folha').style.display = 'block';
  document.getElementById('btn-imprimir').disabled = false;

  document.getElementById('lbl-ref').textContent = ref;
  document.getElementById('lbl-data').textContent = new Date().toLocaleDateString('pt-BR');

  const lista = document.getElementById('lista-cores');
  lista.innerHTML = '';
  const totais = { RN:0, P:0, M:0, G:0, GG:0 };

  // Ordena cores alfabeticamente
  const coresOrdenadas = Object.keys(porCor).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  coresOrdenadas.forEach(cor => {
    const q = porCor[cor];
    const totalLinha = TAMS_E.reduce((a, t) => a + q[t], 0);
    TAMS_E.forEach(t => totais[t] += q[t]);

    const linha = document.createElement('div');
    linha.className = 'cor-linha';
    linha.innerHTML = `
      <span class="cor-nome">${escHtml(cor)}</span>
      ${TAMS_E.map(t => {
        const v = q[t] || 0;
        return `<span class="qtd${v === 0 ? ' zero' : ''}">${v || '—'}</span>`;
      }).join('')}
      <span class="total">= ${totalLinha}</span>
    `;
    lista.appendChild(linha);
  });

  const totalGeral = Object.values(totais).reduce((a, v) => a + v, 0);
  document.getElementById('tot-rn').textContent = totais.RN || '—';
  document.getElementById('tot-p').textContent  = totais.P  || '—';
  document.getElementById('tot-m').textContent  = totais.M  || '—';
  document.getElementById('tot-g').textContent  = totais.G  || '—';
  document.getElementById('tot-gg').textContent = totais.GG || '—';
  document.getElementById('tot-geral').textContent = `= ${totalGeral}`;

  document.getElementById('info').textContent =
    `REF ${ref} · ${coresOrdenadas.length} cor${coresOrdenadas.length!==1?'es':''} · ${totalGeral} peças`;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

document.addEventListener('DOMContentLoaded', init);
