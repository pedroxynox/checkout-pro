> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/produtos-pesados/`

# Módulo: `produtos-pesados`

## 1. Propósito
Catálogo dos **produtos pesados** (balança): guarda o **código de balança**
(o número que o operador digita) de cada produto e permite que qualquer pessoa
do time o consulte pelo nome. O catálogo é carregado a partir de um único
arquivo `.txt` exportado do ERP.

## 2. Responsabilidades e limites
- **Faz:** interpreta o arquivo `.txt` (todos os setores juntos, colunas por
  tabulação); **substitui** o catálogo inteiro a cada carga (idempotente);
  entrega o catálogo completo para o app; informa o estado atual (total, última
  atualização e contagem por setor).
- **Não faz:** não busca no servidor (o app baixa o catálogo e filtra em
  memória — ~500 itens); não guarda foto/descrição do produto (campos previstos,
  ainda não usados; a foto dependerá de um storage de objetos/S3, ver ADR 0013);
  não define permissões (isso vive em [`acessos`](acessos.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `produtos-pesados.parser.ts` | Regras puras: `parseProdutosPesados` + `normalizarTexto` | 113 |
| `produtos-pesados.service.ts` | Carga (substituição total), listagem e status | 138 |
| `produtos-pesados.controller.ts` | Rotas HTTP (consulta + upload) | 66 |
| `produtos-pesados.module.ts` | Ligações (DI) do módulo | 13 |
| `produtos-pesados.parser.spec.ts` | Testes do parser (dominio puro) | 72 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `produtos-pesados`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /produtos-pesados` | `PRODUTOS_PESADOS` | Catálogo completo (o app baixa e filtra em memória). |
| `GET /produtos-pesados/status` | `PRODUTOS_PESADOS` | Total, última atualização e contagem por setor. |
| `POST /produtos-pesados/upload` | `PRODUTOS_PESADOS_GERENCIAR` **ou** `IMPORTACOES` | Recebe o `.txt` (campo `file`) e substitui o catálogo inteiro. |

## 5. Serviços e funções

### `ProdutosPesadosService`

#### `importar(linhas)`
- **Recebe:** as linhas já lidas do arquivo (`LinhaProdutoPesado[]`).
- **Devolve:** `{ total, categorias[] }` (contagem por setor após a carga).
- **Efeitos:** deduplica por `(categoria, código)` (a última ocorrência vence),
  calcula `nomeNormalizado` e, numa **transação**, apaga tudo (`deleteMany`) e
  recria (`createMany`). Reenviar o mesmo arquivo deixa o catálogo idêntico.

#### `listar()`
Catálogo completo ordenado por setor e nome, com os campos que o app usa
(`id`, `codigo`, `nome`, `categoria`, `tipo`).

#### `status()`
Total de produtos, `atualizadoEm` (ISO ou `null` se vazio) e a contagem por
setor (via `groupBy`).

## 6. Lógica de domínio (funções puras)
- `parseProdutosPesados(conteudo)` → transforma o texto em `LinhaProdutoPesado[]`.
  Layout do ERP: `SEQPRODUTO | DESCCOMPLETA | CODACESSO | CATEGORIA_NV2 |
  CATEGORIA_NV3`. Interessam nome (DESCCOMPLETA), código (**CODACESSO**), setor
  (CATEGORIA_NV2) e tipo (CATEGORIA_NV3). Detecta e ignora o cabeçalho (mapeando
  os índices por nome quando presente), tolera separador por tabulação ou `;`,
  descarta linhas em branco/incompletas e normaliza o setor para maiúsculas.
- `normalizarTexto(t)` → minúsculas e sem acentos (usado no `nomeNormalizado`).

## 7. Estados e enums
Não se aplica (o setor é um texto livre, vindo do próprio arquivo).

## 8. Dados que o módulo toca
- **Lê/escreve:** `ProdutoPesado` (tabela `produtos_pesados`).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`.
- **É usado por:** o app móvel (área [`produtosPesados`](../04-atlas-mobile/produtosPesados.md));
  a carga é acionada pela tela de gestão no Centro de Controle.

## 10. Regras de negócio-chave
1. **Um único arquivo, todos os setores:** o setor vem da coluna `CATEGORIA_NV2`,
   então o catálogo se auto-organiza sem lista fixa de categorias.
2. **Carga = substituição total** e idempotente (transacional).
3. **Código único por setor** (`@@unique([categoria, codigo])`); duplicatas no
   arquivo são resolvidas mantendo a última ocorrência.
4. **Consulta liberada a todos; carga restrita à gestão** (ou ao importador).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `produtos-pesados.parser.spec.ts` | Leitura das colunas (com/sem cabeçalho), normalização de setor, descarte de linhas inválidas, separador alternativo | 7 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Layout do arquivo:** o parser assume o layout atual do ERP (colunas por
  tabulação, `CODACESSO` como código). Uma mudança de exportação exige ajustar o
  parser (coberto por testes).
- 🔧 **Busca em memória:** o app baixa o catálogo inteiro; adequado para ~500
  itens. Se crescer muito, avaliar busca no servidor com índice de texto
  (`nomeNormalizado` já está pronto para isso).
- 🔜 **Foto/descrição do produto:** campos `descricao`/`fotoUrl` já existem no
  modelo, mas só serão usados quando houver storage de objetos (S3) — a foto não
  deve ir para o disco efêmero do servidor.
