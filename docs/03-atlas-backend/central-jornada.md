> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/central-jornada/`

# Módulo: `central-jornada`

## 1. Propósito
Portal gerencial que consolida a jornada de cada colaborador no ciclo de folha
(26→25): carga trabalhada, horas extras 50%/100%, horas devidas, atestados,
faltas, dias de TAC, conflitos, atrasos e o saldo (banco de horas).

## 2. Responsabilidades e limites
- **Faz:** agrega dia a dia as batidas do Relógio Ponto por pessoa no ciclo;
  calcula totais e saldo (individual e do time); monta o resumo, o detalhe por
  pessoa (drill-down), o painel de inconsistências, a exportação para revisão e
  o comparativo entre ciclos; marca/desmarca uma falta como débito de horas.
- **Não faz** (fica em outro módulo): registrar/corrigir batidas e o cálculo do
  dia (fica em [`ponto`](ponto.md), cujo `calcularJornadaDia` é reaproveitado);
  fechar/reabrir o ciclo (fica em [`ciclo-folha`](ciclo-folha.md)); as regras de
  cada contrato (fica em [`tipos-contrato`](tipos-contrato.md)); feriados e
  rodízio de domingo (ficam em `feriados`/`escala-domingo`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `central-jornada.controller.ts` | Rotas HTTP do portal | 77 |
| `central-jornada.service.ts` | Regras de aplicação: carga do ciclo, cálculo e agregação | 1086 |
| `central-jornada.module.ts` | Ligações (DI) do módulo | 25 |
| `dto/central-jornada.dto.ts` | Validação de entrada (marcar débito) | 7 |

> Não há arquivo `*.domain.ts` próprio: a única função pura do módulo
> (`contribuicaoSaldoTime`) vive no service; a matemática do dia é reusada de
> [`ponto`](ponto.md).

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `central-jornada`](../05-referencia-dados/api-http.md#central-jornada). Aqui explicamos o que cada rota faz. Todo o controller exige `CENTRAL_JORNADA`.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /central-jornada` | `CENTRAL_JORNADA` | Resumo do ciclo: por pessoa + totais do time (`ciclo` 0 atual, −1...). |
| `GET /central-jornada/inconsistencias` | `CENTRAL_JORNADA` | Painel de problemas (incompletas, duplicadas, conflitos, atrasos, TAC). |
| `GET /central-jornada/exportacao` | `CENTRAL_JORNADA` | Dados do ciclo para revisão antes do fechamento (uma linha por dia relevante). |
| `GET /central-jornada/comparativos` | `CENTRAL_JORNADA` | Totais do time dos últimos `qtd` ciclos (1..12). |
| `GET /central-jornada/pessoa/:id` | `CENTRAL_JORNADA` | Detalhe diário de um colaborador no ciclo (drill-down). |
| `POST /central-jornada/ausencia/:id/debito` | `CENTRAL_JORNADA` | Marca/desmarca uma falta como débito de horas. |

## 5. Serviços e funções

### `CentralJornadaService`

#### `resumoCiclo(deslocamento = 0)`
- **Recebe:** deslocamento do ciclo (0 atual, negativo anterior).
- **Devolve:** `CentralResumo` (por pessoa + totais).
- **Efeitos:** carrega pessoas, batidas, ausências, feriados e âncora de
  domingo do período; calcula só os totais de cada colaborador (sem montar o
  detalhe diário, por desempenho); agrega o saldo do time por `contribuicaoSaldoTime`.

#### `detalhePessoa(colaboradorId, deslocamento = 0)`
Carrega **só** os dados daquela pessoa (não o ciclo inteiro) e devolve o detalhe
diário — o drill-down abre rápido mesmo com muitos colaboradores.

#### `inconsistenciasCiclo(deslocamento = 0)`
Varre o dia a dia de cada pessoa e devolve a lista achatada dos problemas:
`INCOMPLETA`, `DUPLICADA`, `CONFLITO_AUSENCIA`, `ATRASO`, `TAC`.

#### `exportarCiclo(deslocamento = 0)`
Uma linha por dia relevante (trabalho/incompleta/falta/atestado) com trabalhado,
base, extras, devidas, atestado, TAC e as inconsistências — mais os totais.

#### `comparativos(qtd = 6)`
Chama `resumoCiclo` para os últimos `qtd` (1..12) ciclos e devolve os totais em
ordem cronológica.

#### `marcarDebito(ausenciaId, debito)`
- **Efeitos:** alterna `debitoHoras` de uma ausência; bloqueia se o ciclo do dia
  estiver fechado.
- **Erros:** `NotFoundException` (falta não encontrada), `CicloFechadoError`.

