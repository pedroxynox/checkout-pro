> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-27 · **Cobre:** `backend/src/fiscais/`

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
| `fiscais.service.ts` | Regras de aplicação: status, jornada, extras, painel | 1747 |
| `fiscais.domain.ts` | Regras puras: status atual, jornada, transições | 150 |
| `fiscais.errors.ts` | Erros de domínio (mapeados para HTTP) | 47 |
| `fiscais.eventos.ts` | Barramento de eventos de status (produtor↔gateway) | 38 |
| `fiscais.gateway.ts` | Gateway WebSocket do painel em tempo real | 92 |
| `fiscais-horario.service.ts` | Cron: lembretes de horário aos fiscais (conta resolvida pela ficha) | 143 |
| `fiscais-alertas.service.ts` | Cron: alertas de intervalo longo e cobertura | 416 |
| `escala.controller.ts` | Rotas da escala de trabalho | 64 |
| `escala.service.ts` | Regras da escala (geral, especial, consolidada) | 355 |
| `escala.domain.ts` | Regras puras: escala efetiva, consolidada, semanal | 166 |
| `colaborador-vinculo.ts` | Regra pura: mapeia fiscal → colaborador (ficha) | 84 |
| `identidades.consulta.ts` | **A única** carga das identidades de uma pessoa (ficha + ids de fiscal), nos dois sentidos | 85 |
| `integridade-vinculo.ts` | Regra pura: detecta vínculos órfãos fiscal ↔ ficha | 96 |
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
  `RegistroPontoFiscal` (dia civil de Brasília) **já com o vínculo
  `colaboradorId`** (ficha canônica, resolvido por conta/matrícula — ponte da
  Fase 4); **publica o evento** em tempo real; notifica os gestores na transição
  relevante; recalcula a jornada.

#### `meuFiscal(usuarioId)` / `meuResumo(usuarioId)`
`meuFiscal` resolve o `Fiscal` do usuário logado (`FiscalNaoEncontradoError`).
`meuResumo` devolve status + jornada + `faltaHoje`/`folgaHoje`; `null` se o
usuário não for fiscal (ex.: gerente só visualizando).

#### `registrarFalta(fiscalId)`
Registra a falta do dia do próprio fiscal; bloqueia se já iniciou jornada
(`JaIniciouJornadaError`) ou está de folga (`FiscalDeFolgaError`). A `Ausencia`
criada já grava o vínculo `colaboradorId` (ficha canônica), preenchendo também
faltas antigas sem vínculo (Fase 4 · Opção A).

A folga é verificada **duas vezes**, de propósito: `isFolgaHoje` olha a escala
semanal (a fonte dos fiscais) e a **regra única**
([`FolgaService`](escala-domingo.md)) olha **também a ficha**. Foi exatamente essa
lacuna que gerou falta em dia de descanso — folga na terça na ficha, com a escala
semanal desatualizada. Na dúvida entre as fontes, não se marca falta.

#### `painel()`
Status atual ao vivo, usando a mesma inteligência da jornada (prefere as batidas
do Relógio de Ponto e aplica as regras de contrato), refletindo o fim do
expediente mesmo sem batida de encerramento. Inclui **fiscais e operadores**:
cada item traz `tipoPessoa` (`FISCAL`/`OPERADOR`) e o `colaboradorId`. Os
operadores entram via `jornadaOperadoresDoDia` (só quem bateu ponto hoje).

#### `publicarStatusColaborador(colaboradorId, status, em?)`
Propaga em tempo real (mesmo canal WebSocket dos fiscais) o status ao vivo de um
**operador**, identificado pela ficha canônica (`colaboradorId`). Chamado pelo
`PontoService` quando um operador bate ponto.

#### `escaladosDoDia(dia)` / `jornadaDoDia(dia)` / `equipeDoDia(dia)` / `horasExtrasMes(mes?)`
`escaladosDoDia` diz quem deve trabalhar no dia (fiscais pela escala consolidada +
operadores pelo cadastro/rodízio) e alimenta tanto a "equipe do dia" quanto a
detecção automática de falta. **Quem está de férias no dia é excluído aqui** (pela
ficha, via `FeriasService.colaboradoresDeFeriasNoDia`), então some da escala e não
vira falta automática.

