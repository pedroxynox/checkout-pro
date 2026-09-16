# ADR 0023 — A folga é a da ficha; a escala semanal não vota contra ela

- **Status:** aceita
- **Data:** 2026-09-16
- **Contexto:** Escalas, cadastro de colaboradores, promoção de função, login do app
- **Relatado por:** o dono do projeto, com dois casos concretos (ver abaixo)

## Contexto

Dois relatos da operação, no mesmo dia:

> "A fiscal **Yannelyt** está para folgar na **quinta-feira**, como diz no
> cadastro dela. Então por que a seção de Escalas considera que ela folgava nas
> **quartas**?"

> "O colaborador **Diones** passou de operador a fiscal. Até aí tudo bem, mas na
> Escala ele **não aparece de folga nas quartas** — e antes aparecia para
> **trabalhar** nas quartas, sendo que quarta é a folga dele."

Os dois casos parecem o mesmo bug e **não são**. Foram investigados até a causa, e
o que apareceu no caminho foram nove defeitos — seis na folga/escala e três no
login, todos na mesma costura: **a promoção de função**.

## O desenho que produz os dois casos

A folga semanal de uma pessoa está escrita em **duas** tabelas:

| Fonte | Onde | Quem escreve | Quem lê |
|---|---|---|---|
| **A ficha** | `Colaborador.folgaDiaSemana` | o cadastro (Controle → Colaboradores) | a escala publicada, o Quadro, a jornada |
| **A escala semanal** | `EscalaEntry.folga` por `diaSemana` | ninguém, diretamente — é **derivada** da ficha | a detecção automática de falta, o painel de Fiscais |

A escala semanal é um **derivado**: `sincronizarEscalaFiscal` a regenera a partir
da ficha a cada cadastro, edição ou reativação. E ela só existe para **fiscais** —
para operadores e supervisores a ficha é a única fonte.

`FolgaService` (a regra única de folga) resolve as duas com um **OU**: se qualquer
fonte diz que a pessoa descansa, é folga. O viés era deliberado, e a razão continua
boa: entre "deixar de cobrar o ponto de alguém" e "marcar falta em quem estava
descansando", o segundo erro é muito mais grave.

**O erro do desenho é outro:** um OU trata as duas fontes como **pares**. Elas não
são pares. Uma é a fonte; a outra é a projeção dela. Uma projeção velha não pode
somar um dia de descanso que a fonte não afirma — e é exatamente isso que
acontecia.

## Caso 1 — Yannelyt: a escala velha somava uma folga

A ficha dela diz **quinta** (4). Uma linha antiga de `escala_entries` diz **quarta**
(3) com `folga = true`. Pelo OU, as duas valem: ela aparece de folga **na quarta e
na quinta**. O que o dono viu foi a quarta — a que não devia estar ali.

Por que a linha velha sobrevive: a sincronização apaga as linhas gerais com
`deleteMany({ funcionarioId: fiscal.id, especial: false })`. Só isso. Linhas
gravadas sob **outro** `funcionarioId` — o id da era-operador, ou um segundo
registro `Fiscal` criado por `garantirFiscal` ao casar por nome — nunca são
apagadas. E `FolgaService` continua encontrando-as, porque indexa a folga pelas
**duas** identidades.

Não há erro de dia da semana em nenhum lugar do sistema. Isso foi auditado:
`getDay()` (hora local) não aparece nenhuma vez no código; tudo usa `getUTCDay()`
sobre a meia-noite UTC do dia civil; os catorze arrays de nomes de dia usam
`0 = domingo`; e o seletor do cadastro envia o próprio índice. Quinta é 4 nas duas
pontas. **O desencontro é de dados, não de índice.**

## Caso 2 — Diones: a ficha nunca disse quarta

Este é o mais importante, e o relato do próprio dono o resolve: **antes** da
promoção ele já aparecia trabalhando nas quartas. Antes da promoção ele era
operador — e para um operador a **ficha é a única fonte de folga**. Se a escala o
mostrava trabalhando, é porque a ficha **não diz quarta**: `folgaDiaSemana` está
nulo (ou com outro dia).

A promoção não causou o problema; ela apenas o tornou mais visível, porque a
partir dela o sistema passou a **escrever aquela ausência de folga** como uma
afirmação — `gerarEscalaSemanalFiscal` emite uma linha "trabalha" para a quarta — e
essa linha passou a alimentar a detecção automática de falta.