#### `calcularPessoa(...)` (privado, coração do módulo)
Agrupa batidas/ausências por dia e, para cada dia do ciclo, decide o tipo
(`TRABALHO`/`INCOMPLETO`/`FALTA`/`FALTA_DEBITO`/`ATESTADO`/`SEM_REGISTRO`),
delega o cálculo a `calcularJornadaDia`, acumula extras, devidas (só em dias
completos), atestados, faltas, TAC, conflitos e atrasos.

## 6. Lógica de domínio (funções puras)
- `contribuicaoSaldoTime({extras50Ms, extras100Ms, horasDevidasMs})` →
  contribuição de uma pessoa ao **saldo do time**: as 50% entram só se
  positivas após o débito (o débito consome apenas as 50%); as 100% entram
  sempre. O saldo **individual** do card segue 50% + 100% − devidas (pode ficar
  negativo).
- `extras50AtualMs = max(0, extras50Ms − horasDevidasMs)` (por pessoa) → as
  **horas 50% REAIS disponíveis agora**: o bruto acumulado no ciclo menos o que
  a pessoa deve (o débito/déficit consome só as 50%), com piso 0. É o número
  exibido na tela (total do time e chip da pessoa); o `extras50Ms` bruto
  continua disponível para a exportação/folha.
- Demais cálculos do dia são reusados de [`ponto`](ponto.md) (`calcularJornadaDia`)
  e de `escala-domingo` (`entradaEsperadaNoDia`, `minutosDeAtraso`).

## 7. Estados e enums
- `CentralDiaDetalhe.tipo`: `TRABALHO` · `INCOMPLETO` · `FALTA` · `FALTA_DEBITO`
  · `ATESTADO` · `SEM_REGISTRO`.
- `InconsistenciaItem.tipo`: `INCOMPLETA` · `DUPLICADA` · `CONFLITO_AUSENCIA` ·
  `ATRASO` · `TAC`.
- `StatusJornadaPonto` (reusado de [`ponto`](ponto.md)).
- Não há máquina de estados própria (o módulo é de leitura/agregação, exceto o
  débito da falta).

## 8. Dados que o módulo toca
- **Lê:** `Colaborador` (todos os tipos de contrato), `BatidaPonto`,
  `Ausencia`, `Fiscal`, `Usuario`, feriados e âncora de domingo (via serviços).
- **Escreve:** `Ausencia.debitoHoras` (marcar débito).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `FeriadosService`, e (opcionais)
  `EscalaDomingoService`, `CicloFolhaService`, `TiposContratoService`; reusa o
  domínio de [`ponto`](ponto.md) e o helper `mapearFiscalColaborador`.
- **É usado por:** o app (portal gerencial da jornada) e a exportação do ciclo.

## 10. Regras de negócio-chave
1. **Ciclo de folha 26→25** como janela de apuração (deslocamento 0 = atual).
2. **Fiscal bate ponto pela identidade `Fiscal.id`** (≠ id da ficha): o vínculo
   por conta/matrícula atribui a jornada à ficha, senão o fiscal sumiria.
3. **Horas devidas só contam em dias completos** (o dia em andamento não gera
   déficit).
4. **Conflito ponto↔ausência**: as horas vêm das batidas (a ausência é
   ignorada no cálculo) e o conflito fica sinalizado para o gestor resolver.
5. **Saldo do time ≠ saldo individual**: o débito consome só as 50%; as 100%
   nunca são debitadas. Pela mesma regra, as **"Extras 50%" exibidas** (total do
   time e chip da pessoa) são as 50% REAIS (`extras50AtualMs` = bruto − o que
   deve, piso 0), não o bruto acumulado no mês.
6. **Lista todas as fichas não-gerentes** (operador/supervisor/fiscal), mesmo
   zeradas, em ordem alfabética.
7. **Marcar débito respeita o ciclo fechado**.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `central-jornada.service.spec.ts` | Resumo, inconsistências, exportação e 50% reais (líquido do débito) | 13 |
| `saldo-time.spec.ts` | Regra do saldo do time (`contribuicaoSaldoTime`) | 4 |
| `central-jornada.controller.spec.ts` | Permissão do débito de horas | 1 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `central-jornada.service.ts` (1086 linhas) concentra carga, cálculo e
  agregação; os tipos de resposta (`Central*`) e o cálculo diário podem ser
  extraídos conforme crescer.
- ✅ Inclui **todos os tipos de contrato** (Fase 2 do spec
  `solidez-contratos-jornada`): o filtro fixo por `tipoContrato` foi removido e as
  regras de jornada/TAC são resolvidas **por pessoa** via
  `regrasDe(tipoContratoJornadaId)`.
- 🔧 O comparativo (`comparativos`) recalcula cada ciclo sob demanda (N
  `resumoCiclo`); se a base crescer muito, pode valer cache/snapshot.
