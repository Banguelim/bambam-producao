# Como instalar o sistema — passo a passo

Você já tem o `bambam-ponto` no ar, então já sabe boa parte. Aqui só o que muda.

## 1. Criar o repo no GitHub

- Vai no seu GitHub, cria um repositório novo chamado **`bambam-producao`** (público ou privado, tanto faz)
- Não precisa de README/gitignore por enquanto, deixa vazio mesmo

## 2. Subir os arquivos

Você tem duas opções:

**Opção fácil** (arrastar no navegador):
- Abre o repo recém-criado no GitHub
- Clica em "uploading an existing file"
- Arrasta **todos os arquivos e pastas** que estão dentro da pasta `bambam-producao/`
- Commit

**Opção terminal** (se você usa git):
```
git clone https://github.com/SEU_USUARIO/bambam-producao.git
# copia tudo pra dentro
cd bambam-producao
git add .
git commit -m "primeira versão"
git push
```

## 3. Ativar GitHub Pages

- No repo, vai em **Settings → Pages**
- Em "Branch" escolhe `main` (ou `master`), pasta `/root`
- Clica em Save
- Espera 1-2 min → seu site vai estar em `https://SEU_USUARIO.github.io/bambam-producao/`

## 4. Configurar o Firebase (mesmo do bambam-ponto)

- Abre https://console.firebase.google.com
- Entra no **mesmo projeto** do bambam-ponto
- Vai em **Configurações do projeto** (engrenagem) → aba "Geral"
- Rola até "Seus apps" → clica no app da web → copia o objeto `firebaseConfig`
- Abre o arquivo `js/firebase-config.js` no GitHub (edita direto lá)
- **Substitui os placeholders** pelos valores reais (apiKey, projectId, etc)
- Salva

**IMPORTANTE**: se o Firestore ainda não estiver ativado nesse projeto:
- No console Firebase → Firestore Database → Criar banco de dados
- Escolhe modo **produção** e região próxima (ex: `southamerica-east1`)

## 5. Regras de segurança do Firestore

Vai em **Firestore Database → Regras** e cola:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Só usuários autenticados podem ler/escrever em producao_dados
    match /producao_dados/{doc=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
Publica.

## 6. Fazer o primeiro login

- Abre `https://SEU_USUARIO.github.io/bambam-producao/`
- Vai cair na tela de login
- Usa o mesmo email/senha que já tem cadastrado no Firebase Auth do bambam-ponto
- Se precisar cadastrar mais usuários: Firebase Console → Authentication → Users → Add user

## 7. Importar os dados iniciais (roda UMA vez só)

- Depois de logado, acessa: `https://SEU_USUARIO.github.io/bambam-producao/admin/importar.html`
- Clica em cada botão em ordem:
  1. **Importar refs** (1.172 refs)
  2. **Importar costureiras** (72)
  3. **Importar preços** (matriz costureira × ref — demora ~2min)
  4. **Importar lotes** (50 lotes ativos como notas em aberto)
- Espera cada um terminar antes de clicar no próximo
- Depois de importar tudo, **não precisa mais entrar nessa tela**

## 8. Começar a usar

- Volta ao painel
- Testa o **Novo corte** já funcional
- Testa criar um corte pequeno pra ver se salva
- Verifica no Firebase Console → Firestore se os dados apareceram

## O que já funciona

✅ Login/logout
✅ Painel com estatísticas
✅ **Novo corte** — tela completa e salvando
✅ Importação dos dados da planilha

## O que ainda vai ser implementado

⏳ Designação
⏳ Retorno
⏳ Pagamento
⏳ Entrada no estoque
⏳ Cadastros

Essas telas estão como stubs (em construção) — o menu funciona mas a página só mostra aviso.
Cada uma vamos implementar na próxima sessão, uma de cada vez.

---

Qualquer problema, me avisa e a gente ajusta.