> **Não é a "fonte única".** Ela é uma das três respostas para "quem trabalha
> hoje" — as outras duas são o [Quadro de Operadores](operadores.md) e a
> [escala publicada](escala-exportacao.md), que já convergiram em
> `montarLinhaEscala`. Esta ainda tem forma própria (é uma **whitelist**: estar na
> lista é a única informação, e não estar mistura folga, férias e "sem horário") e
> só carrega a **entrada** — o cron não usa a saída. A coerência com a escala
> publicada é verificada em `coerencia-escalados-escala.spec.ts`. Ver os riscos.

**Exceções de horário** (`EscalaEntry.especial`) valem também para operadores e
supervisores, na mesma precedência de `montarLinhaEscala`: a exceção vence o turno
do cadastro. Antes o ramo dos operadores as ignorava por completo — a detecção
esperava a pessoa no horário do turno padrão e não no que o gestor combinou com
ela, e duas horas depois disso nascia uma falta em quem chegou no horário certo.

**Quem está de FOLGA por qualquer fonte também é excluído aqui**, pela regra única
([`FolgaService`](escala-domingo.md)): antes cada ramo consultava só a sua fonte —
os fiscais a escala semanal, os operadores a ficha —, e quem tinha as duas em
desacordo era escalado e acabava com **falta automática no próprio dia de
descanso**. Sair de `escaladosDoDia` é o que impede a falta de nascer; as guardas
em `registrarFalta`/`registrarAusencia` são a segunda linha.

**A hora esperada do fiscal é a mais TARDIA entre a ficha e a escala semanal**
(`entradaEsperadaConservadora`, em `hora-esperada-fiscal.ts`). A ficha é a fonte e
a escala semanal é um derivado que fica velho; quando discordam, cobrar pela mais
tardia garante que **a correção nunca cria uma falta que antes não existia** — só
pode deixar de criar. É o mesmo viés da regra única de folga, e pela mesma razão:
marcar falta em quem estava no horário é muito pior do que deixar de cobrar
alguém. Três ramos fogem da comparação, cada um por um motivo:

| Situação | Hora usada | Por quê |
|---|---|---|
| **Exceção** de horário (`especial`) | a da escala | É o combinado mais recente e específico do dia; comparar desfaria a convocação. |
| **Feriado** | a da ficha (`entradaDom`), com a escala como último recurso | A escala semanal **não conhece feriados** — o valor dela não é uma opinião concorrente, é um dado que não se aplica. Comparar faria o horário de dia útil vencer sempre que fosse mais tarde. |
| Fiscal **sem ficha** resolvida | a da escala | Sem duas fontes não há o que comparar, e tirá-lo da lista seria uma decisão sem base. |

E um caso em que **não se cobra nada**: ficha sem turno para o dia. A ficha é a
fonte; se ela não afirma um turno, o sistema não tem base para afirmar uma
expectativa. É o caso "ficha vazia com escala do seed sobrevivente", em que se
cobrava o ponto por um dado que ninguém revisou.

Para operadores/supervisores a hora vem direto de
`entradaEsperadaNoDia(..., ehFeriado)` — ali a ficha já é a única fonte, e a
comparação não faz sentido. Sem `FeriadosService` (injetado com `@Optional()`), o
dia é tratado como normal. A folga não muda em feriado (regra 7 de
[`escala-domingo`](escala-domingo.md)).

Os demais: log de tempos por
fiscal; jornada de equipe (todos os escalados, com atraso e falta); e o
acumulado de horas extras do mês (extra 50% em dias comuns e 100% aos domingos).

#### `folgaHoje()` · `historicoSemanal(usuarioId)` · `rankingMes()` · `previsaoExtras()` · `contextoEscala()`
Consultas de apoio: quem está de folga hoje; histórico de 7 dias do próprio
fiscal; ranking de pontualidade; previsão de extras; e o texto de contexto para
integração com o Cluby.

#### `reescreverRegistrosDoDia(cliente, ..., colaboradorId?)` / `publicarStatusDoDia(...)`
Ponte batidas → status: reescreve o log do dia dentro da transação das batidas
(atômico) e propaga o status por WebSocket **após o commit**. Grava o
`colaboradorId` recebido (vindo das próprias batidas) em cada registro do dia —
a ponte que ligará o ponto do fiscal à ficha canônica (Fase 4).

