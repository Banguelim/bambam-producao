// SUBSTITUIR OS VALORES ABAIXO pelas credenciais do SEU Firebase
// (mesmo projeto do bambam-ponto). Pega em: console.firebase.google.com
// → Configurações do projeto → Configuração do SDK
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// Inicializa o Firebase (v9 modular, mas usando compat pra ficar simples)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// TUDO desse sistema vai em /producao/ pra não misturar com bambam-ponto
const PRODUCAO = db.collection('producao_dados');
