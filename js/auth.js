// Auth helpers — usa o Firebase Auth do mesmo projeto do bambam-ponto

// Chama isso no topo de cada tela protegida. Se não tiver logado, manda pra login.
function protegerRota() {
  return new Promise(resolve => {
    auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      // Preenche o email na topbar se tiver um span com id "user-email"
      const span = document.getElementById('user-email');
      if (span) span.textContent = user.email;
      resolve(user);
    });
  });
}

function logout() {
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}

// Chamado só na tela de login
async function fazerLogin(email, senha) {
  try {
    await auth.signInWithEmailAndPassword(email, senha);
    window.location.href = 'index.html';
  } catch (e) {
    return e.message;
  }
}