### `EscalaService`
- `cadastrarEscala(entry)` / `definirHorarioEspecial(funcionarioId, entry)` —
  escala geral e horário especial (que prevalece). Ambas gravam o vínculo
  `colaboradorId` (ficha canônica), resolvido do `funcionarioId` (Fase 4 · Opção A).
- `resolverEscalaEfetiva(funcionarioId, diaSemana)` — a escala aplicável no dia.
- `escalaConsolidada(diaSemana, dataISO?)` — consolidação por dia; no domingo,
  os fiscais vêm do rodízio de grupos. Quando há **data concreta** (`dataISO`),
  quem está de férias nesse dia é excluído (via `FeriasService`); a grade
  semanal sem data não aplica férias (elas são por dia).

### Coerência ficha ↔ escala semanal (`npm run integridade`)

A ficha é a fonte da escala (Opção A): `sincronizarEscalaFiscal` regenera as
entradas **gerais** de `EscalaEntry` ao cadastrar, editar ou reativar um fiscal, e
a escala semanal **não tem tela que a edite**. Na prática ela é um derivado.

O risco não é "qual das duas é a verdade" — é que o derivado fica **velho em
silêncio**. A sincronização tem três saídas antecipadas:

| Situação | Efeito |
|---|---|
| Ficha **sem horários** (`temEscalaDefinida` falso) | Não apaga a escala existente, de propósito ("não apagar a escala vinda do seed enquanto o gestor não a preenche"). A escala antiga continua valendo. |
| Fiscal **sem conta de acesso** ou **sem registro `Fiscal`** | Não há onde escrever; nada é sincronizado. |
| Dia com **horário pela metade** (entrada sem saída) | `gerarEscalaSemanalFiscal` omite o dia. A pessoa desaparece da detecção e **nunca recebe falta automática**. |

Duas saídas que **deixaram de existir** (ADR 0023), porque não eram saídas: eram
vazamentos.

- **A limpeza cobria uma identidade só.** O `deleteMany` filtrava por
  `funcionarioId: fiscal.id`, então qualquer linha gravada sob outro id — o
  `Colaborador.id` da era-operador, ou um segundo registro `Fiscal` homônimo criado
  por `garantirFiscal` — sobrevivia a todas as edições seguintes. E uma linha velha
  de folga não é inerte: a regra de folga a encontra pelas duas chaves. Hoje a
  limpeza cobre **todas** as identidades da pessoa.
- **Deixar de ser fiscal não apagava nada.** A função saía pela porta
  (`if (funcao !== 'FISCAL') return`) **antes** de qualquer limpeza, e a escala
  seguia alimentando a folga e a detecção automática de falta de alguém que já não
  era fiscal — para sempre. Hoje o rebaixamento (e o desligamento) apaga as
  entradas gerais. As **exceções** (`especial`) continuam intocadas: são decisões
  humanas por dia, não derivadas da ficha.

Isso importa porque as duas pontas têm consumidores diferentes: a **detecção
automática de falta** lê a escala semanal e a **escala publicada** (o PDF que a
equipe recebe) lê a ficha. Onde discordam, o time lê uma hora e o sistema cobra
outra — e duas horas depois da hora que o sistema acha certa, nasce uma falta.

`detectarEscalasIncoerentes` (`integridade-escala.ts`, lógica pura) **só
diagnostica**: não escolhe um lado nem corrige nada. Compara o que a ficha
geraria com o que está gravado e reporta:

- **escala diferente da ficha**, dia a dia, marcando os casos de **ficha vazia**
  (os mais perigosos: a escala sobrevivente do seed segue cobrando o ponto);
- **ficha preenchida e sem escala** — quem nunca recebe falta automática;
- **horário pela metade** na ficha;
- **entradas gerais duplicadas** (ver abaixo).

Como corrigir uma divergência: reabrir e salvar o cadastro regenera a escala. Nos
casos de ficha vazia, preencher os horários **primeiro**.

