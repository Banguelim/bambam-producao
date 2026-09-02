// Sistema de restrição de acesso — BAMBAM BABY
// -----------------------------------------------------
// Pra ADICIONAR/REMOVER usuários ou mudar permissões,
// edite APENAS o objeto PERMISSOES abaixo. Nada mais.
// -----------------------------------------------------
//
// ⚠ E-mails DEVEM ser em MINÚSCULAS (o sistema converte antes de comparar,
//    mas escreva minúsculo pra evitar confusão).
//
// 'todas' = acesso completo (admin)
// Lista = ['tela1', 'tela2', ...]  — só as telas listadas
//
// Nomes de tela válidos (arquivo .html sem o .html):
//   'index'  'novo-corte'  'designacao'  'retorno'  'pagamento'
//   'arremate'  'estoque'  'cadastros'  'relatorios'
//   'pedido'  'pedido-novo'  'vendas-cadastros'  'contas-receber'

const PERMISSOES = {
  'pss@bambam.com':               'todas',
  'beutimar@bambam.com':          'todas',
  'braulio@bambam.com':           'todas',
  'corte@bambam.com':             ['index', 'novo-corte', 'designacao'],
  'retorno@bambam.com':           ['index', 'retorno', 'arremate', 'designacao']
};

// Retorna a página inicial pra onde o usuário deve ir depois de logar
function paginaInicialDoUsuario(email) {
  const perms = PERMISSOES[String(email || '').toLowerCase()];
  if (!perms) return null;
  if (perms === 'todas') return 'index.html';
  const primeira = perms.find(p => p !== 'index') || 'index';
  return primeira + '.html';
}

// Checa se o e-mail pode acessar uma tela específica
function podeAcessar(email, tela) {
  const perms = PERMISSOES[String(email || '').toLowerCase()];
  if (!perms) return false;
  if (perms === 'todas') return true;
  return perms.includes(tela);
}

// Descobre o nome da tela pelo próprio arquivo HTML aberto
function telaAtual() {
  const path = window.location.pathname;
  const arquivo = path.substring(path.lastIndexOf('/') + 1);
  return arquivo.replace('.html', '').trim() || 'index';
}

// Esconde do menu (topbar) os links que o usuário não pode acessar
function ajustarMenuPorPermissao(email) {
  const perms = PERMISSOES[String(email || '').toLowerCase()];
  if (!perms || perms === 'todas') return;
  const links = document.querySelectorAll('.topbar .nav a');
  links.forEach(a => {
    const href = (a.getAttribute('href') || '').replace('.html', '').trim();
    if (href && !perms.includes(href)) {
      a.style.display = 'none';
    }
  });
}
