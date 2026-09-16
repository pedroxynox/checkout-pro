# ADR 0024 — O contrato de experiência é da pessoa, não do cargo

- **Status:** aceita
- **Data:** 2026-09-16
- **Contexto:** Contratos de experiência, promoção de função
- **Decidido pelo dono do projeto:** "aplica a todos"

## Contexto

Relato da operação, no mesmo dia em que se investigavam os defeitos do
[ADR 0023](0023-folga-a-ficha-manda.md):

> "Por que ao ascender o Diones **também desapareceram os contratos dele** da aba
> Contratos que está em Colaboradores?"

Ele havia sido promovido de operador a fiscal. E desapareceu, sim — no mesmo
instante em que a promoção foi salva.

## A causa

`ContratosService.listar` filtrava `funcao: 'OPERADOR'`. Nada mais. No momento em
que a promoção gravou `funcao = 'FISCAL'`, a ficha dele deixou de casar com o
filtro e o card sumiu da tela.

**Nada foi apagado.** A data de admissão e as decisões de marco continuavam no
banco, intactas — apenas inalcançáveis por aquela tela. Era a diferença entre
perder um dado e esconder um dado, e o efeito na tela é o mesmo para quem olha.

O filtro não era um descuido: o escopo "operadores" está escrito no
[ADR 0008](0008-contratos-de-experiencia.md), na documentação do módulo e num
comentário do próprio serviço — a premissa era que o contrato de experiência é
"coisa da frente de caixa".

### O dano que não se via

Junto com o card desapareceu o **alerta dos 90 dias**. `avaliarAlertasDoDia`
carregava exatamente o mesmo `funcao: 'OPERADOR'`, então o cron parou de avisar
sobre ele.

Esse é o dano real. O alerta é o único aviso de que a **efetivação automática**
está chegando: passados os 90 dias, o contrato se converte em efetivo por decurso
de prazo, com ou sem decisão da gerência. Um promovido no meio do período de
experiência ficava a caminho da efetivação **sem que ninguém fosse avisado** —
e sem nada na tela que sugerisse que faltava olhar.

### É o mesmo erro do ADR 0020, na terceira reincidência

O [ADR 0020](0020-mudanca-de-funcao-preserva-o-ponto.md) já havia diagnosticado
esta classe de defeito, e com estas palavras:

> "Nos painéis que listavam pessoas por `funcao`, a ordem foi **invertida**: (…) A
> função de **hoje** não decide o que aconteceu num dia passado."

Ali a correção foi aplicada ao ponto e aos painéis de horas. Contratos ficou de
fora — e o ADR 0023 encontrou a mesma omissão na folga. Três módulos, um só erro:
**o cargo de hoje decidindo o passado de alguém.**

## Decisão

**O contrato de experiência acompanha a PESSOA.** O prazo de 45+45 dias corre
desde a admissão e não é interrompido, reiniciado nem transferido por uma
promoção — porque na vida real não é. Quem é promovido durante a experiência
continua em experiência, no mesmo dia de vencimento.

Perguntado se o período se aplica a todos ou só a quem entra como operador de
caixa, o dono do projeto respondeu **"aplica a todos"**.

Então o escopo da carteira passa a ser `OPERADOR`, `FISCAL` e `SUPERVISOR` — nas
duas consultas, a da **lista** e a dos **alertas**. Ter uma só definição para as
duas é parte da decisão: foi a divergência entre elas que deixou o alerta
silencioso enquanto o card já havia sumido.

### Por que a GERÊNCIA fica fora

Não é uma questão de mérito, e é o único ponto em que "todos" tem uma exceção
prática: **o cadastro não pede data de admissão para gestores.** O formulário
omite o bloco inteiro de escala/contrato quando a função é `GESTOR`.

Incluí-los produziria uma linha permanente no balde "definir admissão" — um pedido
de ação que ninguém tem como atender pela tela, porque não existe campo para
atender. Um aviso que não se pode resolver ensina a ignorar avisos.

Para incluí-los, o caminho é: primeiro o cadastro passa a coletar a data da
gerência; depois o escopo se amplia. Fica registrado como pendência, não como
decisão contrária.

### O cargo passa a aparecer no card

Consequência direta de a lista deixar de ser homogênea: ela agora mistura caixa,
fiscais e supervisão, e sem o cargo duas pessoas de áreas diferentes ficam
indistinguíveis para quem está conferindo vencimentos. O card mostra **Caixa /
Fiscal / Supervisão** — as palavras da loja, não os nomes das colunas do banco.

## O que NÃO se decidiu

- **Não se guarda o cargo de admissão.** Se um dia a regra passar a ser "só quem
  *entrou* como operador", será preciso saber com que função a pessoa entrou — dado
  que hoje não existe, porque `funcao` é sobrescrito na promoção. Não se inventa
  esse histórico agora, e a decisão do dono ("todos") não o exige.
- **Não se mexeu na matemática do ciclo.** Os 45+45 dias, a efetivação por decurso
  e as decisões de marco seguem exatamente como no ADR 0008. Só o **escopo** de
  quem entra na carteira mudou.
- **Não se corrigiu dado nenhum.** Não havia dado corrompido: a informação sempre
  esteve lá. Quem havia desaparecido volta a aparecer na primeira vez que a tela
  for aberta depois deste PR.

## Consequências

**A favor:**

- Um promovido continua na carteira, com o mesmo vencimento, e volta a receber os
  alertas de 45 e 90 dias. A efetivação automática deixa de poder acontecer às
  escondidas.
- Fiscais e supervisores recém-contratados passam a ter contrato de experiência
  acompanhado — antes **nunca** apareciam, e ninguém havia notado porque o módulo
  se chamava, na cabeça de todos, "contratos dos operadores".
- A terceira instância do erro do ADR 0020 fica fechada.

**Contra, e assumido:**

- A aba fica **mais cheia**, e de uma vez: todos os fiscais e supervisores ativos
  entram na carteira, e os que estão sem data de admissão aparecem no balde
  "definir admissão". Não é um defeito novo — é trabalho de cadastro que estava
  invisível. Mas aparece de uma vez, e é bom saber disso antes de abrir a tela.
- Os contadores do topo (Experiência / Efetivados / Total) sobem pelo mesmo
  motivo. Não são números novos; são os números completos.