> **Duplicadas e desempate.** `EscalaEntry` não tem índice único em
> (`funcionarioId`, `diaSemana`, `especial`), e `cadastrarEscala` fazia `create`
> cego — criando uma segunda entrada geral para o mesmo dia. O problema não eram
> as duplicadas: era que os dois leitores desempatavam **ao contrário**
> (`resolverEscalaEfetiva` pegava a primeira, `escalaConsolidada` a última), então
> a escala efetiva de uma pessoa dependia de quem perguntava. Hoje a escrita
> **substitui** a geral do dia e os dois leitores usam a **primeira**. As
> duplicadas remanescentes aparecem no `npm run integridade`; um índice único
> resolveria de vez, mas exige limpar a base antes.

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
- `jornadaEsperadaMs(diaSemana)` → carga do dia no 6x1 (dom 7h20 · seg-qui 7h ·
  sex-sáb 8h); envolvida por `cargaBaseDoDia` em [`ponto`](ponto.md), que é quem
  os cálculos usam. `isDomingo(diaSemana)` é legado: **não** decide o adicional
  (quem decide é `diaPagaAdicional100`).
- Escala: `resolverEscalaEfetiva`, `escalaConsolidada`, `gerarEscalaSemanalFiscal`,
  `temEscalaDefinida` (o cadastro é a fonte única — Opção A).
- `mapearFiscalColaborador(...)` → une o fiscal à ficha do colaborador por conta
  de acesso ou, em fallback, por matrícula.
- `detectarVinculosOrfaos(fiscais, usuarios, fichas)` → diagnóstico de
  integridade (Fase 4): lista fiscais sem ficha canônica e fichas FISCAL sem
  registro de fiscal. Base do verificador `npm run integridade`.

## 7. Estados e enums
- `StatusFiscal`: `DISPONIVEL` · `INTERVALO` · `FORA_EXPEDIENTE`. O status atual
  é sempre o da última transição; toda mudança gera aviso ao gestor.
- `EscalaEfetiva`: uma `EscalaEntry` aplicável **ou** `'FOLGA'`.
- Jornada esperada: Seg–Qui 7h, Sex–Sáb 8h, Dom 7h20 (o excedente é hora extra).

## 8. Dados que o módulo toca
- **Escreve:** `RegistroPontoFiscal` (log de status, agora com `colaboradorId`
  em registros novos), `EscalaEntry` (escala geral/especial), `Ausencia` (falta
  do fiscal, agora com `colaboradorId`).
