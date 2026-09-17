> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-17 · **Cobre:** `backend/src/operadores/`

# Módulo: `operadores`
> **ADR 0026 (2026-09-17).** A **exceção de horário** da escala semanal
> (`EscalaEntry.especial`) foi **removida**: o horário é sempre o da ficha.
> Com ela saíram a **convocação** e a **folga concedida** que dependiam do
> mesmo campo. Os trechos abaixo que descrevem esse mecanismo valem apenas
> como histórico. Ver
> [ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md).


## 1. Propósito
Gestão da operação de frente de caixa: **ausências** (faltas) dos operadores e
fiscais, com justificativa e auditoria, o **Quadro de Operadores** (escala fixa
visual, turnos e cobertura) e a **analítica inteligente de faltas**.

## 2. Responsabilidades e limites
- **Faz:** registra/remove ausências com unicidade por pessoa/dia; ausência a
  prazo (período, gera faltas justificadas dia a dia); justifica/reabre/marca
  como injustificada; lista faltas com nome e justificativa; relatório de
  ausências por período; classifica e conta operadores por turno; monta a grade
  semanal, o roster do dia e o tablero "ao vivo"; analítica de faltas e de
  não-retornos (taxa, padrões, tendência, risco); avisos automáticos.
- **Não faz:** cadastro das pessoas em si (agora vive no Cadastro Unificado de
  [`colaboradores`](colaboradores.md), função `OPERADOR`; o `Operador` simples
  foi removido); jornada/ponto (fica em [`ponto`](ponto.md) e
  [`central-jornada`](central-jornada.md)); a escala dos fiscais/domingo
  (fica em [`fiscais`](fiscais.md)/[`escala-domingo`](escala-domingo.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `operadores.controller.ts` | Rotas de ausências/justificativa/contagem | 197 |
| `operadores.service.ts` | Regras de aplicação: ausências, avisos, período | 685 |
| `marcar-periodo-justificado.ts` | Primitiva compartilhada: falta justificada dia a dia (a prazo + atestado) | 72 |
| `operadores.domain.ts` | Regras puras: unicidade, turno, relatório, analítica | 517 |
| `operadores.errors.ts` | Erros de domínio (mapeados para HTTP) | 104 |
| `operadores.module.ts` | Ligações (DI) do módulo | 32 |
| `operador-turno.controller.ts` | Rotas do Quadro de Operadores | 70 |
| `operador-turno.service.ts` | Grade semanal, roster do dia, ao vivo, analítica | 958 |
| `dto/operadores.dto.ts` | Validação de entrada das rotas | 121 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `operadores`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /quadro-operadores/grade` | `OPERADORES_AUSENCIAS` | Grade semanal (Seg–Sáb) com status por dia (inclui **FERIAS**) e cobertura. |
| `GET /quadro-operadores/dia` | `OPERADORES_AUSENCIAS` | Roster de um dia (status TRABALHA/FOLGA/FALTA/**ATESTADO** + contagem de atestados). Quem está de **férias** no dia **não aparece**. |
| `GET /quadro-operadores/ao-vivo` | `OPERADORES_AUSENCIAS` | Quem deveria estar no caixa agora. |
| `GET /quadro-operadores/faltas/analitica` | `OPERADORES_AUSENCIAS` | Analítica de faltas do período (ranking, dia recorrente, risco). |
| `GET /quadro-operadores/nao-retornos/analitica` | `OPERADORES_AUSENCIAS` | Analítica de não-retornos do intervalo (mesma inteligência). |
| `GET /quadro-operadores/turnos` | `OPERADORES_AUSENCIAS` | Lista os operadores (turno fixo) do Cadastro Unificado. |
| `POST /operadores/ausencias` | `OPERADORES_AUSENCIAS` | Registra uma falta numa data (futura exige gerente/supervisor). |
| `POST /operadores/ausencias/periodo` | `OPERADORES_AUSENCIAS` | Ausência a prazo: falta justificada dia a dia (futura exige gestão). |
| `DELETE /operadores/ausencias/periodo` | `OPERADORES_AUSENCIAS` | Anula uma ausência a prazo inteira no período (só gerente/supervisor). |
| `DELETE /operadores/ausencias/:id` | `OPERADORES_AUSENCIAS` | **Exclui** (rejeita) uma falta lançada por engano — só gerente/supervisor/administrador. |
| `PATCH /operadores/ausencias/:id/justificativa` | `OPERADORES_AUSENCIAS` | Justifica/reabre/injustifica (com auditoria). |
| `GET /operadores/ausencias` | `OPERADORES_AUSENCIAS` | Lista faltas do período (nome + justificativa + marca de **atestado**/CID); `?pendentes=true`. |
| `GET /operadores/ausencias/relatorio` | `OPERADORES_AUSENCIAS` | Relatório por pessoa, filtrado e ordenado. |
| `POST /operadores/contagem-turno` | `OPERADORES_AUSENCIAS` | Conta os operadores por turno na escala informada. |

> **Atestados:** os atestados médicos são um módulo próprio
> ([`atestados`](atestados.md)). Ao lançar um atestado, ele grava faltas
> JUSTIFICADAS (motivo `ATESTADO_MEDICO`, `aPrazo`) carimbadas com `atestadoId`
> e `cid`. Por isso o roster do dia (`GET /quadro-operadores/dia`) distingue o
> status **ATESTADO** de **FALTA**, e a lista de faltas expõe `atestado`/`cid`.
> O roster também expõe o **período do atestado** (`atestadoInicio`/`atestadoFim`,
> ISO yyyy-mm-dd), derivado do `Atestado` ligado por `atestadoId` numa única
> consulta — para a escala mostrar "de … até …" ao lado do nome/CID.

> O controller de ausências declara `@Funcionalidade('OPERADORES_CRUD')` na
> classe, mas **cada rota** relaxa para `OPERADORES_AUSENCIAS` (que o fiscal
> possui), como consta na referência canônica.

## 5. Serviços e funções

### `OperadoresService`

#### `registrarAusencia(pessoaId, data, autor?, opcoes?)`
- **Efeitos:** normaliza para o **dia** (00:00 UTC); valida data permitida e
  ciclo de folha aberto; rejeita duplicata pela **chave única** `(pessoaId,
  data)` com uma consulta pontual (`findUnique`) — antes varria TODAS as
  ausências da pessoa e filtrava em memória (`O(histórico)`, no caminho quente
  do cron de 5 min); cria a `Ausencia` (nasce `PENDENTE`, com autor e flag
  `automatica`, e já com o vínculo `colaboradorId` = `pessoaId`, pois para
  operador o `pessoaId` é a própria ficha — Fase 4 · Opção A); avisa todos e
  checa o limite de faltas do mês (best-effort).
- **Corrida:** se duas escritas disputarem o mesmo dia, o banco recusa pela
  unicidade e a violação (**P2002**) é tratada como `AusenciaDuplicadaError`
  (mesmo idiom de `ponto`/`incidencias`) — idempotente.
- **Folga:** recusa marcar falta em **dia de folga** pela regra única
  ([`FolgaService`](escala-domingo.md)) — falta é a ausência de quem era
  *esperado*, e em dia de descanso não há o que faltar. Antes o sistema aceitava,
  e a detecção automática chegou a lançar falta no dia de folga de um colaborador
  porque as duas fontes de folga (ficha e escala semanal) discordavam. No cron a
  recusa é silenciosa (é "não é caso de marcar", e ele roda a cada 5 minutos); no
  endpoint manual o gestor recebe a mensagem explicando o que fazer.
- **Erros:** `AusenciaDuplicadaError`, `FaltaEmDiaDeFolgaError` (além dos de
  data/ciclo).

#### `registrarAusenciaPeriodo(pessoaId, inicio, fim, input, autor?)`
- **Efeitos:** marca **falta justificada** em cada dia corrido do intervalo
  (inclusive folga), numa transação atômica, pela **primitiva compartilhada**
  `marcarPeriodoJustificado` (a mesma do atestado — antes o laço dia a dia era
  duplicado); dias que já tinham falta são convertidos (não duplica); marca
  `aPrazo: true` **e grava `colaboradorId`** (= `pessoaId`), para a busca por
  ficha encontrar esses dias; envia um único aviso.
- **Rejeita `ATESTADO_MEDICO`:** atestado médico tem fluxo próprio (entidade
  `Atestado`, com CID e INSS — ver [`atestados`](atestados.md)); a ausência a
  prazo cobre os demais motivos, para o médico nunca virar uma falta justificada
  solta sem CID (`AtestadoMedicoViaFluxoProprioError`) — a mesma recusa vale para
  a justificativa individual (`justificarAusencia`), fechando o último caminho por
  onde um atestado podia nascer sem documento.
- **Erros:** `JustificativaInvalidaError` (motivo obrigatório),
  `AtestadoMedicoViaFluxoProprioError` (motivo ATESTADO_MEDICO),
  `PeriodoAusenciaInvalidoError` (data final antes da inicial ou > 186 dias).

#### `removerAusenciaPeriodo(pessoaId, inicio, fim)`
- **Efeitos:** anula uma **ausência a prazo inteira** — `deleteMany` dos dias
  `aPrazo` da pessoa no intervalo, casando as duas chaves (`pessoaId` **e**
  `colaboradorId`, cobrindo registros novos e legados); preserva as faltas
  comuns/automáticas **e os dias de ATESTADO** (`atestadoId != null` — não são
  removidos aqui, para não deixar o documento `Atestado` órfão; cancela-se pelo
  próprio atestado); exige **todos os ciclos de folha do período abertos** (o
  `deleteMany` cobre o intervalo inteiro); envia um único aviso. Retorna
  `{ removidas }`. A autorização (gerente/supervisor/administrador) é feita no
  controller, como no registro do período.
- **Erros:** `PeriodoAusenciaInvalidoError` (data final antes da inicial).

#### `removerAusencia(ausenciaId, perfil?)`
**Exclui** a falta de vez — é o caminho para **rejeitar uma falta lançada por
engano** (ex.: escala desatualizada que marcou falta indevida), para que não
pese no colaborador. Diferente de justificar/abonar (que mantém a falta com peso
reduzido — 2%/10%): aqui a ocorrência é apagada. A exclusão é **restrita a
gerente/supervisor/administrador** (guarda de perfil no controller); o serviço
ainda bloqueia o **fiscal** de desmarcar um dia `aPrazo`
(`AusenciaAPrazoProtegidaError`) e impede remoção em ciclo de folha fechado.
- ✅ Se a falta era **automática**, a exclusão é **definitiva** para aquele dia: o
  serviço grava a decisão do gestor em `ExclusaoOcorrenciaAutomatica` (com o
  autor) e a detecção **não a remarca**, mesmo que a pessoa siga escalada e sem
  bater ponto — ver regra 15 de [`ponto`](ponto.md). Antes era preciso corrigir a
  escala **antes** de excluir, senão a card voltava em 5 minutos. A lápide vale
  para pessoa + dia: cada novo dia recomeça do zero. Faltas **manuais** não geram
  lápide (não há detecção que as recrie).

#### `justificarAusencia(ausenciaId, input, autor?)`
Abona (`JUSTIFICADA`, exige motivo), reabre (`PENDENTE`, limpa tudo) ou marca
`INJUSTIFICADA`, gravando quem justificou e quando. `AusenciaNaoEncontradaError`
se não existir; bloqueia ciclo fechado.

**Recusa o motivo `ATESTADO_MEDICO`** (`AtestadoMedicoViaFluxoProprioError`, 400),
a mesma regra que `registrarAusenciaPeriodo` já aplicava. Este era o **último**
caminho por onde um atestado nascia **sem documento**: o gestor abonava a falta
como "atestado médico" e o dia passava a valer como atestado sem CID, sem período
e sem acompanhamento do INSS. Além do risco trabalhista, eram esses dias soltos
que tornavam a **contagem** de atestados aproximada (ver regra 12 da
[`central-jornada`](central-jornada.md)). Atestado entra **só** pelo fluxo de
[`atestados`](atestados.md). Reabrir/injustificar não manda motivo, então a guarda
não atrapalha a correção de registros antigos.

Os campos de justificativa são montados
pela primitiva partilhada `montarDadosJustificativa` (common) — **fonte única**
com os não-retornos (`incidencias`); a validação do motivo obrigatório e o erro
(`JustificativaInvalidaError`) permanecem locais.

#### `listarAusencias(periodo, apenasPendentes?)`
Lista as faltas do período com nome e os dados da justificativa; pendentes no
topo, mais recentes primeiro. O nome é resolvido pela **ficha canônica**
(`Colaborador`), via `pessoaId` (operador) ou `colaboradorId` (fiscal); o modelo
legado `Fiscal` só é consultado como fallback para faltas antigas sem vínculo
(Fase 4 · Opção A · A.3).

#### `relatorioAusencias(periodo)` · `classificarTurnoOperador(entrada)` · `contagemPorTurno(operadores)`
Delegam às funções puras homônimas do domínio.

### `OperadorTurnoService`
- `listar()` — operadores (turno fixo) a partir do Cadastro Unificado (função
  `OPERADOR` ativa). Serve à tela de cadastro; a escala não passa mais por aqui.
- **Quem decide o estado e o horário do dia é `montarLinhaEscala`** — a mesma
  função que monta a [escala publicada](escala-exportacao.md). O quadro carrega
  os ingredientes (ficha, âncora do rodízio, feriados, férias, folga pela regra
  única, exceções de horário) em `contextoEscala(dias)` e chama a função; o que
  continua sendo dele é o recorte (`funcao: 'OPERADOR'`), o enriquecimento das
  linhas e as contagens. Antes o quadro tinha uma **cópia** da regra (um
  `fds ? entradaFds : entradaSemana` local) e a cópia divergia em três pontos:
  férias não saíam da lista, folga marcada só na escala semanal virava falta, e
  **no feriado o horário era o de dia útil** em vez do de domingo.
- `grade(dataRef?)` — grade semanal (Seg–Sáb) com trabalha/folga/**falta ou
  atestado**/férias/cobertura por dia. O dia vinculado a um atestado aparece como
  `ATESTADO` (mesma regra do roster diário), não como `FALTA`. Sendo um
  calendário, quem falta mantém a célula **sem horário** — para a leitura da
  semana não confundir "faltou" com "trabalhou".
- **FOLGA no quadro segue a regra única** ([`FolgaService`](escala-domingo.md)):
  a **ficha manda quando afirma um dia**, e a escala semanal decide quando a ficha
  se cala ([ADR 0023](../02-arquitetura/decisoes/0023-folga-a-ficha-manda.md)).
  Antes o quadro olhava só `folgaDiaSemana`, enquanto a escala publicada também
  respeitava a escala semanal — com as duas fontes em desacordo, o mesmo dia saía
  FOLGA num lugar e FALTA no outro. E depois, com o **OU** puro, uma linha antiga da
  escala semanal passou a somar um segundo dia de descanso que a ficha não afirmava;
  hoje o derivado não vota contra a sua fonte. A folga **vence** uma falta já
  gravada no dia (a auto-cura do Relógio Ponto a remove em seguida).
- **FERIADO segue o horário de DOMINGO** da pessoa (`FeriadosService`, opcional):
  é a regra que a jornada já aplicava ao pagamento e que a escala publicada já
  aplicava ao turno. O quadro não a conhecia — num feriado ele mostrava o horário
  de dia útil, e o operador que lesse a tela de gestão veria uma hora de entrada
  diferente da que estava na escala que ele recebeu.
- ~~**EXCEÇÃO DE HORÁRIO**~~ — **removida pela ADR 0026**: o horário é sempre o da
  ficha. O texto a seguir é histórico. A exceção prevalecia sobre o turno do
  cadastro, inclusive sobre a folga da ficha — era assim que se convocava alguém no
  seu dia de descanso. O quadro ignorava as exceções por completo. A leitura é a
  **consulta compartilhada** `carregarHorariosEspeciais`: o quadro tinha uma cópia
  idêntica dela, e depois do trabalho de unificar a *decisão* em
  `montarLinhaEscala`, manter dois carregamentos do mesmo *ingrediente* era deixar
  aberta a porta pela qual o bug do horário entrou.
- `diaOperadores(dataRef?)` — roster de um dia, ordenado por entrada (folga ao
  fim); propaga o turno do cadastro. Os campos de ausência (`ausenciaId`, `cid`,
  período do atestado, estado da justificativa) só aparecem quando a falta
  **realmente se aplica**: `montarLinhaEscala` descarta falta em dia de
  folga/férias, e mostrar a justificativa de uma falta inexistente convidaria o
  gestor a agir sobre ela.
- `aoVivo()` — quem deveria estar no caixa agora (fuso de Brasília). Os candidatos
  saem da mesma regra (`status === 'TRABALHA'`), então a franja "agora" passou a
  acertar também em feriado e com horário de exceção.
- `analiticaFaltas(inicio, fim)` / `analiticaNaoRetornos(inicio, fim)` —
  analítica inteligente (taxa, padrões, tendência e risco) via `analisarFaltas`.
  Analisam ausências **já registradas**, então férias não entram na conta (quem
  está de férias não gera ausência).
- **FÉRIAS no quadro** (`FeriasService`, opcional): no roster do dia e no
  `aoVivo()` a pessoa **sai da lista**; na grade a célula vira `FERIAS`. Ver a
  regra 4 e os riscos.
- **Crons:** `alertaFaltasSemanal()` (segunda 08:00) resume as faltas dos últimos
  7 dias; `avisoCoberturaCritica()` (diário 07:00) avisa quando a cobertura de
  hoje fica abaixo de `COBERTURA_MINIMA`. O de cobertura **reaproveita
  `diaOperadores()`** em vez de recontar: a contagem própria que existia antes (a
  ficha, menos a folga da ficha, menos as faltas) ignorava férias, a regra única
  de folga e o rodízio de domingo, superestimando a cobertura — num alerta, o
  pior erro possível, porque ele deixava de disparar quando devia.

## 6. Lógica de domínio (funções puras)
- `nomeDuplicado(...)` → unicidade de nome de operador (Req 6.1.3).
- `ausenciaDuplicada(...)` → no máximo uma ausência por (pessoa, dia civil UTC).
- `relatorioAusencias(...)` → conta por pessoa dentro do período, ordena
  decrescente (desempate por `pessoaId`).
- `horarioParaMinutos(...)` / `classificarTurnoOperador(...)` → converte "HH:mm"
  e classifica o turno pelas fronteiras 10:00 e 13:00 (partição total/exclusiva).
- `estaTrabalhando(...)` / `contagemPorTurno(...)` → conta só quem trabalha; a
  soma por turno é sempre igual ao total.
- `analisarFaltas(...)` → analítica: taxa bruta e ponderada (justificadas pesam
  menos), dia recorrente, faltas em "emenda", maior sequência, tendência e risco.
  A maior sequência (`maiorSequenciaDias`) e a pontuação de risco (limiares de
  taxa/quantidade/sequência + mapa pontos→nível) vêm de `common` — **fonte única**
  partilhada com os não-retornos; aqui somam-se apenas os sinais próprios da falta
  (emenda com folga, dia recorrente e tendência de alta).

## 7. Estados e enums
- `Turno`: `ABERTURA` (< 10:00) · `INTERMEDIARIO` (10:00–12:59) · `FECHAMENTO`
  (≥ 13:00).
- `StatusJustificativa`: `PENDENTE` · `JUSTIFICADA` · `INJUSTIFICADA` (ver
  `common/justificativas`). Transições: registro nasce `PENDENTE`; `PENDENTE →
  JUSTIFICADA` (com motivo) ou `→ INJUSTIFICADA`; reabrir volta a `PENDENTE`
  limpando motivo/auditoria.
- `RiscoFalta`: `BAIXO` · `MEDIO` · `ALTO` (semáforo da analítica).
- `StatusCelula` (Quadro): `TRABALHA` · `FOLGA` · `FALTA` · `ATESTADO` ·
  `FERIAS`. O `FERIAS` só aparece nas células da **grade semanal**: no roster de
  um dia quem está de férias sai da lista, e não há célula para marcar.

## 8. Dados que o módulo toca
- **Lê (exclusão):** `FeriasColaborador` via `FeriasService` — quem está de
  férias no dia sai do Quadro.
- **Escreve:** `Ausencia` (cria/atualiza/remove; grava `colaboradorId`) e
  `ExclusaoOcorrenciaAutomatica` (a lápide da exclusão de uma falta automática).
- **Lê:** `Ausencia`, `Colaborador`, `Fiscal` (apenas fallback de nome),
  `OperadorTurno` (Quadro/roster).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (avisos, opcional),
  `ValidacaoDataService` (data inicial), `CicloFolhaService` (ciclo aberto),
  `EscalaDomingoModule`, `FeriasService` (exclusão de quem está de férias,
  opcional) e o domínio de `common/justificativas`.
- **É usado por:** o app (Quadro de Operadores, painel de faltas) e indiretamente
  o Perfil Inteligente do colaborador (que consome assiduidade/faltas).

## 10. Regras de negócio-chave
1. **Uma ausência por pessoa/dia** (unicidade por dia civil).
2. **Ausência futura só com gerente/supervisor** (programação).
3. **Ausência a prazo é atômica** e conta todos os dias corridos (inclusive
   folga); só a gestão desmarca esses dias (fiscal não).
4. **Quem está de férias não é escalado.** No roster do dia (e no tablero ao
   vivo) a pessoa **sai da lista**, como na escala de fiscais; na grade semanal a
   **célula** vira `FERIAS`, porque o período pode cobrir só parte da semana. As
   férias têm **precedência sobre folga e falta**: não criam `Ausencia`, então
   antes desta regra a pessoa caía no caminho de quem trabalha. Nos totais do dia
   e na cobertura da grade ela não conta em nenhum bucket — não era esperada.
5. **Falta NÃO se marca em dia de folga** (regra única de folga: ficha **ou**
   escala semanal — ver [`escala-domingo`](escala-domingo.md)). Falta é a ausência
   de quem era *esperado*; em dia de descanso não há o que faltar. Vale para a
   falta manual e para a automática, e **não** vale para ausência a prazo /
   atestado, que cobrem períodos e incluem a folga de propósito (regra 3), por
   outro caminho.
6. **Justificar exige motivo**; reabrir limpa o motivo e a auditoria.
7. **Ciclo de folha fechado bloqueia** registrar/remover/justificar faltas. Nas
   operações de **período** (ausência a prazo, registrar e cancelar), basta **um**
   dos ciclos tocados estar fechado para bloquear — antes só o ciclo do primeiro
   dia era verificado, e o resto do período entrava sem controle. Ver
   `exigirCiclosAbertos` em [`ciclo-folha`](ciclo-folha.md).
8. **Turno pela hora de entrada** (10:00 e 13:00 como fronteiras).
9. **Avisos são best-effort:** nunca impedem o registro da falta. O aviso diário
   de **cobertura crítica** deriva do roster do dia (`diaOperadores`), então
   herda a regra única de folga, o rodízio de domingo e as férias — e **não
   avisa** quando ninguém era esperado (não há operação a cobrir).
10. **Excluir ≠ justificar:** justificar/abonar mantém a falta com peso reduzido
   (2%/10%); **excluir** apaga a falta lançada por engano (peso zero, some do
   histórico) e é restrito a gerente/supervisor/administrador.
11. **Médico só por atestado:** a ausência a prazo NÃO aceita motivo
   `ATESTADO_MEDICO` — atestado tem fluxo próprio (com CID e INSS). Abonar uma
   falta avulsa como atestado médico (na tela de Justificativas) continua
   permitido (é abono de uma ocorrência já existente, não um período novo).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `operadores.service.spec.ts` | Ausências, ciclo fechado, a prazo (rejeita atestado médico), corrida (P2002) | 12 |
| `ausencia-a-prazo-vinculo.spec.ts` | A prazo grava `colaboradorId` + `aPrazo` em cada dia | 1 |
| `remover-ausencia-periodo.spec.ts` | Anular a prazo (só `aPrazo`, ambas as chaves, preserva atestado) | 4 |
| `marcar-periodo-justificado.spec.ts` | Primitiva compartilhada: cria por dia e converte sem duplicar | 1 |
| `operadores.properties.spec.ts` | Unicidade, relatório e turno (property-based) | 5 |
| `operadores.justificativa.spec.ts` | Taxa ponderada e justificativa com auditoria | 6 |
| `ausencia-a-prazo.spec.ts` | Proteção da falta a prazo (fiscal x gestão) | 3 |
| `operador-turno.roster-turno.spec.ts` | Turno do cadastro no roster do dia + grade distingue ATESTADO de FALTA | 3 |
| `operadores.controller.spec.ts` | Contagem por turno e exclusão de falta restrita à gestão | 3 |
| `listar-ausencias-ficha.spec.ts` | Nome da falta resolvido pela ficha canônica (A.3) | 1 |
| `falta-em-folga.spec.ts` | Recusa falta em dia de folga; marca normalmente em dia de trabalho; e o contrapeso: **ausência a prazo segue cobrindo a folga** | 3 |
| `quadro-folga-escala.spec.ts` | O quadro mostra FOLGA quando só a escala semanal marca folga; a folga vence uma falta já gravada; TRABALHA quando nenhuma fonte diz folga; e a grade usa a mesma regra | 4 |
| `quadro-ferias-escala.spec.ts` | Quem está de férias sai do roster do dia (inclusive no domingo) e dos totais; as férias vencem uma falta gravada; fora do período segue normal; sem o serviço de férias nada é excluído; a grade marca **FERIAS** só no dia coberto (sem apagar a linha da semana) e não conta férias na cobertura; o tablero ao vivo não espera quem está de férias; e o **aviso de cobertura** não conta quem está de férias nem grita quando ninguém era esperado | 14 |
| `coerencia-quadro-escala.spec.ts` | **Coerência entre telas:** para o mesmo dia e pessoa, o Quadro e a [escala publicada](escala-exportacao.md) dizem o mesmo — e desde a extensão comparam também o **horário**, não só o estado (trabalho, folga da ficha, folga da escala semanal com a ficha omissa e como exceção, **ficha afirmando outro dia**, férias, falta, atestado, **feriado** e **horário de exceção**). É o teste que faltava: achou a divergência de folga e, quando passou a comparar horários, os desvios de feriado e de exceção | 10 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 **Modelo legado em transição:** o `Operador` simples foi removido e os
  operadores agora vêm do Cadastro Unificado (função `OPERADOR`); o
  `OperadorTurno` antigo coexiste — ver [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md).
- 🔧 `operador-turno.service.ts` concentra grade, roster, ao vivo e analítica;
  candidato a extrair sub-serviços. (Tamanho atual em
  [estado-e-métricas](../08-gestao/estado-e-metricas.md).)
- ✅ **O Quadro não decide mais sozinho o que a pessoa faz no dia.** Ele e a
  escala publicada chamam `montarLinhaEscala`; o quadro só recorta os operadores
  e enriquece as linhas. A regra local que existia aqui divergiu três vezes
  (férias, folga da escala semanal, feriado/exceção de horário) e cada vez foi um
  caso em que duas telas do mesmo app respondiam diferente à mesma pergunta.
- ✅ **Existe um teste de coerência entre as telas**
  (`coerencia-quadro-escala.spec.ts`): para o mesmo dia e a mesma pessoa, o Quadro
  e a escala publicada têm de dizer o mesmo — estado **e horário**. Foi ele que
  revelou a divergência de folga e, ao passar a comparar horários, os desvios de
  feriado e de exceção. **Um caso novo de escala deve ganhar uma linha lá.**
- ⚠️ **Ainda há uma terceira fonte de "quem trabalha hoje":**
  `FiscaisService.escaladosDoDia`. A
  [ADR 0015](../02-arquitetura/decisoes/0015-ferias-inativacao-nao-rigida.md)
  a tratou como **fonte única** e por isso bastava excluir as férias ali — não
  era, e este quadro ficou anos mostrando quem estava de férias como "Trabalha".
  O quadro e a escala publicada já convergiram em `montarLinhaEscala`;
  `escaladosDoDia` **não**. Enquanto isso, qualquer regra nova de "quem é
  escalado" ainda precisa ser aplicada nos dois lugares.
- ⚠️ **Feriado e exceção de horário dependem de serviços opcionais.**
  `FeriadosService` e `FolgaService` entram por `@Optional()`: sem eles o quadro
  degrada (volta a ignorar feriado / a regra única de folga) em vez de quebrar.
  Um spec que construa o serviço à mão sem passá-los **não** cobre essas regras —
  é o que os torna fáceis de perder de vista de novo.
- ⚠️ **A grade consulta férias um dia por vez** (seis consultas por semana),
  mesmo padrão já registrado como dívida em
  [`escala-exportacao`](escala-exportacao.md). Uma consulta por intervalo
  resolveria os dois.
- ⚠️ **O Quadro não inclui SUPERVISOR:** `listar()` e `fichasOperadores()`
  filtram `funcao: 'OPERADOR'`. O supervisor aparece na equipe do dia
  (`escaladosDoDia`, via `FUNCOES_PONTO_NAO_FISCAL`) e na escala publicada
  (`FUNCOES_ESCALA`), onde as férias **já** eram respeitadas — mas não neste
  quadro. Incluí-lo aqui é uma decisão de produto pendente, não um bug de férias.
- ⚠️ **`pessoaId` polimórfico:** uma ausência pode referenciar `Colaborador` ou
  `Fiscal`; a resolução do nome prefere a ficha canônica (`colaboradorId`) e usa
  o `Fiscal` só como fallback (Fase 4 · Opção A).
