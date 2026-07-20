> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/prisma/`

# Módulo: `prisma`

## 1. Propósito
Acesso ao banco de dados via **Prisma**: fornece um `PrismaService` global,
integrado ao ciclo de vida do Nest, injetável em qualquer módulo de domínio.

## 2. Responsabilidades e limites
- **Faz:** estende o `PrismaClient`; conecta ao inicializar o módulo e
  desconecta ao destruí-lo; disponibiliza o `PrismaService` globalmente para
  consultas e persistência; **aplica um teto explícito ao pool de conexões**
  (`connection_limit` + `pool_timeout`) na `DATABASE_URL`.
- **Não faz:** não contém regra de negócio; não define o esquema (fica em
  `prisma/schema.prisma`, fora de `src`); não trata erros de domínio
  (fica em [`common`](common.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `prisma.service.ts` | `PrismaService` (client + pool + ciclo de vida) e o helper `aplicarLimiteDePool` | 96 |
| `prisma.module.ts` | Módulo global que provê/exporta o `PrismaService` | 13 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** Fornece o `PrismaService` (acesso ao banco) a todos os
demais módulos. Como o `PrismaModule` é `@Global`, qualquer serviço pode
injetá-lo sem reimportar o módulo.

## 5. Serviços e funções

### `PrismaService`
- **`constructor()`** — monta a URL de conexão aplicando o teto do pool
  (`aplicarLimiteDePool`) e a repassa ao `PrismaClient` via `datasources`. Sem
  `DATABASE_URL` (dev/teste), delega ao datasource padrão do `schema.prisma`.
- **`onModuleInit()`** — tenta `$connect()`; se o banco ainda não estiver
  disponível, **não interrompe** o bootstrap (registra um aviso) e deixa a
  conexão ser refeita na primeira consulta.
- **`onModuleDestroy()`** — `$disconnect()`.
- **Herda do `PrismaClient`** todos os métodos de consulta/escrita por modelo
  (`prisma.usuario`, `prisma.notificacao`, etc.), usados pelos serviços de
  domínio.

### `aplicarLimiteDePool(urlBase, limite, poolTimeoutSegundos)`
- **Função pura** que acrescenta `connection_limit` e `pool_timeout` à string
  de conexão, **sem sobrescrever** valores que já venham definidos nela.
- **Limite:** vem de `DATABASE_CONNECTION_LIMIT` (validada em
  [`config`](config.md)); padrão conservador **10** quando ausente ou inválida.
- **Motivo:** o Postgres pago básico do Render (`basic-256mb`) tem limite de
  conexões baixo; sem um teto explícito, a fórmula padrão do Prisma (somada a
  migrações, seed e sessões manuais) pode esgotar o banco.

## 6. Lógica de domínio (funções puras)
Não se aplica — o módulo é puramente de infraestrutura de acesso a dados.

## 7. Estados e enums
Não se aplica. Os modelos e enums do banco são definidos em
`prisma/schema.prisma`.

## 8. Dados que o módulo toca
- **Lê/escreve:** **todas** as tabelas, indiretamente — é o ponto único de
  acesso ao banco para os módulos de domínio.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `@prisma/client` (gerado a partir do `schema.prisma`) e a
  variável `DATABASE_URL` (validada em [`config`](config.md)).
- **É usado por:** praticamente **todos** os módulos do backend. Exporta o
  `PrismaService`.

## 10. Regras de negócio-chave
1. **Ponto único de acesso ao banco** (`PrismaService`), injetável globalmente.
2. **Boot resiliente:** falha de conexão inicial não derruba a aplicação; a
   conexão é retomada na primeira consulta.
3. **Ciclo de vida gerenciado pelo Nest** (conecta/desconecta com o módulo).
4. **Pool com teto explícito:** `connection_limit`/`pool_timeout` na URL,
   dimensionado para uma única instância web sobre o Postgres pago do Render.

## 11. Testes
Não se aplica (sem testes dedicados no módulo). O `PrismaService` é exercitado
indiretamente pelos testes dos módulos de domínio (com Prisma real ou falso).

## 12. Riscos, dívidas e pendências
- ⚠️ **Boot sem banco não falha:** conveniente em dev, mas em produção pode
  mascarar um banco indisponível até a primeira consulta (que então falha);
  monitorar o aviso de inicialização.
- 🔧 Sem middlewares/log de consultas configurados aqui; observabilidade de
  queries dependeria de configuração adicional se necessária.
- ⚠️ **Teto de pool acoplado ao plano do banco:** `DATABASE_CONNECTION_LIMIT`
  (padrão 10) foi dimensionado para **uma** instância web sobre o Postgres
  `basic-256mb`. Ao subir de plano, escalar horizontalmente (várias instâncias)
  ou usar um pooler externo (ex.: PgBouncer), reavaliar o valor para não
  esgotar as conexões do banco.