- **Lê:** `Fiscal`, `Usuario`, `Colaborador` (vínculo/nome), `EscalaEntry`,
  `Ausencia`, contratos e feriados (regras de jornada/extras).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService`, `JwtService` (gateway),
  `DataInicialModule`, `EscalaDomingoModule`, `FeriadosModule`,
  `CicloFolhaModule`, `TiposContratoModule`, [`FeriasModule`](ferias.md)
  (exclui da escala quem está de férias).
- **É usado por:** o app (painel de fiscais, jornada, escala), e é fonte para
  [`central-jornada`](central-jornada.md) e o Perfil Inteligente.

## 10. Regras de negócio-chave
1. **Três estados de jornada**; o status atual é o da última transição.
2. **De folga ou com falta não bate ponto**; com jornada iniciada não marca
   falta (erros de conflito 409).
3. **Dia civil de Brasília (UTC-3)** para não gravar/ler no dia UTC seguinte à
   noite.
4. **Toda transição notifica os gestores** e é propagada em tempo real.
5. **Horas extras:** 50% em dias comuns, 100% aos domingos **e em todo feriado**,
   sobre a jornada esperada do dia. A jornada de um feriado é **7h20** (a de um
   domingo), em qualquer dia da semana; nos demais dias, a carga do próprio dia
   (seg-qui 7h · sex-sáb 8h). O teto de extras é 1h50 por dia, sempre — acima
   disso é TAC. Ver
   [ADR 0018](../02-arquitetura/decisoes/0018-feriado-jornada-do-dia-real.md).
6. **Horário especial prevalece** sobre a escala geral (escala efetiva).
7. **O cadastro é a fonte única da escala** (Opção A); no domingo a escala dos
   fiscais vem do rodízio de grupos.
8. **Ponte batidas → status é atômica**; o tempo real só é anunciado após o
   commit.
9. **Férias somem da escala** (inativação não rígida): `escaladosDoDia` e a
   escala consolidada (com data) excluem quem está de férias — sem falta e sem
   mexer em `ativo` (ver [`ferias`](ferias.md)).

10. **A jornada do dia leva o nome COMPLETO.** `ItemJornada` (e portanto
    `equipeDoDia`) carrega `nome` além de `primeiroNome`: o painel da Jornada de
    Equipe mostra o nome inteiro, porque com o primeiro nome apenas duas pessoas
    homônimas ficavam indistinguíveis na lista. O `primeiroNome` continua
    disponível — é o que os avisos e o tempo real usam.
11. **Atestado aparece como ATESTADO, não como falta.** `equipeDoDia` devolve
   `atestado: boolean` junto de `falta`, e a pessoa **continua no painel** —
   sumir seria pior, porque não se saberia por que ela não está. A consulta das
   ausências do dia casa **as duas colunas** (`pessoaId` e `colaboradorId`): olhar
   só uma deixava passar as ausências gravadas pela ficha (atestado e ausência a
   prazo de fiscal), e a pessoa aparecia como se nada tivesse.
## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `fiscais.service.spec.ts` | Status, painel, jornada, fiscal histórico e vínculo `colaboradorId` no ponto/falta/escala/status (Fase 4) | 19 |
| `status-operador.spec.ts` | Painel inclui operadores; `publicarStatusColaborador` emite o evento pela ficha | 2 |
| `fiscais.properties.spec.ts` | Status atual, transição, jornada, escala (property-based) | 5 |
| `fiscais.controller.spec.ts` | Rotas do próprio fiscal e log de jornada | 4 |
| `fiscais.gateway.spec.ts` | Broadcast do painel via WebSocket (integração) | 3 |
| `fiscais.painel-status.spec.ts` | Status do painel a partir das batidas | 2 |
| `fiscais-alertas.intervalo.spec.ts` | Alerta de intervalo longo | 2 |
| `jornada-marcacoes.spec.ts` | Jornada a partir das marcações do dia | 2 |
| `integridade-vinculo.ts` + `integridade-escala.ts` | Regras puras dos dois diagnósticos de `npm run integridade` (vínculos e coerência de escala) | — |
| `hora-esperada-fiscal.ts` | Regra pura: a hora que pode ser cobrada de um fiscal (a mais tardia entre ficha e escala) | — |
| `escala-inativo.spec.ts` | Escala de colaborador inativo | 1 |
| `escalados-ferias.spec.ts` | `escaladosDoDia` exclui quem está de férias | 2 |
| `escalados-folga.spec.ts` | **Regressão:** `escaladosDoDia` respeita a folga pela regra única e na ordem certa — não escala o fiscal com folga na ficha mesmo com a escala semanal escalando (o caso real), nem quem tem folga na escala **com a ficha omissa**; e **escala** quando a ficha afirma outro dia e só a escala velha diz folga (ADR 0023) | 4 |
| `escalados-feriado.spec.ts` | `escaladosDoDia` em feriado: horário de domingo (operador e fiscal), folga inalterada, fallback sem `entradaDom` e sem `FeriadosService` | 8 |
| `coerencia-escalados-escala.spec.ts` | **Coerência entre `escaladosDoDia` e a [escala publicada](escala-exportacao.md):** dia normal, folga, falta do operador, **falta do fiscal** (a que a publicada não via, por causa da tradução de ids), exceção de horário, convocação em dia de folga, os dois casos que impedem o laço da revalidação, e a **escala semanal velha** nas duas direções (mais cedo → passa a usar a ficha; mais tarde → não adianta a cobrança) | 10 |
| `integridade-escala.spec.ts` | **Diagnóstico ficha ↔ escala semanal** (`npm run integridade`): horário divergente, folga divergente, **ficha vazia com escala sobrevivente**, ficha sem escala, horário pela metade, entradas duplicadas, inativos ignorados e escala antiga ligada só pelo `funcionarioId` | 9 |
| `hora-esperada-fiscal.spec.ts` | A **regra conservadora** da hora cobrada: as duas pontas da discordância, a exceção que vence, o feriado que não entra na comparação, ficha sem turno (não se cobra), fiscal sem ficha, horas ilegíveis — e a **propriedade central**, varrida sobre uma grade: nunca devolve hora mais cedo do que a escala cobrava antes | 11 |
| `escala-colaborador.spec.ts` | Geração da escala semanal a partir da ficha (Seg–Qui, Sex–Sáb, folga, domingo) + o **desempate de duplicadas**: os dois leitores usam a primeira entrada, e a exceção segue prevalecendo | 6 |
| `integridade-vinculo.spec.ts` | Detecção de vínculos órfãos fiscal ↔ ficha (Fase 4) | 6 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `fiscais.service.ts` concentra status, painel, jornada, extras, ranking e
  contexto — forte candidato a extrair sub-serviços. (Tamanho atual em
  [estado-e-métricas](../08-gestao/estado-e-metricas.md).)
- ⚠️ **`escaladosDoDia` é a terceira forma de responder "quem trabalha hoje".** O
  Quadro de Operadores e a escala publicada já convergiram em
  `montarLinhaEscala`; esta não. O que ainda a separa:
  1. **A fonte do horário do fiscal — resolvida pela via conservadora.** A ficha é
     a fonte (Opção A) e a escala semanal é um **derivado** que fica velho quando
     `sincronizarEscalaFiscal` sai por uma das suas guardas. Em vez de trocar a
     fonte de uma vez (o que **adiantaria** a cobrança de quem tem a ficha mais
     cedo, criando faltas novas), a detecção passou a usar a **hora mais tardia**
     das duas. Nunca cria falta que antes não existia; as divergências continuam
     aparecendo em `npm run integridade` para o gestor resolver na ficha. A
     unificação completa (ler só a ficha) fica para quando os dados estiverem
     coerentes.
  2. **A forma.** Whitelist sem estado nem saída, contra uma tabela de estados.
     Um fiscal **sem `EscalaEntry`** para o dia simplesmente não existe aqui (não
     sai como folga: não sai), então nunca recebe falta automática.
  3. **A identidade.** `EscaladoDia` carrega o par `(pessoaId, tipoPessoa)` porque
     o cron precisa gravar a falta com o id certo — `Fiscal.id` para fiscais,
     `Colaborador.id` para os demais. `LinhaEscala` só conhece a ficha, então uma
     unificação total teria de levar essa tradução por fora do domínio puro.
- ⚠️ **A tradução de ids esconde bugs de leitura.** A falta de um fiscal é gravada
  com `Fiscal.id` em `Ausencia.pessoaId` e o vínculo com a ficha em
  `Ausencia.colaboradorId`. Quem procurar as ausências só por uma das colunas
  perde metade dos casos — foi assim que a escala publicada passou a dizer
  "trabalha" sobre um fiscal que faltou. Qualquer consulta nova a `Ausencia` deve
  olhar **as duas chaves**.
- ⚠️ **Listar pessoas por `funcao` apaga o passado de quem mudou de cargo.** O
  painel do dia e as horas extras do mês buscavam as fichas por
  `funcao: { in: FUNCOES_PONTO_NAO_FISCAL }` e só depois as batidas. Quando um
  operador é promovido a fiscal, ele sai desse filtro e **desaparece dos dias em
  que ainda era operador** — inclusive das horas extras já trabalhadas.

  A ordem foi invertida: primeiro as batidas do período, depois as fichas de quem
  bateu (`where: { id: { in } }`, sem filtro de função), agrupando por
  `colaboradorId ?? pessoaId` — a ficha é a chave estável ao longo das mudanças de
  cargo. Ver [ADR 0020](../02-arquitetura/decisoes/0020-mudanca-de-funcao-preserva-o-ponto.md).
- ⚠️ **Coexistência de logs:** o status vem das batidas do Relógio de Ponto com
  fallback ao log legado (`RegistroPontoFiscal`); manter a ponte consistente é
  crítico para o painel não divergir.
- ⚠️ **Fuso de Brasília em toda parte:** cálculos e crons dependem do dia civil
  UTC-3; qualquer novo caminho precisa usar os helpers de `common/datas` para
  não gravar no dia errado.
- 🔧 **Modelos em transição (Fase 4):** `Fiscal` convive com o Cadastro
  Unificado de colaboradores — ver
  [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md).
  O `RegistroPontoFiscal` grava o `colaboradorId` em registros **novos**
  (dual-write / fase *expand*, Passo 4.2) e os **históricos** já foram
  preenchidos por backfill (migração `9zzf`, Passo 4.4). O verificador
  `npm run integridade` aponta qualquer vínculo órfão remanescente antes de
  aposentar o `fiscalId`. **A.5 (identidade exposta):** o painel, a jornada, o
  `meuResumo`, o `horasExtrasMes` e o evento WebSocket `fiscal:status` já enviam
  `colaboradorId` **ao lado** do `fiscalId` (aditivo), para o app migrar a
  identidade sem quebrar apps instalados.
