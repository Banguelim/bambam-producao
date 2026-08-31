# BAMBAM BABY — Sistema de Controle de Produção

Sistema web pra controlar produção, costureiras e estoque da BAMBAM BABY.
Substitui a planilha `ESTOQUE_ONEDRIVE.xlsm`.

## Stack
- **Hosting**: GitHub Pages
- **Backend**: Firebase (mesmo projeto do `bambam-ponto`)
- **Auth**: Firebase Auth (mesmos usuários)
- **Banco**: Firestore

## Estrutura de arquivos

```
bambam-producao/
├── index.html              ← página com menu principal (após login)
├── login.html              ← tela de login
├── novo-corte.html         ← Tela 1: novo corte
├── designacao.html         ← Tela 2: designar pra costureira
├── retorno.html            ← Tela 3: chegada das peças
├── pagamento.html          ← Tela 4: pagar costureira
├── estoque-entrada.html    ← Tela 5: entrada no estoque final
├── cadastros.html          ← cadastros (refs, costureiras, preços)
├── css/
│   ├── base.css            ← reset, cores, fontes
│   ├── forms.css           ← inputs, botões
│   ├── grade5.css          ← as 5 colunas (padrão de todas as telas)
│   └── theme.css           ← modo escuro/claro
├── js/
│   ├── firebase-config.js  ← config do Firebase (SUBSTITUIR credenciais)
│   ├── auth.js             ← login/logout
│   ├── db.js               ← funções de leitura/escrita Firestore
│   ├── utils.js            ← abreviações de cor, formatação
│   ├── novo-corte.js       ← lógica da Tela 1
│   ├── designacao.js       ← lógica da Tela 2
│   ├── retorno.js          ← lógica da Tela 3
│   ├── pagamento.js        ← lógica da Tela 4
│   └── estoque-entrada.js  ← lógica da Tela 5
├── seed/                   ← dados iniciais pra popular Firestore uma vez
│   ├── refs.json
│   ├── costureiras.json
│   ├── precos.json
│   └── lotes-fora.json
└── admin/
    └── importar.html       ← página de admin pra rodar o import inicial
```

## Módulo de Vendas / Financeiro

Extraído do controle de vendas em planilha (pedidos + contas a receber), vive nas
mesmas telas/estilo do sistema de produção, mas em coleções Firestore separadas
(`vendas_dados/`) pra não misturar com `producao_dados/`.

```
vendas-cadastros.html    ← abas: Clientes, Vendedores, Tabelas de preço de venda
pedido.html               ← novo pedido / pedidos em aberto — itens por ref/cor/tamanho,
                             preço puxado da tabela do cliente (ou digitado manual),
                             romaneio de separação (detalhado) e de conferência (resumido)
contas-receber.html       ← parcelas geradas ao concluir um pedido — dar baixa/reabrir
js/db-vendas.js           ← toda a camada Firestore do módulo (100% autônomo)
```

### `/vendas_dados/meta/clientes/{id}`
```
{ nome, cnpj, cidade, estado, telefone, email, vendedor, tabela_preco, ativo }
```

### `/vendas_dados/meta/vendedores/{nome}` — `{ nome, ativo }`

### `/vendas_dados/meta/tabelas/{nome}` — nomes de tabela de preço além das padrão
(`BASE, NT, BRAULIO, MERCADAO, SD, ND, ESPECIAL, MEIA NOTA, NOVA`)

### `/vendas_dados/meta/precos_venda/{ref}` — `{ ref, nome, precos: { <tabela>: valor } }`

### `/vendas_dados/op/pedidos/{numero}`
```
{
  numero, cliente, cliente_id, vendedor, tabela_preco, data_pedido,
  itens: [ { ref, cor, qtds: {RN,P,M,G,GG}, qtd, preco, subtotal } ],
  total_pecas, total_valor, parcelas, data_vencimento_base,
  status: "aberto" | "concluido", concluido_em
}
```
Ao **concluir** um pedido: dá baixa no estoque de produção (`producao_dados/op/estoque`,
mesma coleção que a tela Arremate alimenta) e gera as parcelas em Contas a Receber.

### `/vendas_dados/op/contas_receber/{id}`
```
{
  pedido_id, cliente, cliente_id, parcela_num, parcelas_total, valor,
  data_emissao, data_vencimento, status: "aberto" | "pago",
  data_pagamento, valor_pago
}
```

## Modelo de dados Firestore

Todas as coleções em `/producao/{docId}` pra não misturar com o `bambam-ponto`.

### `/producao/refs/{ref}`
```
{
  ref: "205",
  composta: false,          // true se ref tem várias partes (ex: 205 + 205MT)
  partes: ["205", "205MT"], // se composta
  ativa: true
}
```

### `/producao/costureiras/{costureira}`
```
{
  nome: "ALINE",
  ativa: true,
  telefone: "",             // opcional pra depois
  saldo_adiantamento: 0     // R$ que ela tem de crédito
}
```

### `/producao/precos/{ref}_{costureira}`
```
{
  ref: "205",
  costureira: "ALINE",
  preco: 2.80,              // R$ por peça
  atualizado_em: <timestamp>
}
```

### `/producao/cortes/{corteId}`
```
{
  lote: "2041A",
  refs: ["205", "205MT"],    // uma ou mais
  data_corte: "2026-08-05",
  itens: [
    { ref: "205", cor: "AMARELO", tam: "P", qtd: 25 },
    ...
  ],
  total_pecas: 375,
  status: "cortado" | "designado_parcial" | "designado_total",
  criado_por: "usuario_uid",
  criado_em: <timestamp>
}
```

### `/producao/notas/{numeroNota}`
```
{
  numero: "0143",
  corte_id: "abc123",
  lote: "2041A",
  ref: "205",
  costureira: "ALINE",
  data_saida: "2026-08-05",
  itens: [ { cor: "AMARELO", tam: "P", qtd: 25 }, ... ],
  total_saida: 375,
  preco_peca: 2.80,
  valor_nota: 1050.00,
  chegada_1: { data: "", qtds: { RN: 0, P: 0, ... } },
  chegada_2: { data: "", qtds: { RN: 0, P: 0, ... } },
  pagamentos: [ { data, valor, forma, obs } ],
  status: "aberta" | "paga_parcial" | "paga_total" | "no_estoque",
  criado_em: <timestamp>
}
```

### `/producao/adiantamentos/{adiantId}`
```
{
  costureira: "ALINE",
  data: "2026-08-05",
  valor: 100.00,
  saldo: 100.00,             // diminui conforme é descontado
  usados_em: [ { nota_id, valor } ]
}
```

### `/producao/estoque/{sku}`
Chave = ref_cor_tam (ex: "205_AMARELO_P")
```
{
  ref: "205",
  cor: "AMARELO",
  tam: "P",
  qtd: 25,                   // quantidade em estoque disponível
  qtd_aguardando: 0,         // arremate pronto mas ainda não deu entrada
  ultima_entrada: "2026-08-06"
}
```

## Ordem de construção

1. ✅ Extrair dados da planilha → `seed/*.json`
2. ⏳ Esqueleto do projeto + Firebase config
3. ⏳ Login + navegação
4. ⏳ Importador dos dados iniciais
5. ⏳ Tela Novo Corte
6. ⏳ Tela Designação
7. ⏳ Tela Retorno
8. ⏳ Tela Pagamento
9. ⏳ Tela Entrada no Estoque
10. ⏳ Cadastros (refs, costureiras, preços)