E nenhuma migração jamais preencheu `Colaborador.folgaDiaSemana`:
`9p_cadastro_colaboradores` criou a coluna nula e `9s_colaboradores_de_fiscais`
criou fichas selecionando só `id, matricula, nome, funcao, usuarioId`. A folga
original dos operadores ficou em `operador_turnos.folgaDiaSemana` (uma coluna
`NOT NULL`, hoje **[DEPRECADA]**, que ninguém lê). Fichas antigas nasceram sem
folga, em silêncio.

**Uma ficha sem folga é uma pessoa que trabalha sete dias por semana aos olhos do
sistema, e nada avisava.** Esse é o defeito de verdade.

## Decisão

### 1. Quando a ficha afirma um dia de folga, a ficha decide — sozinha

A regra de folga passa a ser, em ordem:

1. **Convocação** (`especial` e `folga = false`) → **trabalha**. Inalterado: é o
   registro mais específico e mais recente sobre aquele dia, e é assim que se chama
   alguém no descanso.
2. **Folga marcada como exceção** (`especial` e `folga = true`) → **folga**.
   Inalterado: é o gestor concedendo um dia, à mão.
3. **A ficha afirma `folgaDiaSemana`** → a ficha decide, e **a escala semanal
   geral não é consultada**. É a mudança.
4. **A ficha é omissa** → a escala semanal geral vale (o OU sobrevive aqui).
5. Rodízio de domingo, como antes.

O passo 3 é o mesmo raciocínio que
[`hora-esperada-fiscal.ts`](../../03-atlas-backend/fiscais.md) já aplicou à **hora**
quando as duas fontes discordavam. Falta só a folga, e é a mesma doença.

O passo 4 é o que **preserva** o viés conservador onde ele ainda protege alguém:
sem nada na ficha, uma folga escrita na escala continua valendo, porque não há
fonte que a contradiga.

**O preço, dito com clareza:** quem hoje é dispensado de bater ponto pelo dia
velho da escala passa a ser cobrado nesse dia. Foi pesado contra o outro lado, e a
conta fecha: a escala publicada — o documento que a equipe recebe — sempre mostrou
a folga da **ficha**. Depois desta mudança o sistema cobra exatamente o dia que a
equipe lê. Antes havia um dia em que ninguém era cobrado e ninguém sabia.

### 2. Escalas passa a perguntar pela pessoa inteira

`FolgaService` documenta no próprio contrato que se deve consultar a pessoa em
**todas** as identidades (`Fiscal.id` e `Colaborador.id`) — "consultar só uma delas
é a origem de metade dos casos em que a regra não pegava". A escala publicada
passava **uma**. Passa a resolver o vínculo e a perguntar pelas duas, como o
carregamento de ausências do mesmo arquivo já fazia.

O mesmo vale para as exceções de horário: as linhas sem `colaboradorId` (escalas
antigas) eram descartadas por não se saber de quem eram. Agora o vínculo
`Fiscal → Colaborador` resolve o dono, e a exceção é aplicada a quem é dela.

### 3. Mudar de função limpa a escala da função anterior

- A sincronização apaga as linhas gerais por **todas** as identidades da pessoa,
  não só pelo `Fiscal.id` corrente. É o que remove a linha velha do caso 1.
- **Deixar de ser fiscal apaga a escala de fiscal.** Hoje a função sai pela porta
  (`if (funcao !== 'FISCAL') return`) antes de qualquer limpeza, e a escala fantasma
  continua alimentando a folga e a falta automática de alguém que já não é fiscal.
- As **exceções** (`especial`) continuam intocadas: são decisões humanas por dia,
  não derivadas da ficha.

### 4. A folga pode ser apagada

O formulário enviava `folgaDiaSemana: folga ?? undefined` e o servidor só atribuía
quando `!== undefined`. Efeito: a folga podia ser **trocada**, nunca **esvaziada**.
Quem marcasse um dia por engano não tinha como desfazer. Passa a enviar `null`
explícito, e o servidor a aceitá-lo.

### 5. Uma ficha sem folga aparece na tela

É o que resolve o caso 2 e o que impede o próximo. A Escala passa a avisar, com
nome e função, quem está **sem dia de folga no cadastro** — e a dizer o que isso
significa na prática: essa pessoa é escalada todos os dias e pode receber falta
automática num dia em que estava descansando.

