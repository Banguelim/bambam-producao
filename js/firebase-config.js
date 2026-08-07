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

// TUDO desse sistema vai em /producao_dados/ pra não misturar com bambam-ponto
const PRODUCAO = db.collection('producao_dados');
