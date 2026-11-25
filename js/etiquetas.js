// Etiquetas de costura — 3,35 cm de largura, linha de 50 mm (de um furo ao outro), 3 por linha
// Regras (Portaria Inmetro 118/2021 / NM ISO 3758): nome/razão social, CNPJ, país de origem,
// composição, tamanho e os 5 cuidados na ordem: lavagem, alvejamento, secagem, passadoria, profissional.

const colEmpresas = () => PRODUCAO.doc('meta').collection('empresas');

// Modelos de cuidados (sugestão conservadora — confirme com teste de lavagem)
const MODELOS = {
  algodao: { texto: '100% ALGODÃO',                lav: 40, delicado: false, sec: 'baixa', pas: 2, },
  mista:   { texto: '67% POLIESTER / 33% VISCOSE', lav: 30, delicado: true,  sec: 'nao',   pas: 1, }
};

let corte = null, refDoc = null, empresas = [];

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);

function fmtCnpj(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return String(v || '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// ---------- Símbolos de conservação (NM ISO 3758) ----------
function svg(inner) { return `<svg viewBox="0 0 10 11">${inner}</svg>`; }
function symLavagem(m) {
  return svg(`<path d="M.9 3.2h8.2l-1 5.8H1.9z"/><path d="M1.6 2q.8-.9 1.6 0t1.6 0 1.6 0 1.6 0"/>` +
    `<text x="5" y="7.6" font-size="3.4" text-anchor="middle" fill="#000" stroke="none" font-weight="700">${m.lav}</text>` +
    (m.delicado ? `<path d="M1.9 10.3h6.2"/>` : ''));
}
function symAlvejar() { // não alvejar
  return svg(`<path d="M5 1.2L9.2 9.4H.8z"/><path d="M2 2.4L8 9.6M8 2.4L2 9.6"/>`);
}
function symSecagem(m) {
  const base = `<rect x="1" y="1.5" width="8" height="8"/><circle cx="5" cy="5.5" r="3"/>`;
  if (m.sec === 'nao') return svg(base + `<path d="M.5 1L9.5 10M9.5 1L.5 10"/>`);
  return svg(base + `<circle cx="5" cy="5.5" r=".6" fill="#000"/>`); // 1 ponto = temperatura baixa
}
function symPassar(m) {
  const dots = m.pas === 2 ? `<circle cx="4" cy="6.6" r=".6" fill="#000"/><circle cx="6.2" cy="6.6" r=".6" fill="#000"/>`
                           : `<circle cx="5" cy="6.6" r=".6" fill="#000"/>`;
  return svg(`<path d="M1 9h8.3C9.3 6 8 3.6 5.2 3.6H1z"/>` + dots);
}
function symProf() { // não limpar a seco
  return svg(`<circle cx="5" cy="5.5" r="4"/><path d="M2 2.5L8 8.5M8 2.5L2 8.5"/>`);
}

// ---------- Etiqueta ----------
function htmlEtiqueta(tam, ctx) {
  if (!tam) return '<div class="et"></div>'; // posição vazia
  const m = MODELOS[ctx.modelo];
  const comp = (ctx.comp || m.texto).split('/').map(x => esc(x.trim())).join('<br>');
  return `<div class="et">
    <div class="t">${esc((ctx.mapaTam && ctx.mapaTam[tam]) || tam)}</div>
    <div class="c">${comp}</div>
    <div class="e">${esc(ctx.emp.nome)}</div>
    <div class="n">CNPJ ${esc(fmtCnpj(ctx.emp.cnpj))}</div>
    <div class="s">${symLavagem(m)}${symAlvejar()}${symSecagem(m)}${symPassar(m)}${symProf()}</div>
    <div class="b">BRASIL</div>
    <div class="l">LOT: ${esc(ctx.lote)}</div>
  </div>`;
}

function contexto() {
  const emp = empresas.find(e => e.id === $('empresa').value);
  if (!emp) return null;
  // mapaTam: nome do tamanho na etiqueta, definido no cadastro da ref (ex.: P → 1). Vazio = igual ao sistema.
  const mapaTam = (refDoc && refDoc.etiqueta_tam) || {};
  return { emp, modelo: $('modelo').value, comp: refDoc && refDoc.composicao ? refDoc.composicao : '', lote: corte.lote, mapaTam };
}
function quantidades() {
  const q = {};
  TAMS.forEach(t => { q[t] = Math.max(0, parseInt($('q-' + t).value) || 0); });
  return q;
}
function atualizarPrevia() {
  const ctx = contexto();
  if (!corte || !ctx) { $('previa').innerHTML = '<span style="color:#666;font-size:12px">Escolha a empresa pra ver a prévia.</span>'; return; }
  const q = quantidades();
  const tam = TAMS.find(t => q[t] > 0) || 'P';
  $('previa').innerHTML = htmlEtiqueta(tam, ctx);
}

function montarFolha(soTeste) {
  const ctx = contexto();
  if (!ctx) { toast('Escolha a empresa da etiqueta', 'err'); return false; }
  const q = quantidades();
  let linhas = '';
  let tamsUsar = TAMS.filter(t => q[t] > 0);
  if (!tamsUsar.length) { toast('Informe ao menos uma quantidade', 'err'); return false; }
  if (soTeste) { tamsUsar = [tamsUsar[0]]; q[tamsUsar[0]] = 3; }
  tamsUsar.forEach(t => {
    const n = q[t];
    for (let i = 0; i < n; i += 3) {
      let cels = '';
      for (let k = 0; k < 3; k++) cels += htmlEtiqueta(i + k < n ? t : '', ctx);
      linhas += `<div class="linha">${cels}</div>`;
    }
  });
  $('folha').innerHTML = linhas;
  return true;
}

// ---------- Empresas ----------
async function carregarEmpresas() {
  const snap = await colEmpresas().get();
  empresas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nome.localeCompare(b.nome));
  const sel = $('empresa');
  const ultimo = localStorage.getItem('etq_empresa');
  sel.innerHTML = empresas.length
    ? empresas.map(e => `<option value="${esc(e.id)}">${esc(e.nome)} — ${esc(fmtCnpj(e.cnpj))}</option>`).join('')
    : '<option value="">(cadastre uma empresa)</option>';
  if (ultimo && empresas.some(e => e.id === ultimo)) sel.value = ultimo;
  if (!empresas.length) $('form-emp').style.display = 'flex';
}
async function salvarEmpresa() {
  const nome = $('emp-nome').value.trim().toUpperCase();
  const cnpj = $('emp-cnpj').value.replace(/\D/g, '');
  if (!nome) { toast('Digite a razão social', 'err'); return; }
  if (cnpj.length !== 14) { toast('O CNPJ precisa ter 14 números', 'err'); return; }
  try {
    await colEmpresas().doc(cnpj).set({ nome, cnpj, atualizado_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    localStorage.setItem('etq_empresa', cnpj);
    $('emp-nome').value = ''; $('emp-cnpj').value = '';
    $('form-emp').style.display = 'none';
    await carregarEmpresas();
    atualizarPrevia();
    toast('✓ Empresa salva', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}

// ---------- Corte ----------
async function buscarPorLote() {
  const lote = $('lote').value.trim().toUpperCase();
  if (!lote) return;
  $('chips').innerHTML = '';
  try {
    const snap = await colCortes().where('lote', '==', lote).get();
    if (snap.empty) { $('info-corte').textContent = `Nenhum corte com o lote ${lote}.`; return; }
    const cortes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (cortes.length === 1) { await abrirCorte(cortes[0]); return; }
    $('info-corte').textContent = 'Esse lote tem mais de uma ref. Escolha:';
    cortes.forEach(c => {
      const b = document.createElement('button');
      b.className = 'btn sec';
      b.textContent = (c.refs || []).join('+');
      b.onclick = () => abrirCorte(c);
      $('chips').appendChild(b);
    });
  } catch (e) { toast('Erro: ' + e.message, 'err'); }
}
async function abrirCorte(c) {
  corte = c;
  $('lote').value = c.lote;
  $('chips').innerHTML = '';
  const ref = (c.refs || [])[0];
  refDoc = null;
  try { const d = await colRefs().doc(ref).get(); refDoc = d.exists ? d.data() : null; } catch (e) { console.warn(e); }
  $('info-corte').innerHTML = `Lote <b>${esc(c.lote)}</b> · Ref <b>${esc(ref)}</b> · ${c.total_pecas} peças`;

  // modelo de cuidados sugerido pela composição cadastrada na ref
  const comp = (refDoc && refDoc.composicao || '').toUpperCase();
  let aviso = '';
  if (comp.includes('VISCO')) $('modelo').value = 'mista';
  else if (comp.includes('ALGOD')) $('modelo').value = 'algodao';
  else aviso = 'Esta ref ainda não tem composição no cadastro — escolha o modelo aqui e depois cadastre a composição da ref.';
  $('info-comp').textContent = comp ? `Composição cadastrada na ref: ${comp}` : aviso;

  // quantidade por tamanho = soma das peças do corte naquele tamanho
  const q = {};
  TAMS.forEach(t => q[t] = 0);
  (c.itens || []).forEach(i => { if (q[i.tam] !== undefined) q[i.tam] += i.qtd || 0; });
  $('qtds').innerHTML = TAMS.map(t => `<label style="font-size:11px;color:var(--text-secondary);font-weight:600;display:flex;flex-direction:column;gap:4px">${t}<input type="number" min="0" id="q-${t}" value="${q[t]}"></label>`).join('');
  TAMS.forEach(t => $('q-' + t).addEventListener('input', atualizarPrevia));
  $('painel').style.display = 'block';
  atualizarPrevia();
}

// Ajuste fino: altura da linha, deslocamentos e moldura de teste (salvo neste computador)
function aplicarAjustes(salvar) {
  const n = (id, pad) => { const v = parseFloat($(id).value); return isNaN(v) ? pad : v; };
  const h = Math.max(10, n('aj-h', 50)), y = n('aj-y', 0), x = n('aj-x', 0), m = $('aj-m').checked, r = $('aj-r').checked, ml = Math.min(8, Math.max(0, n('aj-ml', 3)));
  if (salvar) localStorage.setItem('etq_aj', JSON.stringify({ h, y, x, m, r, ml }));
  let st = document.getElementById('estilo-ajuste');
  if (!st) { st = document.createElement('style'); st.id = 'estilo-ajuste'; document.head.appendChild(st); }
  st.textContent = `.et { padding-left: ${ml}mm; padding-right: ${ml}mm; }
@page { size: 100.5mm ${h}mm; margin: 0; }
@media print {
  .linha { height: ${h}mm !important; overflow: hidden; position: relative; left: ${x}mm; top: ${y}mm; ${r ? 'transform: rotate(180deg);' : ''} }
  .et { height: ${h}mm !important; ${m ? 'outline: .25mm solid #000; outline-offset: -.25mm;' : ''} }
}`;
}
function carregarAjustes() {
  try {
    const a = JSON.parse(localStorage.getItem('etq_aj') || 'null');
    if (a) { $('aj-h').value = a.h; $('aj-y').value = a.y; $('aj-x').value = a.x; $('aj-m').checked = !!a.m; $('aj-r').checked = !!a.r; if (a.ml !== undefined) $('aj-ml').value = a.ml; }
  } catch (e) { /* sem ajustes salvos */ }
  ['aj-h', 'aj-y', 'aj-x', 'aj-m', 'aj-r', 'aj-ml'].forEach(id => $(id).addEventListener('input', () => aplicarAjustes(true)));
  aplicarAjustes(false);
}

function imprimir(teste) {
  if (!montarFolha(teste)) return;
  window.print();
}

async function init() {
  await protegerRota();
  await carregarEmpresas();
  $('btn-buscar').addEventListener('click', buscarPorLote);
  $('lote').addEventListener('keydown', e => { if (e.key === 'Enter') buscarPorLote(); });
  $('btn-nova-emp').addEventListener('click', () => { const f = $('form-emp'); f.style.display = f.style.display === 'none' ? 'flex' : 'none'; });
  $('btn-salvar-emp').addEventListener('click', salvarEmpresa);
  $('empresa').addEventListener('change', () => { localStorage.setItem('etq_empresa', $('empresa').value); atualizarPrevia(); });
  $('modelo').addEventListener('change', atualizarPrevia);
  carregarAjustes();
  $('btn-teste').addEventListener('click', () => imprimir(true));
  $('btn-imprimir').addEventListener('click', () => imprimir(false));

  const id = new URLSearchParams(location.search).get('corte');
  if (id) {
    const c = await buscarCorte(id);
    if (c) await abrirCorte(c); else toast('Corte não encontrado', 'err');
  }
}
init();
