> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/incidencias/`

# Módulo: `incidencias`

## 1. Propósito
Registra as **incidências de escala** de um colaborador (não-retorno do
intervalo, atraso, saída antecipada, retorno tardio, advertência e suspensão) em
uma **tabela genérica por `tipo`**, além de auto-detectar não-retornos a partir
do ponto dos fiscais e gerar analítica, ranking e o panorama de sanções.

## 2. Responsabilidades e limites
- **Faz:** CRUD de incidências por colaborador+tipo+data (com unicidade);
  justificativa/abono posterior; auto-detecção do "não retorno do intervalo" a
  partir do ponto; ranking por colaborador; panorama de sanções (disciplina
  progressiva); resumo analítico e soma ponderada consumidos pelo perfil; avisos
  aos gestores/operação.
- **Não faz** (fica em outro módulo): apuração de ponto/jornada (fica em
  [`ponto`](ponto.md)/[`central-jornada`](central-jornada.md)); o fluxo de
  aprovação de sanções (fica em [`advertencias`](advertencias.md)); cadastro do
  colaborador/fiscal (fica em [`colaboradores`](colaboradores.md)/[`fiscais`](fiscais.md));
  o cálculo do score em si (fica no perfil, que consome este módulo).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `incidencias.controller.ts` | Rotas HTTP (registrar/editar/justificar/remover/listar/sugestões/ranking/sanções) | 122 |
| `incidencias.service.ts` | Regras de aplicação, persistência (Prisma) e avisos | 806 |
| `incidencias.domain.ts` | Regras puras: metadados de tipo, detecção, analítica, sanções | 648 |
| `incidencias.errors.ts` | Erros de domínio (mapeados para HTTP) | 56 |
| `incidencias.module.ts` | Ligações (DI); exporta o serviço | 23 |
| `dto/incidencias.dto.ts` | Validação de entrada das rotas | 171 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `incidencias`](../05-referencia-dados/api-http.md#incidencias).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /escala/incidencias` | `OPERADORES_AUSENCIAS` | Registra uma incidência (colaborador+tipo+data). |
| `PATCH /escala/incidencias/:id` | `OPERADORES_AUSENCIAS` | Edita os campos editáveis (404 se não existir). |
| `PATCH /escala/incidencias/:id/justificativa` | `OPERADORES_AUSENCIAS` | Justifica/reabre/injustifica (abono posterior). |
| `DELETE /escala/incidencias/:id` | `OPERADORES_AUSENCIAS` | Remove a incidência (204; 404 se não existir). |
| `GET /escala/incidencias` | `ESCALA_VISUALIZAR` | Lista por filtros, mais recentes primeiro. |
| `GET /escala/incidencias/sugestoes` | `ESCALA_VISUALIZAR` | Candidatos auto-detectados do ponto (`?data=`). |
| `GET /escala/incidencias/ranking` | `ESCALA_VISUALIZAR` | Ranking por colaborador na janela (`?inicio=&fim=`). |
| `GET /escala/incidencias/sancoes` | `ESCALA_VISUALIZAR` | Panorama de sanções na janela (`?inicio=&fim=`). |

## 5. Serviços e funções

### `IncidenciasService`

#### `registrar(dto, autor)`
- **Recebe:** dados da incidência (colaborador, tipo, data, horários/motivo) e o autor autenticado.
- **Devolve:** a `IncidenciaEscala` criada.
- **Efeitos:** valida data permitida (via `ValidacaoDataService`); verifica que o
  colaborador existe; resolve o `funcionarioId` **apenas quando o colaborador é
  FISCAL** (para operador é sempre `null`, então pula a varredura de
  fiscais/usuários/colaboradores); deriva o horário esperado de retorno quando
  há saída; grava suspensão com período (`dataFim`); checa o limite mensal e,
  para não-retorno, avisa toda a operação.
- **Erros possíveis:** `DadosIncidenciaInvalidosError` (data/motivo de sanção),
  `ColaboradorIncidenciaInvalidoError`, `IncidenciaDuplicadaError` (P2002 → 409).

#### `editar(id, dto)` / `remover(id)`
Atualizam ou removem uma incidência; ambos lançam `IncidenciaNaoEncontradaError`
(404) quando o id não existe. Editar preserva os valores atuais dos campos não enviados.

#### `justificar(id, input, autor?)`
- **Efeitos:** grava `statusJustificativa`, motivo/observação e a auditoria
  (quem/quando); reabrir (`PENDENTE`) limpa motivo/auditoria.
- **Regras aplicadas:** `JUSTIFICADA` exige motivo (`motivoObrigatorio`); reduz o
  peso no score conforme o motivo (ADR 0009).
- **Erros possíveis:** `IncidenciaNaoEncontradaError`, `DadosIncidenciaInvalidosError`.

#### `listar(filtros)`
Lista por `colaboradorId`/`tipo`/janela, ordenado por data desc, limitado a
`LIMITE_LISTAGEM` (500).

#### `sugestoes(data?)`
Monta o log de transições de ponto de cada fiscal (em HH:mm de Brasília), aplica
`detectarNaoRetorno` com o intervalo da escala e devolve os candidatos que ainda
não têm incidência registrada, ordenados por nome.

#### `ranking(inicio, fim, tipo?)`
Agrega por colaborador na janela (tipo opcional), resolve o nome e ordena via
`rankingIncidencias`.

#### `panoramaSancoes(inicio, fim, hoje?)`
Consulta sanções do período e do período anterior de mesmo tamanho e as
suspensões ativas hoje; delega a agregação a `resumirSancoes`.

