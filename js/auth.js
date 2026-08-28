// Auth helpers — usa o Firebase Auth do mesmo projeto do bambam-ponto.
// AGORA COM controle de acesso automático:
//   - Se e-mail não está autorizado → desloga e volta pro login
//   - Se e-mail não pode acessar esta tela → redireciona pra tela permitida
//   - Esconde do menu os links que o usuário não pode acessar
// Nenhuma outra tela precisa ser alterada — o próprio protegerRota() descobre
// qual tela é (pelo nome do arquivo HTML) e faz tudo automaticamente.

function protegerRota() {
  return new Promise(resolve => {
    auth.onAuthStateChanged(user => {
      if (!user) {
        window.location.href = 'login.html';
        return;
      }

      const email = (user.email || '').toLowerCase();

      // Se o sistema de permissões estiver carregado, aplica as regras
      if (typeof PERMISSOES !== 'undefined') {

        // 1) E-mail autorizado neste sistema?
        if (!(email in PERMISSOES)) {
          alert('Usuário não autorizado neste sistema.\nEntre em contato com o administrador.');
          auth.signOut().then(() => { window.location.href = 'login.html'; });
          return;
        }

        // 2) Descobre a tela atual (pelo próprio arquivo HTML) e checa permissão
        const tela = (typeof telaAtual === 'function') ? telaAtual() : 'index';
        if (!podeAcessar(email, tela)) {
          const paginaOk = paginaInicialDoUsuario(email) || 'login.html';
          alert('Você não tem permissão pra acessar esta tela.');
          window.location.href = paginaOk;
          return;
        }

        // 3) Esconde do menu os links proibidos
        if (typeof ajustarMenuPorPermissao === 'function') {
          ajustarMenuPorPermissao(email);
        }
      }

      // Preenche o email na topbar (comportamento antigo mantido)
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
    const cred = await auth.signInWithEmailAndPassword(email, senha);
    const emailLogado = (cred.user.email || '').toLowerCase();

    // Verifica se o e-mail está autorizado no sistema
    if (typeof PERMISSOES !== 'undefined') {
      if (!(emailLogado in PERMISSOES)) {
        await auth.signOut();
        return 'Usuário não autorizado neste sistema. Fale com o administrador.';
      }
      // Redireciona pra página inicial do usuário
      window.location.href = paginaInicialDoUsuario(emailLogado) || 'index.html';
      return;
    }

    // Fallback (não deveria acontecer se acesso.js estiver incluído)
    window.location.href = 'index.html';
  } catch (e) {
    return e.message;
  }
}
