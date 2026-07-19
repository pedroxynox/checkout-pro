> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/prisma/`

# Módulo: `prisma`

## 1. Propósito
Acesso ao banco de dados via **Prisma**: fornece um `PrismaService` global,
integrado ao ciclo de vida do Nest, injetável em qualquer módulo de domínio.

## 2. Responsabilidades e limites
- **Faz:** estende o `PrismaClient`; conecta ao inicializar o módulo e
  desconecta ao destruí-lo; disponibiliza o `PrismaService` globalmente para
  consultas e persistência.
- **Não faz:** não contém regra de negócio; não define o esquema (fica em
  `prisma/schema.prisma`, fora de `src`); não trata erros de domínio
  (fica em [`common`](common.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `prisma.service.ts` | `PrismaService` (client + ciclo de vida) | 41 |
| `prisma.module.ts` | Módulo global que provê/exporta o `PrismaService` | 13 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** Fornece o `PrismaService` (acesso ao banco) a todos os
demais módulos. Como o `PrismaModule` é `@Global`, qualquer serviço pode
injetá-lo sem reimportar o módulo.

## 5. Serviços e funções

### `PrismaService`
- **`onModuleInit()`** — tenta `$connect()`; se o banco ainda não estiver
  disponível, **não interrompe** o bootstrap (registra um aviso) e deixa a
  conexão ser refeita na primeira consulta.
- **`onModuleDestroy()`** — `$disconnect()`.
- **Herda do `PrismaClient`** todos os métodos de consulta/escrita por modelo
  (`prisma.usuario`, `prisma.notificacao`, etc.), usados pelos serviços de
  domínio.

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

## 11. Testes
Não se aplica (sem testes dedicados no módulo). O `PrismaService` é exercitado
indiretamente pelos testes dos módulos de domínio (com Prisma real ou falso).

## 12. Riscos, dívidas e pendências
- ⚠️ **Boot sem banco não falha:** conveniente em dev, mas em produção pode
  mascarar um banco indisponível até a primeira consulta (que então falha);
  monitorar o aviso de inicialização.
- 🔧 Sem middlewares/log de consultas configurados aqui; observabilidade de
  queries dependeria de configuração adicional se necessária.
