> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-18 · **Cobre:** `backend/src/fiscais/`

# Módulo: `fiscais`
> **ADR 0026 — a ficha é a única fonte do horário.** Em duas etapas:
> a **exceção de horário** (`EscalaEntry.especial`) foi removida, junto com a
> **convocação** e a **folga concedida** que dependiam dela (2026-09-17); e a
> **hora cobrada** passou a sair da ficha, não mais da cópia semanal
> `EscalaEntry` (2026-09-18). A regra conservadora "vale a hora mais tardia"
> (`hora-esperada-fiscal.ts`) deixou de existir com a segunda etapa. Trechos
> abaixo que descrevam esses mecanismos valem como histórico. Ver
> [ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md).


## 1. Propósito
Controle de jornada dos fiscais: os três estados (Disponível / Intervalo / Fora
de expediente), o painel em tempo real, o log de jornada (tempos e horas extras),
os alertas automáticos e a **escala de trabalho** (apenas a geral, derivada da ficha).

## 2. Responsabilidades e limites
- **Faz:** registra o status do fiscal (ponto) e calcula a jornada do dia;
  painel em tempo real (WebSocket); log de jornada, jornada de equipe, horas
  extras do mês, ranking e previsão; falta e folga do dia; alertas automáticos
  (intervalo longo, cobertura, lembretes de horário); escala geral, horário
  escala efetiva e consolidada; vínculo Fiscal → Colaborador.
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
| `fiscais.service.ts` | Regras de aplicação: status, jornada, extras, painel | 1785 |
| `fiscais.domain.ts` | Regras puras: status atual, jornada, transições | 150 |
| `fiscais.errors.ts` | Erros de domínio (mapeados para HTTP) | 47 |
| `fiscais.eventos.ts` | Barramento de eventos de status (produtor↔gateway) | 38 |
| `fiscais.gateway.ts` | Gateway WebSocket do painel em tempo real | 92 |
| `fiscais-horario.service.ts` | Cron: lembretes de horário aos fiscais (turno e conta resolvidos pela ficha) | 194 |
| `fiscais-alertas.service.ts` | Cron: alertas de intervalo longo e cobertura | 416 |
| `escala.controller.ts` | Rota da escala consolidada (só leitura) | 39 |
| `conferencia-escala.service.ts` | **Conferência de escala**: monta o diagnóstico das fichas para a API (só leitura) | 101 |
| `escala.service.ts` | Escala consolidada de um dia, resolvida na ficha | 159 |
| `escala.domain.ts` | Regras puras: formas da resposta + geração da cópia semanal a partir da ficha | 116 |
| `colaborador-vinculo.ts` | Regra pura: mapeia fiscal → colaborador (ficha) | 84 |
| `identidades.consulta.ts` | **A única** carga das identidades de uma pessoa (ficha + ids de fiscal), nos dois sentidos | 85 |
| `integridade-vinculo.ts` | Regra pura: detecta vínculos órfãos fiscal ↔ ficha | 96 |
| `integridade-escala.ts` | Regra pura do diagnóstico: lacunas da ficha + distância até a cópia semanal | 476 |
| `turno-fiscal.ts` | **Regra pura do turno**: junta fiscal + conta + ficha, e resolve o horário do dia | 229 |
| `turno-fiscal.consulta.ts` | A **única** carga do trio `Fiscal` + `Usuario` + `Colaborador` para resolver turnos | 84 |
| `dto/fiscais.dto.ts` | Validação de entrada (status e escala) | 59 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `fiscais`](../05-referencia-dados/api-http.md).
> As rotas de escala (`/escala/*`) e as de fiscais (`/fiscais/*`) fazem parte
> deste módulo.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /escala` | `ESCALA_EDITAR` | Cadastra a escala geral de um funcionário num dia. |
| `GET /escala/consolidada/:diaSemana` | `ESCALA_VISUALIZAR` | Escala consolidada do dia (domingo vem do rodízio). |
| `GET /escala/:funcionarioId/efetiva` | `ESCALA_VISUALIZAR` | Escala efetiva do funcionário no dia. |
| `GET /fiscais/painel` | `FISCAIS_STATUS` | Painel de todos os fiscais com o status atual. |
| `GET /fiscais/conferencia-escala` | `OPERADORES_CRUD` | **Conferência de escala**: onde a ficha e a escala semanal discordam, e quem seria afetado pela etapa 2. Só leitura. |
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

> **Removido (ADR 0026).** O parágrafo abaixo descreve as **exceções de horário**,
> que deixaram de existir. Fica como histórico.

**Exceções de horário** (`EscalaEntry.especial`) valiam também para operadores e
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

**A hora esperada é a da FICHA, para fiscais e operadores** (ADR 0026, etapa 2).
Os dois ramos chamam `entradaEsperadaNoDia` — a mesma função da escala publicada —,
então a hora cobrada é, por construção, a hora que a equipe recebeu na escala.
Nenhum cálculo intermediário: `escaladosDoDia` consome a hora que a escala
consolidada resolveu e a cobra.

Aqui havia uma regra conservadora: quando a ficha e a cópia semanal discordavam,
valia a hora **mais TARDIA**. Ela existia para que trocar a fonte não criasse falta
em ninguém, e cumpriu esse papel — mas em produção a cópia era a mais tardia em
sete dos nove casos divergentes, de 40 minutos a 1 hora. Ou seja: era ela que
decidia, e o atraso real dessas sete pessoas não existia para o sistema. A
Conferência de escala nomeou as sete, e a regra saiu junto com
`hora-esperada-fiscal.ts`.

**Sem turno afirmado pela ficha, não se cobra ponto.** Vale para os três casos em
que a ficha não afirma nada, e em todos a pessoa sai da lista em vez de entrar com
uma hora inventada:

| Situação | Efeito | Por quê |
|---|---|---|
| Ficha **sem horário** para o dia | fora da lista | Se a ficha não afirma um turno, o sistema não tem base para afirmar uma expectativa. Era o caso "ficha vazia com cópia do seed sobrevivente", em que se cobrava o ponto por um dado que ninguém revisou. |
| Fiscal **sem ficha** resolvida | fora da lista | Sem fonte não há hora. A Conferência de escala é onde isso aparece; em produção não há nenhum caso. |
| **Domingo sem âncora** do rodízio | fora da lista | Sem o ponto de partida não se sabe quem trabalha neste domingo, e afirmar um turno criaria falta em quem descansava. |

**No feriado vale o horário de DOMINGO da ficha** (`entradaDom`), a mesma regra que
a jornada aplica ao pagamento e a escala publicada ao turno. Quem não tem horário de
domingo cadastrado mantém o horário normal do dia, em vez de desaparecer da equipe.
Sem `FeriadosService` (injetado com `@Optional()`), o dia é tratado como normal. A
folga **não** muda em feriado (regra 7 de [`escala-domingo`](escala-domingo.md)).

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
Um método só, e é de leitura: `escalaConsolidada(diaSemana, dataISO?, contexto?)`
— para cada fiscal, o turno que a **ficha** prevê no dia (entrada, saída, folga),
com nome e ficha resolvidos.

- **Com `dataISO`** valem o feriado, a posição no rodízio de domingo e as férias do
  dia (via `FeriasService`). **Sem ela**, a resposta é o turno típico daquele dia da
  semana — a grade semanal não aplica férias nem feriado, porque eles são por dia.
- **`contexto`** permite a quem já resolveu o feriado e a âncora passá-los adiante.
  Quem faz isso é a equipe do dia (`escaladosDoDia`), e não é só economia de
  consulta: garante que os dois ramos dela respondam ao **mesmo** feriado e à
  **mesma** âncora.
- Quem não tem turno no dia aparece como `FOLGA` em vez de desaparecer: a pergunta
  que esta lista responde é "quem trabalha hoje?", e a ausência de uma linha não
  distingue "descansa" de "não sei".

Três coisas saíram daqui na etapa 2 da ADR 0026: `cadastrarEscala` (POST `/escala`,
que gravava uma hora sem efeito sobre a cobrança — pior do que rota nenhuma),
`resolverEscalaEfetiva` (GET `/escala/:id/efetiva`, sem consumidor) e a leitura de
horários da cópia semanal.

### `turno-fiscal.ts` + `turno-fiscal.consulta.ts`
A leitura do turno de um fiscal, num lugar só. Resolvê-lo exige três tabelas —
`Fiscal` (a identidade da batida), `Usuario` (a conta que liga) e `Colaborador` (a
ficha, que é a fonte) —, e sete caminhos montavam esse trio por conta própria.
Bastava um `select` esquecido para um deles resolver um turno pela metade.

- `fiscaisComFicha(...)` — a junção. **Fiscais sem ficha ficam de fora**, pela mesma
  regra que já valia para operadores. Aceita `vinculosGravados`, o resgate de quem
  teve a conta desvinculada (ver os riscos).
- `turnoDoDia(ficha, dia, ancora, ehFeriado)` — entrada e saída juntas, delegando a
  `entradaEsperadaNoDia`/`saidaEsperadaNoDia`.
- `dataDeReferencia(diaSemana)` — um dia civil qualquer com aquele dia da semana,
  para as consultas que só conhecem "quinta" e não uma data. Deixa explícito que ali
  não há feriado nem rodízio a considerar.
- `linhasDaSemana(ficha)` — a semana em texto, para a assistente e a Cluby.

### Coerência ficha ↔ escala semanal — **Conferência de escala**

> **Duas vias, uma apuração.** O diagnóstico é o mesmo (`detectarEscalasIncoerentes`,
> puro) e responde por dois caminhos:
>
> - `GET /fiscais/conferencia-escala` (`OPERADORES_CRUD`) → a tela **Conferência de
>   escala**, em Centro de Controle. É a via da gestão.
> - `npm run integridade` → o comando de terminal, que também confere os vínculos
>   órfãos. É a via técnica.
>
> Antes só existia o comando, com acesso ao banco de produção — fora do alcance de
> quem precisava da resposta ("por que a escala mostra um horário que não está na
> ficha?"). Um diagnóstico que só o time técnico consegue ler não é um diagnóstico.

#### O que ele apura

Este diagnóstico autorizou a **etapa 2** da
[ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md): rodado em
produção, nomeou as 7 pessoas (de 11 fiscais ativos) cuja cópia semanal estava mais
tardia que a ficha. Feita a troca, o assunto dele mudou — a hora cobrada é a da
ficha, então uma diferença com a cópia não afeta mais ninguém. O que importa agora
são as **lacunas da ficha**, porque ela virou a única fonte e já não há nada por
baixo para cobrir um vazio:

| Campo | Pergunta que responde |
|---|---|
| `incoerentes[].fichaVazia` | **Quem está fora do controle de ponto?** Sem horário na ficha não há hora esperada em dia nenhum: a pessoa não entra na equipe do dia e nunca aparece atrasada ou faltante. O caso mais grave. |
| `horarioIncompleto` | **Quem tem um bloco pela metade?** Entrada sem saída (ou o inverso) em Seg–Qui ou Sex–Sáb: aqueles dias desaparecem da escala em silêncio. |
| `domingoSemHorario` | **Quem trabalha domingo sem hora?** Está no rodízio (`grupoDomingo`) e não tem `entradaDom`/`saidaDom` — e, por regra, também fica sem hora em **feriado**. |
| `semFolgaNaFicha` | **Quem perderia o descanso quando a cópia sair?** Ficha sem `folgaDiaSemana` que hoje folga por uma linha da cópia semanal (ADR 0023, passo da ficha omissa). É a última decisão que ainda depende dela. |
| `fichasComLacuna` + `nomesComLacuna` | O resumo, com nomes: quantas fichas têm alguma das lacunas acima. |
| `dias[].minutosDeDiferenca` | **Onde a cópia ficou para trás.** Informativo: mede a distância entre as duas horas, não um erro de cobrança. |

#### Detalhe da apuração

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
  entradas gerais. As **exceções** (`especial`) deixaram de existir — antes eram decisões
  humanas por dia, não derivadas da ficha.

Isso **importava** porque as duas pontas tinham consumidores diferentes: a detecção
automática de falta lia a cópia semanal e a escala publicada lia a ficha. Onde
discordavam, o time lia uma hora e o sistema cobrava outra. Desde a etapa 2 da ADR
0026 as duas leem a ficha, e a cópia velha não cobra nada de ninguém — o que resta
é o valor de diagnóstico: onde a cópia ficou para trás, a ficha provavelmente
passou por uma edição que merece um olhar.

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
> (um pegava a primeira linha, outro a última), então
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
- Escala: `turnoDoDia`, `fiscaisComFicha`, `dataDeReferencia`, `linhasDaSemana`,
  `gerarEscalaSemanalFiscal`,
  `temEscalaDefinida` (o cadastro é a fonte única — Opção A).
- `mapearFiscalColaborador(...)` → une o fiscal à ficha do colaborador por conta
  de acesso ou, em fallback, por matrícula.
- `detectarVinculosOrfaos(fiscais, usuarios, fichas)` → diagnóstico de
  integridade (Fase 4): lista fiscais sem ficha canônica e fichas FISCAL sem
  registro de fiscal. Base do verificador `npm run integridade`.

## 7. Estados e enums
- `StatusFiscal`: `DISPONIVEL` · `INTERVALO` · `FORA_EXPEDIENTE`. O status atual
  é sempre o da última transição; toda mudança gera aviso ao gestor.
- `EscalaEfetiva`: um `TurnoEfetivo` (os horários do dia) **ou** `'FOLGA'`.
- Jornada esperada: Seg–Qui 7h, Sex–Sáb 8h, Dom 7h20 (o excedente é hora extra).

## 8. Dados que o módulo toca
- **Escreve:** `RegistroPontoFiscal` (log de status, agora com `colaboradorId`
  em registros novos), `Ausencia` (falta
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
6. **O horário é o da ficha** — não há exceção que o sobreponha (ADR 0026).
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
| `fiscais.service.spec.ts` | Status, painel, jornada, fiscal histórico e vínculo `colaboradorId` no ponto/falta/status (Fase 4) | 17 |
| `status-operador.spec.ts` | Painel inclui operadores; `publicarStatusColaborador` emite o evento pela ficha | 2 |
| `fiscais.properties.spec.ts` | Status atual, transição, jornada e a **Property 20**: o turno de um dia é sempre um horário da própria ficha, ou nenhum (property-based) | 5 |
| `fiscais.controller.spec.ts` | Rotas do próprio fiscal e log de jornada | 4 |
| `fiscais.gateway.spec.ts` | Broadcast do painel via WebSocket (integração) | 3 |
| `fiscais.painel-status.spec.ts` | Status do painel a partir das batidas | 2 |
| `fiscais-alertas.intervalo.spec.ts` | Alerta de intervalo longo | 2 |
| `jornada-marcacoes.spec.ts` | Jornada a partir das marcações do dia | 2 |
| `integridade-vinculo.ts` + `integridade-escala.ts` | Regras puras dos dois diagnósticos de `npm run integridade` (vínculos e coerência de escala) | — |
| `turno-fiscal.ts` | Regra pura: o turno de um fiscal num dia, sempre a partir da ficha | — |
| `escala-inativo.spec.ts` | Escala de colaborador inativo | 1 |
| `escalados-ferias.spec.ts` | `escaladosDoDia` exclui quem está de férias | 2 |
| `escalados-folga.spec.ts` | **Regressão:** `escaladosDoDia` respeita a folga pela regra única e na ordem certa — não escala o fiscal com folga na ficha mesmo com a escala semanal escalando (o caso real), nem quem tem folga na escala **com a ficha omissa**; e **escala** quando a ficha afirma outro dia e só a escala velha diz folga (ADR 0023) | 4 |
| `escala.service.spec.ts` | **A escala consolidada vem da ficha**: a hora da cópia semanal é ignorada nos dois sentidos, folga da ficha, dia sem horário, feriado com o horário de domingo, rodízio de domingo (com e sem âncora), desligado, férias, fiscal sem ficha, resgate pelo vínculo gravado e a consulta por dia da semana | 12 |
| `escalados-feriado.spec.ts` | `escaladosDoDia` em feriado: horário de domingo do operador, folga inalterada, fallback sem `entradaDom`, sem `FeriadosService` e a **delegação** aos fiscais (a hora da consolidada é a cobrada; FOLGA e "sem turno" saem da lista) | 8 |
| `coerencia-escalados-escala.spec.ts` | **Coerência entre `escaladosDoDia` e a [escala publicada](escala-exportacao.md)**, agora com o `EscalaService` real em vez de um dublê: dia normal, folga, falta do operador, **falta do fiscal** (a que a publicada não via, por causa da tradução de ids), os dois casos que impedem o laço da revalidação, e a **cópia semanal desatualizada nos dois sentidos** — mais cedo e mais tarde, as duas sem efeito sobre a cobrança | 9 |
| `integridade-escala.spec.ts` | **Diagnóstico das fichas**: **ficha vazia** (a pessoa fica fora do controle de ponto), horário pela metade, **rodízio de domingo sem horário** (falta entrada, saída ou ambas), ficha **sem dia de folga** que hoje descansa pela cópia, distância até a cópia semanal nos **dois sentidos**, folga divergente sem distância a medir, ficha sem cópia, duplicadas, inativos ignorados e cópia antiga ligada só pelo `funcionarioId` | 16 |
| `escala-colaborador.spec.ts` | Geração da cópia semanal a partir da ficha (Seg–Qui, Sex–Sáb, folga, domingo) | 4 |
| `integridade-vinculo.spec.ts` | Detecção de vínculos órfãos fiscal ↔ ficha (Fase 4) | 6 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `fiscais.service.ts` concentra status, painel, jornada, extras, ranking e
  contexto — forte candidato a extrair sub-serviços. (Tamanho atual em
  [estado-e-métricas](../08-gestao/estado-e-metricas.md).)
- 🔧 **A tabela `EscalaEntry` sobrevive sem decidir horário** (etapa 3 da ADR
  0026). Nada lê mais uma hora dela, mas ela guarda duas coisas que ainda não têm
  outro lugar: **`intervaloMin`** (a duração do intervalo do turno, usada pelas
  sugestões de "não retornou do intervalo" em [`incidencias`](incidencias.md), e a
  ficha não tem campo para ela) e o **vínculo `funcionarioId → colaboradorId`**, o
  único jeito de reconhecer a ficha de um fiscal que teve a conta de acesso
  desvinculada — sem ele essa pessoa desaparece da escala, e se estiver desligada
  escapa do filtro de inativos. `carregarFiscaisComFicha` lê da cópia **apenas o
  vínculo**. Enquanto a tabela existir, `sincronizarEscalaFiscal` continua a
  regenerá-la: congelá-la com dados antigos seria pior.
- 🔧 **A regra de folga ainda aceita a cópia semanal quando a ficha é omissa**
  (`FolgaService`, passo 2 — ADR 0023). É a última decisão que depende dela. Cortar
  esse passo hoje não traria benefício e escalaria sete dias por semana quem tem a
  ficha incompleta; a Conferência de escala aponta essas fichas em
  `semFolgaNaFicha`, e o lugar de corrigir é o cadastro.
- ⚠️ **`escaladosDoDia` é a terceira forma de responder "quem trabalha hoje".** O
  Quadro de Operadores e a escala publicada já convergiram em
  `montarLinhaEscala`; esta não. O que ainda a separa:
  1. ~~**A fonte do horário do fiscal.**~~ **Resolvido** (ADR 0026, etapa 2): as
     três formas leem a ficha, pelas mesmas funções
     (`entradaEsperadaNoDia`/`saidaEsperadaNoDia`). A hora cobrada é a hora
     publicada, por construção.
  2. **A forma.** Whitelist sem estado nem saída, contra uma tabela de estados.
     Um fiscal **sem horário na ficha** para o dia simplesmente não existe aqui (não
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
