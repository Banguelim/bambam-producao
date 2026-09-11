// Constantes e helpers usados em todas as telas

const TAMS = ['RN','P','M','G','GG'];

const CORES = [
  'AZUL','TURQ','PISCINA','ROSA','PINK','ROSÃO','VERDE','MAR',
  'VERMELHO','MARINHO','AMARELO','BCO','LILAS','MROM','BEGE',
  'MCLA','MARFIM','RIAL','SORTIDO'
];

// Retorna sempre o nome COMPLETO da cor (sem abreviar)
function abrevCor(cor) {
  if (!cor) return '';
  return cor.trim().toUpperCase();
}

// Formata R$ 1.050,00 (BR)
function formatBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// Formata data ISO (2026-08-06) → 06/08/2026
function formatDataBR(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

// Data de hoje em ISO (YYYY-MM-DD)
// CORREÇÃO 11/09/2026 — toISOString() converte pra UTC. Como o Brasil é
// UTC-3, depois das 21h no horário local o UTC já virou o dia seguinte, e
// "hoje" aparecia com a data de amanhã em toda tela que usa essa função.
// Agora monta a data a partir dos componentes locais (ano/mês/dia do
// próprio fuso do navegador), sem passar por UTC.
function hojeISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Selecionar tudo dentro de um contenteditable — pra que ao focar, já pode digitar substituindo
function selecionarTudo(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

// Sanitiza qtd contenteditable pra número
function sanitizarQtd(el, max) {
  let raw = el.textContent.replace(/\D/g, '');
  let v = parseInt(raw) || 0;
  if (max !== undefined && v > max) v = max;
  if (String(v) !== el.textContent) {
    el.textContent = String(v);
    selecionarTudo(el);
  }
  return v;
}

// Lembra o último valor digitado num campo (por tela), usando localStorage
// do navegador — assim, ao sair da tela e voltar depois (ex: foi em
// Designação e voltou pra Pagamento), o campo já reaparece preenchido com o
// que tinha antes, sem precisar digitar de novo.
// `chave` identifica o campo — use um nome único por tela+campo (ex:
// 'pagamento_costureira'), senão uma tela sobrescreve o valor lembrado de outra.
// Ao restaurar, dispara um 'change' de verdade no campo — assim QUALQUER
// script que esteja escutando esse campo (ex: pagamento-historico.js, que
// roda separado da tela principal) reage igual reagiria se a pessoa tivesse
// digitado/selecionado na mão. `aoRestaurar` (opcional) é extra, só se
// precisar de algo além do que os listeners de change/input já cobrem.
function lembrarCampo(inputEl, chave, aoRestaurar) {
  if (!inputEl) return;
  const chaveCompleta = 'bambam_lembrar_' + chave;
  try {
    const salvo = localStorage.getItem(chaveCompleta);
    if (salvo && !inputEl.value) {
      inputEl.value = salvo;
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof aoRestaurar === 'function') aoRestaurar();
    }
  } catch (e) { /* localStorage pode falhar (aba anônima etc.) — não é crítico */ }

  const salvar = () => {
    try { localStorage.setItem(chaveCompleta, inputEl.value || ''); } catch (e) {}
  };
  inputEl.addEventListener('change', salvar);
  inputEl.addEventListener('blur', salvar);
}

// Toast (mensagem na tela)
// tipo: '' (info), 'ok', 'err', 'ok grande', 'err grande'
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.style.whiteSpace = 'pre-line';  // respeita quebras de linha \n
  t.textContent = msg;
  document.body.appendChild(t);
  // Toast grande fica mais tempo visível (é o "salvo com sucesso" grande)
  const tempo = tipo.includes('grande') ? 2500 : 3500;
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, tempo);
}