Não bloqueia o cadastro. O padrão da casa é validar só o que mudou, "para não
travar a edição de outros campos de cadastros antigos" — e há fichas legítimas sem
folga (gerência não entra na escala). Avisar é o que respeita isso e ainda assim
não deixa o dado faltando passar em silêncio.

### 6. Perder a função perde o acesso ao app

Três defeitos de login, todos na mesma causa: **`autenticar()` só olha
`usuarios.login` e a senha.** Nunca consulta a ficha. Então:

- **descer de fiscal a operador não tira o acesso.** `perfilDaFuncao('OPERADOR')`
  é nulo, e a atualização faz `if (perfilAcesso) upd.perfil = …` — o perfil fica
  `FISCAL`. A pessoa continua entrando no app com os poderes de fiscal;
- **desligar alguém não tira o acesso.** `definirAtivo(false)` mexe só na ficha. Um
  desligado continua entrando;
- **mudar de função não encerra a sessão aberta.** `tokenVersion` é incrementado por
  mudança de senha e de permissões, mas não por mudança de função — e o perfil que
  vale numa requisição vem do token. O crachá antigo continua abrindo a porta.

A decisão: **a ficha manda no acesso, como manda na folga.** O login é recusado
quando a ficha ligada a ele está **inativa** ou tem uma função **sem acesso ao
app**; e qualquer mudança de função ou desligamento **encerra as sessões abertas**
da pessoa.

Duas salvaguardas: contas **sem ficha ligada** (o administrador do sistema, o
importador) seguem exatamente como hoje — a regra só se aplica a quem tem ficha; e
nada é apagado. Não se remove o usuário nem o histórico: promover a pessoa de volta,
ou reativá-la, devolve o acesso na hora.

## O que NÃO se decidiu aqui

- **Não se apagam dados existentes por migração.** As linhas velhas de
  `escala_entries` deixam de votar (decisão 1) e serão limpas na próxima vez que a
  ficha for salva (decisão 3). Uma migração que reescrevesse a escala de todos
  mexeria no que a detecção de falta lê para o time inteiro, para consertar um
  punhado de linhas que a regra nova já neutraliza.
- **Não se unificou `Fiscal` com `Colaborador`.** É a dívida do
  [ADR 0020](0020-mudanca-de-funcao-preserva-o-ponto.md) e segue aberta. O que se
  fez aqui foi honrar o contrato das duas identidades onde ele estava sendo
  quebrado.
- **Não se criou índice único em `escala_entries`.** É o que tornaria a ausência de
  duplicatas estrutural, mas `POST /escala` deduplica só por `funcionarioId` e
  passaria a falhar. Fica registrado como dívida.
- **Não se preencheu `folgaDiaSemana` a partir de `operador_turnos`.** A tabela
  está deprecada e o dado pode estar tão velho quanto o problema; adivinhar a folga
  de alguém a partir dela seria pior do que a decisão 5, que pede o dado a quem
  sabe.

## Consequências

**A favor:**

- A Escala passa a mostrar **um** dia de folga por pessoa: o do cadastro. É o
  documento e a verdade dizendo a mesma coisa.
- O dia que o sistema cobra é o dia que a equipe lê.
- Uma ficha sem folga deixa de ser invisível.
- Um desligado ou rebaixado deixa de entrar no app.
- Promoção e rebaixamento passam a deixar o estado limpo, em vez de acumular
  escalas fantasmas a cada mudança.

**Contra, e assumido:**

- Quem estava sendo dispensado no dia velho passa a ser cobrado nele. É o efeito
  desejado, mas é uma mudança de comportamento que aparece **na primeira semana** —
  e aparece para quem tem ficha e escala em desacordo, isto é, exatamente os casos
  que estavam errados.
- A folga de Diones **continua faltando** depois deste PR: o sistema não pode
  inventar um dado que nunca teve. O que muda é que agora ele **avisa**, com o nome
  dele na tela, em vez de escalá-lo calado.

## O que o dono precisa fazer depois deste PR

1. Abrir Escalas e ler o aviso "sem dia de folga no cadastro". Diones deve estar
   nele.
2. Para cada nome da lista: Controle → Colaboradores → editar → marcar o dia de
   folga → salvar. Salvar já regenera a escala e limpa as linhas velhas.
3. Conferir Yannelyt: deve aparecer de folga só na quinta.
