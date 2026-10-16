// contador.js — BAMBAM PRODUÇÃO
// Conta as leituras do Firestore por tela, neste computador.
// Mostra um selo no canto inferior direito. Clique no selo para ver o detalhe por tela.
// Não grava nada no Firebase (não gasta cota). Guarda só no navegador.
(function () {
  if (!window.firebase || !firebase.firestore) {
    console.warn('contador.js: Firebase ainda não carregou. Coloque este script DEPOIS do firebase-config.js');
    return;
  }

  const PREFIXO = 'contador_leituras_';
  const d0 = new Date();
  const hoje = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  const CHAVE = PREFIXO + hoje;
  const tela = location.pathname.split('/').pop() || 'index.html';
  let nestaTela = 0;

  // Apaga contagens de dias anteriores
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PREFIXO) && k !== CHAVE) localStorage.removeItem(k);
    });
  } catch (e) {}

  function ler() {
    try { return JSON.parse(localStorage.getItem(CHAVE)) || { total: 0, telas: {} }; }
    catch (e) { return { total: 0, telas: {} }; }
  }

  function somar(n) {
    if (!n) return;
    const d = ler();
    d.total += n;
    d.telas[tela] = (d.telas[tela] || 0) + n;
    try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) {}
    nestaTela += n;
    atualizarSelo();
  }

  // ---------- Intercepta as leituras ----------
  const Q = firebase.firestore.Query.prototype;           // coleções e consultas
  const D = firebase.firestore.DocumentReference.prototype; // documentos

  const qGet = Q.get, dGet = D.get, qSnap = Q.onSnapshot, dSnap = D.onSnapshot;

  Q.get = function () {
    return qGet.apply(this, arguments).then(s => {
      if (!s.metadata.fromCache) somar(Math.max(s.size, 1)); // consulta vazia também cobra 1
      return s;
    });
  };

  D.get = function () {
    return dGet.apply(this, arguments).then(s => {
      if (!s.metadata.fromCache) somar(1);
      return s;
    });
  };

  function embrulhar(args, contar) {
    args = Array.from(args);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (typeof a === 'function') {
        args[i] = function (s) { if (!s.metadata.fromCache) contar(s); return a.apply(this, arguments); };
        break;
      }
      if (a && typeof a.next === 'function') {
        const orig = a.next;
        args[i] = Object.assign({}, a, { next: function (s) { if (!s.metadata.fromCache) contar(s); return orig.apply(a, arguments); } });
        break;
      }
    }
    return args;
  }

  Q.onSnapshot = function () {
    return qSnap.apply(this, embrulhar(arguments, s => somar(s.docChanges().length)));
  };

  D.onSnapshot = function () {
    return dSnap.apply(this, embrulhar(arguments, () => somar(1)));
  };

  // ---------- Selo na tela ----------
  let selo;
  function atualizarSelo() {
    if (!selo) return;
    const d = ler();
    let cor = '#2e7d32';                 // verde
    if (d.total >= 20000) cor = '#ef6c00'; // laranja
    if (d.total >= 40000) cor = '#c62828'; // vermelho (perto do limite grátis de 50.000)
    selo.style.background = cor;
    selo.textContent = '📊 Leituras hoje: ' + d.total.toLocaleString('pt-BR') +
      '  ·  esta tela: ' + nestaTela.toLocaleString('pt-BR');
  }

  function criarSelo() {
    selo = document.createElement('div');
    selo.title = 'Clique para ver o detalhe por tela';
    selo.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;color:#fff;' +
      'font:bold 12px Arial,sans-serif;padding:6px 10px;border-radius:6px;cursor:pointer;' +
      'box-shadow:0 2px 6px rgba(0,0,0,.3);opacity:.9';
    selo.onclick = function () {
      const d = ler();
      const linhas = Object.entries(d.telas)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => t + ': ' + n.toLocaleString('pt-BR'));
      alert('Leituras hoje neste computador: ' + d.total.toLocaleString('pt-BR') +
        '\n\nPor tela (maior primeiro):\n' + (linhas.join('\n') || '(nenhuma ainda)') +
        '\n\nLimite grátis do Firebase: 50.000 por dia (somando todos os computadores e o sistema de ponto).');
    };
    document.body.appendChild(selo);
    atualizarSelo();
  }

  if (document.body) criarSelo();
  else document.addEventListener('DOMContentLoaded', criarSelo);
})();