#### `resumoDoColaborador(colaboradorId, hoje?)`
Analítica dos ~6 meses (`analisarIncidencias`) + linha do tempo unificada
(faltas + incidências). Consumido pelo perfil.

#### `contarIncidenciasPonderadas(...)` / `naoRetornosDoPeriodo(...)`
Somas ponderadas por justificativa (ADR 0009): a primeira cobre todos os tipos
disciplinares; a segunda foca no não-retorno e devolve também os não justificados
(que bloqueiam medalhas).

## 6. Lógica de domínio (funções puras)
- `derivarHoraEsperadaRetorno(horaSaida, intervaloMin)` → saída + intervalo,
  limitado a "23:59"; "" se a entrada é inválida.
- `detectarNaoRetorno(transicoes, intervaloMin)` → acha o `INTERVALO` sem
  `DISPONIVEL` antes do próximo `FORA_EXPEDIENTE`; `null` se `intervaloMin <= 0`.
- `analisarIncidencias(incidencias, diasEscalados, hoje)` → total, partição por
  tipo/dia da semana, taxa (0–100%), reincidência, maior sequência, tendência e risco.
- `timelineUnificada(ausencias, incidencias)` → linha do tempo decrescente,
  preservando a contagem total.
- `rankingIncidencias(...)` → ordena por total desc, desempate por nome.
- `sugerirProximoPasso(advertencias, suspensoes)` → disciplina progressiva
  (advertência → suspensão → avaliar desligamento).
- `resumirSancoes(atuais, anteriores, suspensoesAtivas, hoje)` → totais,
  tendência vs. período anterior, suspensos hoje e panorama por colaborador.
- Metadados: `META_TIPO_INCIDENCIA`, `TIPOS_DISCIPLINARES`, `TIPOS_PERFIL`,
  `TIPOS_SANCAO`, `rotuloTipoIncidencia`.

## 7. Estados e enums
- `TipoIncidencia`: `NAO_RETORNO_INTERVALO` · `ATRASO` · `SAIDA_ANTECIPADA` ·
  `RETORNO_TARDIO` · `ADVERTENCIA` · `SUSPENSAO` (atraso/saída/retorno tardio são **legado**).
- `LocalRegistro`: `ESCALA` · `PERFIL` · `null` (legado).
- `StatusJustificativa`: `PENDENTE` · `JUSTIFICADA` · `INJUSTIFICADA` (transição
  `PENDENTE ↔ JUSTIFICADA/INJUSTIFICADA`; reabrir volta a `PENDENTE`).
- `RiscoIncidencia`: `BAIXO`/`MEDIO`/`ALTO`; `TendenciaIncidencia`:
  `MELHORANDO`/`ESTAVEL`/`PIORANDO`; `ProximoPassoDisciplinar`:
  `ADVERTENCIA`/`SUSPENSAO`/`AVALIAR_DESLIGAMENTO`.

## 8. Dados que o módulo toca
- **Escreve:** `IncidenciaEscala`.
- **Lê:** `Colaborador`, `Fiscal`, `Usuario`, `RegistroPontoFiscal`,
  `EscalaEntry`, `Ausencia`, `ConfigSistema` (via `ValidacaoDataService`).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (opcional),
  `ValidacaoDataService` (opcional), utilitários de `fiscais` (`mapearFiscalColaborador`,
  `primeiroNome`) e `common/justificativas`.
- **É usado por:** `ColaboradoresModule` (perfil consome resumo e somas
  ponderadas); o módulo **exporta** `IncidenciasService`.

## 10. Regras de negócio-chave
1. **Unicidade colaborador+tipo+data** (duplicata → 409).
2. **Tabela genérica por `tipo`** (ADR 0007): novos eventos entram sem tabelas novas.
3. **Só o não-retorno do intervalo é auto-detectável** do ponto; os demais são manuais.
4. **Sanção (advertência/suspensão) exige motivo**; suspensão guarda período (`dataFim`).
5. **Justificativa reduz o peso no score** conforme o motivo (ADR 0009).
6. **Data não pode ser anterior à Data_Inicial_Sistema**.
7. **Aviso ao cruzar o limite mensal** (`LIMITE_ALERTA_MES = 3`) e aviso imediato
   a toda a operação no não-retorno; avisos são best-effort (nunca bloqueiam o registro).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `incidencias.service.spec.ts` | Registro/duplicata/derivação/sugestão, `funcionarioId` só p/ fiscal e somas ponderadas | 12 |
| `incidencias.properties.spec.ts` | Propriedades: horário, detecção, analítica e timeline (property-based) | 6 |
| `incidencias.sancoes.spec.ts` | Disciplina progressiva e panorama de sanções | 7 |
| `incidencias.tipos.spec.ts` | Metadados de tipo (partições, disciplinares, legado) | 7 |
| `incidencias.justificativa.spec.ts` | Justificativa/abono e soma ponderada | 4 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `incidencias.service.ts` (806 linhas) concentra persistência, auto-detecção,
  analítica e avisos; candidato a extrair sub-serviços conforme crescer.
- ⚠️ `colaboradorId` é um `String` sem FK; o serviço valida a existência antes de
  persistir para não criar incidências órfãs (que contaminariam ranking/perfil).
- 🔧 Tipos legados (`ATRASO`/`SAIDA_ANTECIPADA`/`RETORNO_TARDIO`) permanecem no
  enum apenas por histórico; não são mais oferecidos para registro.
