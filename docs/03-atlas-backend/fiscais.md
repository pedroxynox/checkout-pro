> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/fiscais/`

# Módulo: `fiscais`

## 1. Propósito
Controle de jornada dos fiscais: os três estados (Disponível / Intervalo / Fora
de expediente), o painel em tempo real, o log de jornada (tempos e horas extras),
os alertas automáticos e a **escala de trabalho** (geral e horário especial).

## 2. Responsabilidades e limites
- **Faz:** registra o status do fiscal (ponto) e calcula a jornada do dia;
  painel em tempo real (WebSocket); log de jornada, jornada de equipe, horas
  extras do mês, ranking e previsão; falta e folga do dia; alertas automáticos
  (intervalo longo, cobertura, lembretes de horário); escala geral, horário
  especial, escala efetiva e consolidada; vínculo Fiscal → Colaborador.
- **Não faz:** autenticação/permissões (fica em [`acessos`](acessos.md)); o
  registro das batidas do Relógio de Ponto (fica em [`ponto`](ponto.md), que
  alimenta o log via ponte); o portal gerencial do ciclo de folha (fica em
  [`central-jornada`](central-jornada.md)); o rodízio de domingo (fica em
  [`escala-domingo`](escala-domingo.md)); o cadastro das pessoas (fica em
  [`colaboradores`](colaboradores.md), a fonte única da escala — Opção A).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `fiscais.controller.ts` | Rotas de status/jornada/painel do fiscal | 134 |
| `fiscais.service.ts` | Regras de aplicação: status, jornada, extras, painel | 1535 |
| `fiscais.domain.ts` | Regras puras: status atual, jornada, transições | 150 |
| `fiscais.errors.ts` | Erros de domínio (mapeados para HTTP) | 47 |
| `fiscais.eventos.ts` | Barramento de eventos de status (produtor↔gateway) | 38 |
| `fiscais.gateway.ts` | Gateway WebSocket do painel em tempo real | 92 |
| `fiscais-horario.service.ts` | Cron: lembretes de horário aos fiscais | 118 |
| `fiscais-alertas.service.ts` | Cron: alertas de intervalo longo e cobertura | 416 |
| `escala.controller.ts` | Rotas da escala de trabalho | 64 |
| `escala.service.ts` | Regras da escala (geral, especial, consolidada) | 276 |
| `escala.domain.ts` | Regras puras: escala efetiva, consolidada, semanal | 166 |
| `colaborador-vinculo.ts` | Regra pura: mapeia fiscal → colaborador (ficha) | 84 |
| `dto/fiscais.dto.ts` | Validação de entrada (status e escala) | 59 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `fiscais`](../05-referencia-dados/api-http.md).
> As rotas de escala (`/escala/*`) e as de fiscais (`/fiscais/*`) fazem parte
> deste módulo.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /escala` | `ESCALA_EDITAR` | Cadastra a escala geral de um funcionário num dia. |
| `POST /escala/:funcionarioId/especial` | `ESCALA_EDITAR` | Define horário especial que prevalece sobre a geral. |
| `GET /escala/consolidada/:diaSemana` | `ESCALA_VISUALIZAR` | Escala consolidada do dia (domingo vem do rodízio). |
| `GET /escala/:funcionarioId/efetiva` | `ESCALA_VISUALIZAR` | Escala efetiva do funcionário no dia. |
| `GET /fiscais/painel` | `FISCAIS_STATUS` | Painel de todos os fiscais com o status atual. |
| `GET /fiscais/eu` | — (autenticado) | Resumo do próprio fiscal (status + jornada); null se não for fiscal. |
| `POST /fiscais/eu/status` | — (autenticado) | O fiscal define o próprio status (auto-identificado). |
| `POST /fiscais/eu/falta` | — (autenticado) | O fiscal informa a própria falta do dia. |
| `GET /fiscais/jornada` | `FISCAIS_JORNADA` | Log de jornada do dia (tempos por fiscal). |
| `GET /fiscais/equipe-dia` | `FISCAIS_JORNADA` | Jornada de equipe: todos os escalados, com atraso/falta. |
| `GET /fiscais/horas-extras-mes` | `FISCAIS_JORNADA` | Acumulado de horas extras do mês, por fiscal. |
| `GET /fiscais/folga-hoje` | `FISCAIS_STATUS` | Fiscais de folga hoje. |
| `GET /fiscais/eu/historico-semanal` | — (autenticado) | Histórico dos últimos 7 dias do próprio fiscal. |
| `GET /fiscais/ranking-mes` | `FISCAIS_JORNADA` | Ranking de pontualidade do mês. |
| `GET /fiscais/previsao-extras` | `FISCAIS_JORNADA` | Previsão de horas extras do mês. |
| `GET /fiscais/contexto-escala` | — (autenticado) | Contexto de escala formatado (integração Cluby). |

## 5. Serviços e funções

### `FiscaisService`

#### `definirStatus(fiscalId, status, em?)`
- **Efeitos:** valida data permitida; bloqueia se o fiscal está de folga
  (`FiscalDeFolgaError`) ou já marcou falta (`FaltaRegistradaError`); cria o
  `RegistroPontoFiscal` (dia civil de Brasília); **publica o evento** em tempo
  real; notifica os gestores na transição relevante; recalcula a jornada.

#### `meuFiscal(usuarioId)` / `meuResumo(usuarioId)`
`meuFiscal` resolve o `Fiscal` do usuário logado (`FiscalNaoEncontradoError`).
`meuResumo` devolve status + jornada + `faltaHoje`/`folgaHoje`; `null` se o
usuário não for fiscal (ex.: gerente só visualizando).

#### `registrarFalta(fiscalId)`
Registra a falta do dia do próprio fiscal; bloqueia se já iniciou jornada
(`JaIniciouJornadaError`) ou está de folga (`FiscalDeFolgaError`).

#### `painel()`
Status atual de todos os fiscais, usando a mesma inteligência da jornada
(prefere as batidas do Relógio de Ponto e aplica as regras de contrato),
refletindo o fim do expediente mesmo sem batida de encerramento.

#### `jornadaDoDia(dia)` / `equipeDoDia(dia)` / `horasExtrasMes(mes?)`
Log de tempos por fiscal; jornada de equipe (todos os escalados, com atraso e
falta); e o acumulado de horas extras do mês (extra 50% em dias comuns e 100%
aos domingos).

#### `folgaHoje()` · `historicoSemanal(usuarioId)` · `rankingMes()` · `previsaoExtras()` · `contextoEscala()`
Consultas de apoio: quem está de folga hoje; histórico de 7 dias do próprio
fiscal; ranking de pontualidade; previsão de extras; e o texto de contexto para
integração com o Cluby.

#### `reescreverRegistrosDoDia(cliente, ...)` / `publicarStatusDoDia(...)`
Ponte batidas → status: reescreve o log do dia dentro da transação das batidas
(atômico) e propaga o status por WebSocket **após o commit**.

### `EscalaService`
- `cadastrarEscala(entry)` / `definirHorarioEspecial(funcionarioId, entry)` —
  escala geral e horário especial (que prevalece).
- `resolverEscalaEfetiva(funcionarioId, diaSemana)` — a escala aplicável no dia.
- `escalaConsolidada(diaSemana, dataISO?)` — consolidação por dia; no domingo,
  os fiscais vêm do rodízio de grupos.

### Serviços de infraestrutura
- `FiscalStatusEventos` — barramento (RxJS) que desacopla o serviço do gateway.
- `FiscaisGateway` — WebSocket autenticado por JWT; faz broadcast das transições.
- `FiscaisHorarioService` / `FiscaisAlertasService` — crons (fuso de Brasília)
  de lembretes de horário, intervalo longo e cobertura.

## 6. Lógica de domínio (funções puras)
- `statusValido(v)` / `primeiroNome(nome)` — validação e exibição.
- `statusAtual(registros)` → status do registro de maior instante (ou null).
- `mensagemTransicao(nome, anterior, novo)` → texto ao gestor na mudança (null
  se não muda).
- `calcularJornada(registros, agora, diaEncerrado?)` → tempo trabalhando/
  intervalo e carga horária; num dia encerrado, não estende o último segmento.
- `jornadaEsperadaMs(diaSemana)` / `isDomingo(diaSemana)` → base de horas extras.
- Escala: `resolverEscalaEfetiva`, `escalaConsolidada`, `gerarEscalaSemanalFiscal`,
  `temEscalaDefinida` (o cadastro é a fonte única — Opção A).
- `mapearFiscalColaborador(...)` → une o fiscal à ficha do colaborador por conta
  de acesso ou, em fallback, por matrícula.

## 7. Estados e enums
- `StatusFiscal`: `DISPONIVEL` · `INTERVALO` · `FORA_EXPEDIENTE`. O status atual
  é sempre o da última transição; toda mudança gera aviso ao gestor.
- `EscalaEfetiva`: uma `EscalaEntry` aplicável **ou** `'FOLGA'`.
- Jornada esperada: Seg–Qui 7h, Sex–Sáb 8h, Dom 7h20 (o excedente é hora extra).

## 8. Dados que o módulo toca
- **Escreve:** `RegistroPontoFiscal` (log de status), `EscalaEntry` (escala
  geral/especial), `Ausencia` (falta do fiscal).
- **Lê:** `Fiscal`, `Usuario`, `Colaborador` (vínculo/nome), `EscalaEntry`,
  `Ausencia`, contratos e feriados (regras de jornada/extras).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService`, `JwtService` (gateway),
  `DataInicialModule`, `EscalaDomingoModule`, `FeriadosModule`,
  `CicloFolhaModule`, `TiposContratoModule`.
- **É usado por:** o app (painel de fiscais, jornada, escala), e é fonte para
  [`central-jornada`](central-jornada.md) e o Perfil Inteligente.

## 10. Regras de negócio-chave
1. **Três estados de jornada**; o status atual é o da última transição.
2. **De folga ou com falta não bate ponto**; com jornada iniciada não marca
   falta (erros de conflito 409).
3. **Dia civil de Brasília (UTC-3)** para não gravar/ler no dia UTC seguinte à
   noite.
4. **Toda transição notifica os gestores** e é propagada em tempo real.
5. **Horas extras:** 50% em dias comuns, 100% aos domingos, sobre a jornada
   esperada do dia.
6. **Horário especial prevalece** sobre a escala geral (escala efetiva).
7. **O cadastro é a fonte única da escala** (Opção A); no domingo a escala dos
   fiscais vem do rodízio de grupos.
8. **Ponte batidas → status é atômica**; o tempo real só é anunciado após o
   commit.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `fiscais.service.spec.ts` | Status, painel, jornada e fiscal histórico | 14 |
| `fiscais.properties.spec.ts` | Status atual, transição, jornada, escala (property-based) | 5 |
| `fiscais.controller.spec.ts` | Rotas do próprio fiscal e log de jornada | 4 |
| `fiscais.gateway.spec.ts` | Broadcast do painel via WebSocket (integração) | 3 |
| `fiscais.painel-status.spec.ts` | Status do painel a partir das batidas | 2 |
| `fiscais-alertas.intervalo.spec.ts` | Alerta de intervalo longo | 2 |
| `jornada-marcacoes.spec.ts` | Jornada a partir das marcações do dia | 2 |
| `escala-colaborador.spec.ts` | Geração da escala semanal a partir do cadastro | 4 |
| `escala-inativo.spec.ts` | Escala de colaborador inativo | 1 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `fiscais.service.ts` (1535 linhas) concentra status, painel, jornada,
  extras, ranking e contexto — forte candidato a extrair sub-serviços.
- ⚠️ **Coexistência de logs:** o status vem das batidas do Relógio de Ponto com
  fallback ao log legado (`RegistroPontoFiscal`); manter a ponte consistente é
  crítico para o painel não divergir.
- ⚠️ **Fuso de Brasília em toda parte:** cálculos e crons dependem do dia civil
  UTC-3; qualquer novo caminho precisa usar os helpers de `common/datas` para
  não gravar no dia errado.
- 🔧 **Modelos em transição:** `Fiscal` convive com o Cadastro Unificado de
  colaboradores — ver [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md).
