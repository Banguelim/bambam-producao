// Config do Firebase — bambam-ponto (compartilhado com sistema de ponto)
const firebaseConfig = {
  apiKey: "AIzaSyDQ6EUH_HBLYd76HMCdlgupNcwzTHvgido",
  authDomain: "bambam-ponto.firebaseapp.com",
  databaseURL: "https://bambam-ponto-default-rtdb.firebaseio.com",
  projectId: "bambam-ponto",
  storageBucket: "bambam-ponto.firebasestorage.app",
  messagingSenderId: "30916647304",
  appId: "1:30916647304:web:70323b427dbdd0e51d423d"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// NOVO 17/10/2026 — CACHE NO COMPUTADOR (economia de leituras)
// Guarda no navegador o que já foi baixado do Firebase. Quando uma tela
// (re)abre e pede a mesma lista de novo, o Firebase manda SÓ o que mudou
// desde a última vez, em vez de mandar tudo de novo — e cobra só isso.
// Os dados continuam sempre atualizados: cada consulta ainda confere no
// servidor. Se o navegador não suportar, o sistema segue normal sem cache.
try {
  db.enablePersistence({ synchronizeTabs: true }).catch(function (e) {
    console.warn('Cache offline do Firebase não ativado:', e.code || e);
  });
} catch (e) {
  console.warn('Cache offline do Firebase não ativado:', e);
}

// TUDO desse sistema vai em /producao_dados/ pra não misturar com bambam-ponto
const PRODUCAO = db.collection('producao_dados');
