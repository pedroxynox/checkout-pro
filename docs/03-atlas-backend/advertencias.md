> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/advertencias/`

# Módulo: `advertencias`

## 1. Propósito
Gera e decide **solicitações automáticas de advertência** por falta não
justificada: todo dia um cron varre as faltas ainda pendentes e cria uma
solicitação para o gestor **aprovar** (lançando a advertência disciplinar) ou
**cancelar** (ADR 0013).

## 2. Responsabilidades e limites
- **Faz:** cron diário que cria solicitações PENDENTES por falta não justificada
  (idempotente por `ausenciaId`); avisa os gestores; lista/conta as pendentes,
  cancelando automaticamente as cujas faltas já foram justificadas/removidas;
  aprova (cria a advertência em Sanções via `IncidenciasService`) ou cancela.
- **Não faz** (fica em outro módulo): o registro/armazenamento da advertência em
  si (fica em [`incidencias`](incidencias.md), tipo `ADVERTENCIA`); o cadastro de
  faltas/ausências e sua justificativa; o cálculo do score do colaborador.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `advertencias.controller.ts` | Rotas HTTP (listar/contar/aprovar/cancelar) | 69 |
| `advertencias.service.ts` | Cron, geração das solicitações e decisão | 343 |
| `advertencias.module.ts` | Ligações (DI); exporta o serviço | 22 |
| `dto/advertencias.dto.ts` | Validação de entrada (motivo do cancelamento) | 9 |

> Não há `advertencias.domain.ts`: a lógica é orientada a persistência e efeitos
> (cron/Prisma/notificações), sem funções puras isoladas neste módulo.

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `advertencias`](../05-referencia-dados/api-http.md#advertencias).

O controller inteiro exige a funcionalidade `ADVERTENCIAS_DECIDIR`
(gerente/supervisor). A criação das solicitações é feita pelo cron, não por rota.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /advertencias/solicitacoes/pendentes` | `ADVERTENCIAS_DECIDIR` | Lista as pendentes (cancela em silêncio as já justificadas). |
| `GET /advertencias/solicitacoes/pendentes/contagem` | `ADVERTENCIAS_DECIDIR` | Total de pendentes (para o badge). |
| `POST /advertencias/solicitacoes/:id/aprovar` | `ADVERTENCIAS_DECIDIR` | Cria a advertência em Sanções e marca como aprovada. |
| `POST /advertencias/solicitacoes/:id/cancelar` | `ADVERTENCIAS_DECIDIR` | Cancela a solicitação (não lança advertência). |

## 5. Serviços e funções

### `AdvertenciasService`

#### `gerarSolicitacoesDiarias()` (`@Cron` 08:00 America/Sao_Paulo)
- **Efeitos:** dispara `gerarSolicitacoes(new Date())`; registra em log.
- **Regras aplicadas:** defensivo — nunca derruba o processo (captura erros).

#### `gerarSolicitacoes(hoje)`
- **Recebe:** a data de referência.
- **Devolve:** quantas solicitações foram criadas.
- **Efeitos:** busca faltas `PENDENTE` na janela retroativa (`JANELA_DIAS = 30`)
  anteriores a hoje; pula as que já têm solicitação (idempotência por
  `ausenciaId`); cria uma solicitação PENDENTE por falta de colaborador
  existente (motivo `MOTIVO_DESIDIA`); notifica os gestores.

#### `listarPendentes()` / `contarPendentes()`
Lista/conta as pendentes. Ao listar, faz a **limpeza inteligente**: se a falta
associada foi justificada ou removida, cancela a solicitação automaticamente e a
omite (cobre o caso "funcionário justificou e o gerente esqueceu de marcar").

#### `aprovar(id, autor)`
- **Efeitos:** re-checa a falta; cria a advertência via `IncidenciasService.registrar`
  (`tipo: ADVERTENCIA`, vínculo `causaTipo: 'FALTA'`) e marca a solicitação como `APROVADA`.
- **Erros possíveis:** `NotFoundException` (solicitação inexistente),
  `BadRequestException` (já decidida, falta já justificada/removida, ou
  advertência duplicada a partir de `IncidenciaDuplicadaError`).

#### `cancelar(id, motivo, autor)`
Marca a solicitação como `CANCELADA` com o motivo informado (ou padrão), sem
lançar advertência. Lança `NotFoundException`/`BadRequestException` como acima.

## 6. Lógica de domínio (funções puras)
Não se aplica. A lógica deste módulo vive no serviço (cron, consultas Prisma e
notificações), sem um `*.domain.ts` de funções puras.

## 7. Estados e enums
- `SolicitacaoAdvertencia.status`: `PENDENTE` · `APROVADA` · `CANCELADA`.
  Transições: `PENDENTE → APROVADA` (aprovar), `PENDENTE → CANCELADA` (cancelar
  manual ou limpeza automática quando a falta é justificada/removida). Uma vez
  decidida, não volta a PENDENTE.

## 8. Dados que o módulo toca
- **Escreve:** `SolicitacaoAdvertencia`; indiretamente `IncidenciaEscala` (via
  `IncidenciasService`, ao aprovar).
- **Lê:** `Ausencia`, `Colaborador`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService`, `IncidenciasService`
  (importa `IncidenciasModule` e `NotificacoesModule`); `ScheduleModule` (no `AppModule`).
- **É usado por:** o app (tela de Sanções, para decidir as solicitações); o
  módulo **exporta** `AdvertenciasService`.

## 10. Regras de negócio-chave
1. **A advertência não é automática:** o cron só cria a *solicitação*; o gestor
   decide (aprova ou cancela).
2. **Idempotência por `ausenciaId`:** uma falta gera no máximo uma solicitação.
3. **Janela retroativa de 30 dias:** evita solicitações para faltas muito antigas
   ao ligar a funcionalidade.
4. **Falta justificada/removida cancela a solicitação** automaticamente (na
   listagem e ao aprovar).
5. **Aprovar cria a advertência em Sanções** vinculada à falta (`causaTipo: FALTA`),
   recusando duplicatas.
6. **Só quem tem `ADVERTENCIAS_DECIDIR`** vê e decide as solicitações.

## 11. Testes
Não se aplica. O módulo não possui arquivos `*.spec.ts` próprios; a criação da
advertência é coberta indiretamente pelos testes de [`incidencias`](incidencias.md).

## 12. Riscos, dívidas e pendências
- ⚠️ Sem testes automatizados próprios; o comportamento do cron e da limpeza
  inteligente depende de verificação manual/integração.
- 🔧 `colaboradorId`/`ausenciaId` são referenciados como `String`; o serviço
  valida a existência do colaborador para evitar solicitações órfãs.
