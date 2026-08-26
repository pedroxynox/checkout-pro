> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** `backend/src/central-jornada/`

# Módulo: `central-jornada`

## 1. Propósito
Portal gerencial que consolida a jornada de cada colaborador no ciclo de folha
(26→25): carga trabalhada, horas extras 50%/100%, horas devidas, atestados,
faltas, dias de TAC, conflitos, atrasos e o saldo (banco de horas).

## 2. Responsabilidades e limites
- **Faz:** agrega dia a dia as batidas do Relógio Ponto por pessoa no ciclo;
  calcula totais e saldo (individual e do time); monta o resumo, o detalhe por
  pessoa (drill-down), o painel de inconsistências, o **relatório de marcações
  inválidas** (quantas marcações faltam em cada dia e quais), a **base dos
  rankings do time** (resumo por pessoa + detalhe dos dias de falta, atestado,
  atraso, TAC e conflito), a exportação para revisão e o comparativo entre
  ciclos; marca/desmarca uma falta como débito de horas.
- **Não faz** (fica em outro módulo): registrar/corrigir batidas e o cálculo do
  dia (fica em [`ponto`](ponto.md), cujo `calcularJornadaDia` é reaproveitado);
  fechar/reabrir o ciclo (fica em [`ciclo-folha`](ciclo-folha.md)); as regras de
  cada contrato (fica em [`tipos-contrato`](tipos-contrato.md)); feriados e
  rodízio de domingo (ficam em `feriados`/`escala-domingo`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `central-jornada.controller.ts` | Rotas HTTP do portal | 100 |
| `central-jornada.service.ts` | Regras de aplicação: carga do ciclo, cálculo e agregação | 1794 |
| `central-jornada.module.ts` | Ligações (DI) do módulo | 25 |
| `dto/central-jornada.dto.ts` | Validação de entrada (marcar débito) | 7 |

> Não há arquivo `*.domain.ts` próprio: a única função pura do módulo
> (`contribuicaoSaldoTime`) vive no service; a matemática do dia é reusada de
> [`ponto`](ponto.md) — inclusive a análise das marcações faltantes
> (`marcacoes-invalidas.domain.ts`), que pertence ao módulo do Relógio Ponto
> porque é sobre as batidas, não sobre o ciclo.

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `central-jornada`](../05-referencia-dados/api-http.md#central-jornada). Aqui explicamos o que cada rota faz. Todo o controller exige `CENTRAL_JORNADA`.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /central-jornada` | `CENTRAL_JORNADA` | Resumo do ciclo: por pessoa + totais do time (`ciclo` 0 atual, −1...). |
| `GET /central-jornada/inconsistencias` | `CENTRAL_JORNADA` | Painel de problemas (incompletas, duplicadas, conflitos, atrasos, TAC). |
| `GET /central-jornada/rankings` | `CENTRAL_JORNADA` | Base dos rankings do time: resumo por pessoa + detalhe dos dias de falta, atraso, TAC e conflito. |
| `GET /central-jornada/marcacoes-invalidas` | `CENTRAL_JORNADA` | Relatório de ajuste do ponto: dia a dia, quantas marcações faltam e **quais**. |
| `GET /central-jornada/exportacao` | `CENTRAL_JORNADA` | Dados do ciclo para revisão antes do fechamento (uma linha por dia relevante). |
| `GET /central-jornada/comparativos` | `CENTRAL_JORNADA` | Totais do time dos últimos `qtd` ciclos (1..12). |
| `GET /central-jornada/pessoa/:id` | `CENTRAL_JORNADA` | Detalhe diário de um colaborador no ciclo (drill-down). |
| `POST /central-jornada/ausencia/:id/debito` | `CENTRAL_JORNADA` | Marca/desmarca uma falta como débito de horas (marcar é recusado em domingo/feriado). |

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

#### `rankingsCiclo(deslocamento = 0)`
- **Devolve:** `CentralRankings` — por pessoa, o **mesmo `CentralPessoaResumo`**
  das cards da Central (`RankingPessoa` o estende) mais o detalhe dia a dia do
  seu ciclo: `faltasDetalhe`, `atestadosDetalhe`, `atrasosDetalhe`, `tacDetalhe`
  e `conflitosDetalhe`. O de atestados vem agrupado **por documento** (regra 12);
  os demais são por dia.
- **Para que serve:** é o que abre ao tocar numa card do "Resumo do time"
  (extras 50%, extras 100%, faltas, atestados, TAC, atrasos ou conflitos).
- **Uma resposta para as sete métricas**, e não um endpoint por métrica, por dois
  motivos: (a) **os números não podem divergir** — o resumo vem de
  `calcularPessoa`, a mesma função que alimenta a Central, então não existe
  segundo cálculo capaz de discordar da card que o usuário acabou de tocar; e
  (b) **uma passada só** pelo ciclo serve as sete telas, com um contrato estável
  (sem união de formatos por métrica).
- **A ordenação é apresentação e fica na tela.** Aqui as pessoas saem em ordem
  alfabética; cada métrica ordena pelo seu campo do maior para o menor.
- **Invariante garantida por teste:** o tamanho de cada lista de detalhe é igual
  ao contador correspondente do resumo (`faltasDetalhe.length === faltas`,
  `atestadosDetalhe.length === atestados` etc.). Se divergissem, o ranking
  mentiria.
- **Faltas e atestados são métricas separadas** (regra 11): `faltasDetalhe` traz
  ausência simples e falta com débito; `atestadosDetalhe` traz **um item por
  atestado** (documento, não dia — regra 12), com o período, os dias e as horas
  abonadas.
- **Extras não têm detalhe por dia** — ali o número é a informação.
- **Não escreve nada:** é leitura.

#### `marcacoesInvalidasCiclo(deslocamento = 0)`
- **Devolve:** `CentralMarcacoesInvalidas` — um item por **dia com marcação
  faltante** (`MarcacaoInvalidaItem`) + totais do ciclo.
- **O que cada item traz:** `quantidadeFaltante` e `tiposFaltantes` (quais
  marcações faltam, na ordem do dia), `tiposPresentes` (como as existentes foram
  interpretadas), `horasRegistradas` (as horas que existem, "HH:mm", para
  conferir o comprovante), `entradaPrevista` (turno da escala), `confianca` +
  `observacao` (quando é hipótese e não fato), `detalhe` (frase pronta) e
  `devidasMs` (as horas devidas que aquele dia lançou).
- **Como decide:** delega cada dia a `analisarMarcacoesDoDia`
  ([`ponto`](ponto.md)), que confronta a 1ª batida com o turno para saber se ela
  pode mesmo ser a entrada. É o que separa este relatório do painel de
  inconsistências: lá, a incompleta traz apenas a frase posicional de
  `calcularJornadaDia`, que **nunca acusa a entrada** esquecida.
- **Quem entra:** só dias `INCOMPLETO`. Dia sem nenhuma batida é falta/folga
  (outro fluxo) e a **jornada curta válida de duas batidas** (até 4h50 em
  contrato sem intervalo obrigatório) é um dia **completo** — incluí-la encheria
  o relatório de falso positivo.
- **Quem NÃO entra:** dias com **não retorno do intervalo** registrado
  (`IncidenciaEscala` de tipo `NAO_RETORNO_INTERVALO`, automática ou manual) —
  ver regra 12. Ficam contados em `totais.naoRetornosExcluidos`.
- **Totais:** `dias`, `pessoas`, `marcacoesFaltantes`, `faltaUma`, `faltamDuas`,
  `faltamTresOuMais`, `aConferir` (confiança baixa), `porTipo` (em quantos dias
  cada marcação falta), `devidasMs` e `naoRetornosExcluidos`.
- **Não escreve nada:** é leitura. O ajuste em si continua sendo
  `PATCH`/`DELETE /ponto/batidas/:id` (`PONTO_EDITAR`).

#### `exportarCiclo(deslocamento = 0)`
Uma linha por dia relevante (trabalho/incompleta/falta/atestado) com trabalhado,
base, extras, devidas, atestado, TAC e as inconsistências — mais os totais.

#### `comparativos(qtd = 6)`
Chama `resumoCiclo` para os últimos `qtd` (1..12) ciclos e devolve os totais em
ordem cronológica.

#### `marcarDebito(ausenciaId, debito)`
- **Efeitos:** alterna `debitoHoras` de uma ausência; bloqueia se o ciclo do dia
  estiver fechado. **Marcar** (`debito = true`) é recusado em domingo e feriado
  (regra 4 — dias que não geram hora devida); **desmarcar** é sempre permitido.
- **Erros:** `NotFoundException` (falta não encontrada), `CicloFechadoError`,
  `BadRequestException` (domingo/feriado não aceita débito).

#### `calcularPessoa(...)` (privado, coração do módulo)
Agrupa batidas/ausências por dia e, para cada dia do ciclo, decide o tipo
(`TRABALHO`/`INCOMPLETO`/`FALTA`/`FALTA_DEBITO`/`ATESTADO`/`SEM_REGISTRO`),
delega o cálculo a `calcularJornadaDia`, acumula extras, devidas (só em dias
completos **e que geram débito** — domingo e feriado nunca geram), atestados,
faltas, TAC, conflitos e atrasos.

## 6. Lógica de domínio (funções puras)
- `agruparAtestados(diasAtestado)` → transforma os DIAS de atestado do ciclo nos
  **atestados** (documentos) que os originaram: por `atestadoId` quando existe, e
  por bloco de dias consecutivos quando o dia foi abonado sem documento. É o que
  faz a card contar 2 atestados onde há 5 dias — ver regra 12.
- `contribuicaoSaldoTime({extras50Ms, extras100Ms, horasDevidasMs})` →
  contribuição de uma pessoa ao **saldo do time**: as 50% entram só se
  positivas após o débito (o débito consome apenas as 50%); as 100% entram
  sempre.
- `saldo50Ms = extras50Ms − horasDevidasMs` (por pessoa) → **saldo das horas
  50%, com sinal** (pode ser negativo). É o número exibido como "saldo 50%" na
  card da pessoa e no detalhe. As 100% ficam de fora de propósito: nunca são
  debitadas e já têm o chip `+100%`. Equivale a
  `extras50AtualMs − horasDevidasAtualMs`, mas **sem o piso 0** dos dois — aqui o
  sinal importa, porque é ele que pinta o valor de verde ou vermelho.
- `saldoMs = extras50Ms + extras100Ms − horasDevidasMs` (por pessoa) → saldo
  geral do banco de horas (as duas moedas somadas). Continua no contrato e na
  exportação, mas **não é mais o número da card**.
- `extras50AtualMs = max(0, extras50Ms − horasDevidasMs)` (por pessoa) → as
  **horas 50% REAIS disponíveis agora**: o bruto acumulado no ciclo menos o que
  a pessoa deve (o débito/déficit consome só as 50%), com piso 0. É o número
  exibido na tela (total do time e chip da pessoa); o `extras50Ms` bruto
  continua disponível para a exportação/folha.
- `horasDevidasAtualMs = max(0, horasDevidasMs − extras50Ms)` (por pessoa) → o
  que a pessoa deve **DE VERDADE** agora, depois de as 50% abaterem o débito. É
  **complementar** a `extras50AtualMs` (no máximo um dos dois é > 0): quem tem
  saldo 50% positivo (mesmo que 9 min) **não deve horas**. É o valor do chip
  "Deve" — antes mostrava o bruto mesmo com 50% positivas.
- `diaPagaAdicional100(diaSemana, ehFeriado, regras)` (de [`ponto`](ponto.md)) →
  decide se o dia é pago com adicional de 100% (domingo e todo feriado) e, pela
  **mesma regra vista do outro lado**, se o dia **gera hora devida**: o déficit
  só é lançado quando o dia NÃO paga 100%.
- Demais cálculos do dia são reusados de [`ponto`](ponto.md) (`calcularJornadaDia`,
  `analisarMarcacoesDoDia`, `descreverFaltantes`, `horaMarcacaoHHmm`) e de
  `escala-domingo` (`entradaEsperadaNoDia`, `minutosDeAtraso`).

## 7. Estados e enums
- `CentralDiaDetalhe.tipo`: `TRABALHO` · `INCOMPLETO` · `FALTA` · `FALTA_DEBITO`
  · `ATESTADO` · `SEM_REGISTRO`.
- `InconsistenciaItem.tipo`: `INCOMPLETA` · `DUPLICADA` · `CONFLITO_AUSENCIA` ·
  `ATRASO` · `TAC`.
- `MarcacaoInvalidaItem.tiposFaltantes[]` / `tiposPresentes[]`:
  `MarcacaoCanonica` (`ENTRADA` · `SAIDA_INTERVALO` · `RETORNO_INTERVALO` ·
  `ENCERRAMENTO`), reusado de [`ponto`](ponto.md).
- `MarcacaoInvalidaItem.confianca`: `ConfiancaAnalise` (`ALTA` · `BAIXA`),
  reusado de [`ponto`](ponto.md).
- `DiaFaltaRanking.tipo`: `FALTA` · `FALTA_DEBITO` (subconjunto de
  `CentralDiaDetalhe.tipo`). O dia de `ATESTADO` **não** entra aqui: vai em
  `AtestadoRanking` (ver regras 11 e 12).
- `StatusJornadaPonto` (reusado de [`ponto`](ponto.md)).
- Não há máquina de estados própria (o módulo é de leitura/agregação, exceto o
  débito da falta).

## 8. Dados que o módulo toca
- **Lê:** `Colaborador` (todos os tipos de contrato), `BatidaPonto`,
  `Ausencia`, `Fiscal`, `Usuario`, `IncidenciaEscala` (só os não-retornos do
  intervalo, no relatório de marcações inválidas), feriados e âncora de domingo
  (via serviços).
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
4. **Domingo e feriado NUNCA geram hora devida** — por nenhum caminho. Esses
   dias pagam a carga efetivamente cumprida: o que passa da carga-base rende
   extra de **100%**, o que fica abaixo dela **não vira débito**. Vale para as
   duas origens de hora devida:
   - **déficit** de um dia trabalhado abaixo da base → não é lançado;
   - **falta marcada como débito** (`Ausencia.debitoHoras`) → não se aplica.
     Faltar num domingo escalado (fora da folga do rodízio) fica apenas como
     **ausente**; `marcarDebito` recusa a marcação com `400` e o cálculo ainda
     neutraliza registros marcados antes desta regra.

   O débito é exclusivo dos demais dias da semana, que seguem a lógica normal
   (extra de 50% acima da base, débito abaixo). Antes desta regra um domingo de
   6h contra a base de 7h20 lançava 1h20 de débito — que, por consumir apenas as
   50% (regra 6), ainda apagava as extras de 50% ganhas nos outros dias.
5. **Conflito ponto↔ausência**: as horas vêm das batidas (a ausência é
   ignorada no cálculo) e o conflito fica sinalizado para o gestor resolver.
6. **O débito consome só as 50%; as 100% nunca são debitadas.** Daí saem os três
   números da tela, todos derivados da mesma regra:
   - **"Extras 50%"** (total do time e chip da pessoa) = `extras50AtualMs`
     (bruto − o que deve, piso 0), não o bruto acumulado no mês;
   - chip **"Deve"** = `horasDevidasAtualMs` (o que deve − 50%, piso 0), então
     quem tem 50% positivas não aparece devendo horas;
   - **"saldo 50%"** da card = `saldo50Ms` (extras 50% − o que deve, **com
     sinal**): só a moeda que o débito consome. As 100% não entram — somá-las
     mascarava o débito (1h de 100% num domingo "pagava" 1h devida na semana,
     que ninguém pode debitar). O `saldoMs` geral (50 + 100 − devidas) segue
     existindo no contrato e na exportação.

   **Saldo do time ≠ saldo da card**: o total do time usa
   `contribuicaoSaldoTime` (50% positivas + 100% sempre), então ele **não** é a
   soma dos saldos das cards — nem antes desta mudança era.
7. **Lista todas as fichas não-gerentes** (operador/supervisor/fiscal), mesmo
   zeradas, em ordem alfabética.
8. **Marcar débito respeita o ciclo fechado** e a regra 4 (domingo/feriado não
   aceitam débito). **Desmarcar é sempre permitido**, inclusive em domingo e
   feriado, para limpar registros marcados antes da regra 4.
9. **O relatório de marcações inválidas identifica a marcação faltante pelo
   turno, e admite quando não sabe.** Ele existe porque o painel de
   inconsistências não serve para *corrigir*: a classificação por ordem encobre
   a **entrada** esquecida e a aponta como "falta o encerramento". Aqui a 1ª
   batida é confrontada com o horário da escala; quando os dados não permitem
   afirmar (sem turno cadastrado, mais de uma faltando com a entrada entre elas,
   ou hipótese derivada das durações), o item vem com `confianca: 'BAIXA'` e o
   motivo em `observacao`, para o gestor conferir o comprovante.
   **Não altera o cálculo das horas** — um dia incompleto continua gerando
   déficit pela regra 3; o relatório apenas expõe esse custo em `devidasMs`, para
   que o ajuste seja priorizado.
12. **Não retorno do intervalo NÃO é marcação inválida.** Quando a pessoa sai
   para o intervalo e não volta, o dia fica sem encerramento — mas não porque
   alguém esqueceu de bater: **ela foi embora**. É uma **incidência de conduta**
   (`IncidenciaEscala` de tipo `NAO_RETORNO_INTERVALO`, registrada pela detecção
   automática ou à mão pelo gestor) e não há batida a "ajustar", então o dia sai
   do relatório de marcações inválidas.

   Sem esta guarda o dia entrava com a leitura **errada**: duas batidas cobrindo
   mais que a jornada sem intervalo eram interpretadas como entrada +
   encerramento, e o relatório pedia para registrar "as duas do intervalo" — que
   nunca existiram.

   O dia **não desaparece em silêncio**: entra em
   `totais.naoRetornosExcluidos`, e a tela explica onde ele é tratado. Um ciclo
   só com não-retornos pareceria limpo, e não está.

   A verdade usada aqui é a **incidência registrada**, não uma inferência sobre
   as batidas — não dá para distinguir "saiu e não voltou" de "trabalhou o dia e
   esqueceu as duas do almoço" olhando só as horas. Como consequência, um dia de
   não retorno **sem** a incidência registrada continua aparecendo como marcação
   faltante; é o comportamento correto, já que sem o registro o sistema não sabe
   o que aconteceu.
13. **Em feriado o atraso É apontado, pelo turno de DOMINGO.** Antes o feriado
   era tratado como "turno ambíguo" e o atraso simplesmente não era calculado no
   dia — o que escondia atraso real. Agora `entradaEsperadaNoDia` recebe
   `ehFeriado` e devolve o horário de domingo da pessoa (regra 7 de
   [`escala-domingo`](escala-domingo.md)); sem `entradaDom` cadastrado, cai no
   horário normal do dia. **A folga não muda**: feriado no dia de folga segue sem
   turno e sem atraso. O pagamento do feriado continua igual (carga de domingo e
   extras a 100%, regra 4).
10. **Ranking e card mostram o mesmo número, por construção.** `RankingPessoa`
   **estende** `CentralPessoaResumo` em vez de recalcular: os valores vêm da
   mesma `calcularPessoa` que alimenta o resumo, e o detalhe de cada métrica é a
   lista dos dias que geraram aquele contador — invariante coberta por teste
   (`faltasDetalhe.length === faltas`, `atestadosDetalhe.length === atestados`
   etc.). É também o que permite abrir o detalhe diário direto do ranking, já que
   a tela de detalhe recebe um `CentralPessoaResumo`.
11. **Atestado NÃO é falta.** Atestado médico é ausência **abonada** e tem
   contador próprio (`atestados`), com o seu detalhe (`atestadosDetalhe`) e a sua
   card no "Resumo do time". Antes o mesmo dia somava em `faltas` **e** em
   `horasAtestadoMs`, então o número de faltas da Central acusava quem havia
   apresentado atestado — exatamente quem estava em ordem.

   O que mudou de valor com esta regra:
   - `faltas` (por pessoa, nos totais do time, na exportação e nos
     `comparativos`) passou a contar **só** ausência simples e falta com débito;
   - `atestados` é novo e conta os dias abonados;
   - `horasAtestadoMs`, `horasDevidasMs` e o saldo **não mudaram** — o atestado
     nunca gerou hora devida.
12. **O contador de atestados é de DOCUMENTOS, não de dias.** Um atestado de 3
   dias conta **1**; um de 3 dias mais um de 2 contam **2**, não 5. É como o RH
   conta, e o número de dias segue disponível (em cada `AtestadoRanking.dias` e,
   em horas, em `horasAtestadoMs`).

   O agrupamento (`agruparAtestados`, função pura exportada) trata as duas
   origens de forma diferente porque a informação disponível é diferente:
   - **com documento** (`Ausencia.atestadoId`): agrupa por id — exato, inclusive
     quando os dias não são contíguos;
   - **sem documento** (`atestadoId` nulo): **LEGADO**. Dias abonados um a um com
     o motivo "atestado médico" antes de esse caminho ser fechado — hoje tanto a
     ausência a prazo quanto a justificativa individual **recusam** esse motivo
     (`AtestadoMedicoViaFluxoProprioError`), então **não nascem mais registros
     assim**. Para os antigos, **dias consecutivos contam como um só**: um bloco
     corrido de dias abonados veio de um mesmo comprovante. **Limite conhecido:**
     dois comprovantes de 1 dia em dias seguidos aparecem como um. O ramo existe
     para não distorcer o histórico — sem ele esses dias voltariam a contar como
     **falta**; para os registros novos a contagem é exata.

   Um atestado que **atravessa o corte 26→25** conta em cada um dos dois ciclos,
   com os dias que lhe cabem em cada um — cada ciclo apura o que aconteceu nele.

   O agrupamento sai de `calcularPessoa` (e não de uma segunda passada sobre os
   dias), então o número da card e o detalhe do ranking vêm do **mesmo**
   agrupamento e não podem divergir.

   Como `comparativos` reusa `resumoCiclo`, os ciclos anteriores também passam a
   ser exibidos pela regra nova (a base não é reprocessada: o número é sempre
   recalculado a partir das ausências).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `central-jornada.service.spec.ts` | Resumo, inconsistências, exportação, 50% reais e `saldo50Ms` (só as 50%, com sinal), domingo/feriado sem hora devida (déficit e falta-débito) e **atraso em feriado pelo turno de domingo** | 23 |
| `marcacoes-invalidas.service.spec.ts` | Relatório de marcações faltantes: entrada esquecida, encerramento, as duas do intervalo, totais, ordenação, sem turno — e os dias que **não** entram (não retorno do intervalo, jornada curta válida, dia completo, dia sem registro) | 12 |
| `rankings.service.spec.ts` | Base dos rankings: **detalhe do mesmo tamanho que o contador** de cada card, faltas sem atestado, atestados à parte (contados por documento), atrasos com minutos e turno, TAC com motivos, conflitos, pessoas zeradas e igualdade com `resumoCiclo` | 10 |
| `agrupar-atestados.spec.ts` | Agrupamento por documento e por bloco de dias consecutivos: 3+2 dias = 2 atestados, dias não contíguos, virada de mês e o total de dias preservado | 12 |
| `saldo-time.spec.ts` | Regra do saldo do time (`contribuicaoSaldoTime`) | 4 |
| `central-jornada.controller.spec.ts` | Permissão do débito de horas e do relatório de marcações inválidas | 2 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `central-jornada.service.ts` (1794 linhas) concentra carga, cálculo e
  agregação; os tipos de resposta (`Central*`) e o cálculo diário podem ser
  extraídos conforme crescer.
- 🔧 **Duas respostas para "o que falta no dia".** O painel de inconsistências
  segue exibindo o `faltando` posicional de `calcularJornadaDia` (texto livre,
  que nunca acusa a entrada), enquanto o relatório de marcações inválidas usa a
  análise nova. Foi uma escolha deliberada: trocar o `faltando` mexeria no
  cálculo da jornada e nos seus testes congelados. Quando as heurísticas da
  análise estiverem validadas na operação, o painel deve passar a consumi-la — aí
  some a duplicidade.
- 🔧 `resumoCiclo`, `inconsistenciasCiclo`, `rankingsCiclo` e
  `marcacoesInvalidasCiclo` percorrem o ciclo de forma independente (cada uma
  chama `calcularPessoa` para todo o time). A tela da Central pede três delas ao
  abrir, então vale unificar a varredura (ou cachear o ciclo por requisição) se o
  tempo de resposta incomodar. Nota: `rankingsCiclo` já devolve tudo o que
  `resumoCiclo` devolve — a longo prazo um pode substituir o outro.
- ✅ Inclui **todos os tipos de contrato** (Fase 2 do spec
  `solidez-contratos-jornada`): o filtro fixo por `tipoContrato` foi removido e as
  regras de jornada/TAC são resolvidas **por pessoa** via
  `regrasDe(tipoContratoJornadaId)`.
- 🔧 O comparativo (`comparativos`) recalcula cada ciclo sob demanda (N
  `resumoCiclo`); se a base crescer muito, pode valer cache/snapshot.
