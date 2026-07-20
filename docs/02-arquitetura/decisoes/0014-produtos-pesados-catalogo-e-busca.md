# ADR 0014 — Produtos pesados: catálogo por arquivo único e busca em memória

- **Status:** Aceito
- **Data:** 2026-07-20
- **Contexto:** A loja precisa consultar o **código de balança** (o número que o
  operador digita) de cada produto pesado. Os dados vêm de uma exportação do
  ERP: um único arquivo `.txt` (colunas separadas por tabulação) com **todos os
  setores juntos**, no layout `SEQPRODUTO | DESCCOMPLETA | CODACESSO |
  CATEGORIA_NV2 | CATEGORIA_NV3`. São ~500 produtos. A intenção é que **qualquer
  pessoa** do time consulte o código, e que a **carga** do arquivo seja feita
  pela gestão. Havia a opção de expor a busca no servidor ou de baixar o catálogo
  para o app.
- **Decisão:**
  1. **Modelo simples `ProdutoPesado`** (código, nome, `nomeNormalizado`, setor,
     tipo), reaproveitando o padrão já existente de "subir `.txt` → parsear →
     persistir" (como em vendas/arrecadação): parser **puro e testado**, e carga
     **transacional que substitui o catálogo inteiro** (idempotente).
  2. **O setor vem do próprio arquivo** (coluna `CATEGORIA_NV2`) — não há lista
     fixa de categorias; o catálogo se auto-organiza e aceita setores novos sem
     mudança de código.
  3. **Busca no cliente (em memória):** o app baixa o catálogo inteiro **uma vez**
     e filtra localmente (por nome sem acentos ou por código). Para ~500 itens é
     instantâneo, funciona offline após o primeiro carregamento e evita chamadas
     ao servidor a cada tecla.
  4. **Dois acessos, uma funcionalidade de consulta universal:** área na Home
     (`PRODUTOS_PESADOS`, todos os perfis) para consultar; tela no Centro de
     Controle (`PRODUTOS_PESADOS_GERENCIAR`, gestão) para carregar — o endpoint de
     upload também aceita o perfil de importação (`IMPORTACOES`).
- **Consequências:**
  - ✅ Consulta rápida e resiliente (offline após baixar), sem custo por busca no
     servidor.
  - ✅ Carga simples e segura (substituição total transacional), reaproveitando um
     padrão consolidado do projeto.
  - ✅ Sem acoplamento a categorias fixas.
  - ⚠️ A busca em memória pressupõe um catálogo pequeno (~500). Se crescer muito,
     migrar para busca no servidor — o campo `nomeNormalizado` já foi guardado
     pensando nisso (índice de texto no futuro).
  - ⚠️ O parser depende do layout atual do ERP; uma mudança de exportação exige
     ajuste (mitigado por testes puros).
  - 🔜 **Foto/descrição do produto (futuro):** os campos `descricao`/`fotoUrl` já
     existem no modelo, mas a foto só será viabilizada quando houver storage de
     objetos (S3): o disco do servidor é efêmero.
