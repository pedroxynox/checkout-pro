> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/feedforward/`

# Módulo: `feedforward`

## 1. Propósito
Registra as **rodadas de feedforward** (acompanhamento prospectivo) de cada
colaborador no seu perfil: foto do formulário, registro do líder, pontos a
melhorar com prazo e nota de evolução — com um "semáforo" que sinaliza os prazos
e avisa a liderança quando vencem.

## 2. Responsabilidades e limites
- **Faz:** CRUD das rodadas e dos pontos a melhorar; upload da foto do
  formulário; revisão dos pontos (atingido/não atingido) com auditoria; cálculo
  do semáforo (em dia/próximo/vencido); cron diário que avisa a liderança sobre
  prazos vencidos.
- **Não faz** (fica em outro módulo): sanções disciplinares (fica em
  [`incidencias`](incidencias.md)/[`advertencias`](advertencias.md)); o cálculo do
  score/perfil (fica em [`colaboradores`](colaboradores.md)); o armazenamento
  físico do arquivo (fica no `StorageModule`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `feedforward.controller.ts` | Rotas HTTP (listar/criar/foto/revisar/remover) | 117 |
| `feedforward.service.ts` | Regras de aplicação e persistência (Prisma) | 237 |
| `feedforward-alertas.service.ts` | Cron diário de avisos de prazo vencido | 66 |
| `feedforward.domain.ts` | Regras puras: semáforo e ponto vencido | 63 |
| `feedforward.module.ts` | Ligações (DI); exporta o serviço | 19 |
| `dto/feedforward.dto.ts` | Validação de entrada das rotas | 81 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `feedforward`](../05-referencia-dados/api-http.md#feedforward).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /feedforward/colaborador/:colaboradorId` | `FEEDFORWARD_VISUALIZAR` | Histórico de rodadas do colaborador. |
| `POST /feedforward` | `FEEDFORWARD_GERIR` | Cria uma rodada (com os pontos a melhorar). |
| `POST /feedforward/:id/foto` | `FEEDFORWARD_GERIR` | Envia a foto do formulário (valida imagem). |
| `PATCH /feedforward/ponto/:pontoId/revisar` | `FEEDFORWARD_GERIR` | Revisa um ponto (atingido/não atingido). |
| `DELETE /feedforward/:id` | `FEEDFORWARD_GERIR` | Remove a rodada (e seus pontos, em cascata). |

## 5. Serviços e funções

### `FeedforwardService`

#### `criar(dto, autor?)`
- **Recebe:** o DTO da rodada (colaborador, data, textos, nota e pontos) e o autor.
- **Devolve:** a `RodadaFeedforward` criada (com pontos e situação calculada).
- **Efeitos:** valida que o colaborador existe; grava a rodada e os pontos
  (prazo normalizado ao início do dia); registra o líder e o cargo.
- **Erros possíveis:** `NotFoundException` (colaborador inexistente).

#### `definirFoto(id, url)`
Grava a URL da foto do formulário na rodada; `NotFoundException` se não existir.

#### `listarDoColaborador(colaboradorId)`
Histórico de rodadas (mais recentes primeiro), com os pontos ordenados por prazo
e o semáforo calculado.

#### `revisarPonto(pontoId, status, autor?, observacao?)`
Marca o ponto como `ATINGIDO`/`NAO_ATINGIDO` com auditoria (quem/quando);
`NotFoundException` se o ponto não existir.

#### `remover(id)`
Remove a rodada e seus pontos em cascata; `NotFoundException` se não existir.

#### `pontosVencidosDoDia(hoje?)`
Pontos `PENDENTE` com prazo vencido (filtrados pela regra pura `pontoVencido`),
com o nome do colaborador — consumido pelo cron de avisos.

#### `destinatariosAcompanhamento()`
Usuários com perfil `SUPERVISOR`/`GERENTE`/`ADMINISTRADOR` (apoio à notificação).

### `FeedforwardAlertasService`
- `verificarPrazos(hoje?)` (`@Cron` 08:00 BRT): busca os pontos vencidos e avisa
  os destinatários com `FEEDFORWARD_VISUALIZAR`; usa um `Set` em memória para não
  duplicar o aviso no mesmo dia; defensivo (falha isolada não derruba os demais).
- `resetarDiario()` (`@Cron` 00:00 BRT): limpa o cache de anti-duplicação.

## 6. Lógica de domínio (funções puras)
- `diffEmDias(de, ate)` → diferença em dias civis (UTC, date-only).
- `situacaoPonto(status, prazo, hoje)` → semáforo: `ATINGIDO`/`NAO_ATINGIDO` se
  já revisado; senão `VENCIDO` (prazo hoje/passado), `PROXIMO` (≤
  `ANTECEDENCIA_ALERTA_DIAS = 3` dias) ou `EM_DIA`.
- `pontoVencido(status, prazo, hoje)` → verdadeiro só para `PENDENTE` com prazo
  hoje ou passado (gatilho do aviso).

## 7. Estados e enums
- `StatusPontoFeedforward`: `PENDENTE` · `ATINGIDO` · `NAO_ATINGIDO` (transição
  `PENDENTE → ATINGIDO/NAO_ATINGIDO` ao revisar).
- `SituacaoPontoFeedforward` (derivada, não persistida): `EM_DIA` · `PROXIMO` ·
  `VENCIDO` · `ATINGIDO` · `NAO_ATINGIDO`.

## 8. Dados que o módulo toca
- **Escreve:** `Feedforward`, `FeedforwardPonto`.
- **Lê:** `Colaborador`, `Usuario`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService`, `ObjectStorage`
  (`OBJECT_STORAGE`), utilitário `primeiroNome` de `fiscais`; `ScheduleModule` (no `AppModule`).
- **É usado por:** o app (aba de Feedforward no perfil do colaborador); o módulo
  **exporta** `FeedforwardService`.

## 10. Regras de negócio-chave
1. **Feedforward é prospectivo** (pontos a melhorar com prazo), não punitivo.
2. **Semáforo pelo prazo:** pendente vira `PROXIMO` a ≤ 3 dias e `VENCIDO` no dia/depois.
3. **Ponto revisado sai do semáforo de prazo** (reflete o status atingido/não).
4. **Só a rodada de colaborador existente** é criada (evita rodadas órfãs).
5. **Aviso diário de prazo vencido** à liderança, sem duplicar no mesmo dia e sem
   derrubar o processo em caso de falha.
6. **Foto só aceita imagem** (validação de mimetype no upload).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `feedforward.domain.spec.ts` | Semáforo (`situacaoPonto`) e gatilho de aviso (`pontoVencido`) | 7 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ O anti-duplicação de avisos é um `Set` **em memória** (resetado à
  meia-noite): em múltiplas instâncias, cada uma teria seu próprio cache.
- 🔧 `destinatariosAcompanhamento()` (perfis SUPERVISOR/GERENTE/ADMINISTRADOR)
  coexiste com o alerta que usa `destinatariosComPermissao('FEEDFORWARD_VISUALIZAR')`;
  vale unificar o critério de destinatário conforme evoluir.
- 🔧 Só o domínio (semáforo) tem testes; o serviço e o cron dependem de
  verificação por integração.
