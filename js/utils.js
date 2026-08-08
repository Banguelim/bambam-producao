// Constantes e helpers usados em todas as telas

const TAMS = ['RN','P','M','G','GG'];

const CORES = [
  'AZUL','TURQ','PISC','ROSA','PINK','ROSÃO','VERDE','MAR',
  'VERMELHO','MARINHO','AMARELO','BCO','LILAS','MROM','BEGE',
  'MCLA','MARFIM','RIAL'
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
function hojeISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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

// Toast (mensagem no canto)
function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
