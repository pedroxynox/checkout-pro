# ADR 0021 — Compensação de horas: sugerir a data mais fraca, dentro do ciclo

- **Status:** proposta (aguardando decisão do dono do projeto)
- **Data:** 2026-09-16
- **Contexto:** Central de Jornada, Vendas, Escala (rodízio de domingos, folga), Ausências

## Contexto

Hoje a Central de Jornada **mede** as horas com precisão — mostra por pessoa o
saldo de 50%, o que ela deve, os dias de TAC — mas **não ajuda a resolver**. O
gestor vê "Ana tem 9h de 50%" e fica sozinho com as três perguntas seguintes:
*em que dia eu a libero sem furar a operação?*, *quanto tempo eu libero?* e *isso
zera as horas dela ou empurra o problema para o mês seguinte?*

Na prática o resultado é um dos dois piores desfechos: ou ninguém compensa e a
loja paga o adicional de 50% em folha, ou alguém compensa no chute — quase sempre
no dia errado, porque a intuição sobre "dia fraco" costuma apontar para o dia da
semana e o movimento de supermercado é governado pelo **calendário de pagamento**,
não pelo dia da semana.

O sistema já tem todos os ingredientes para responder às três perguntas. Faltava
juntá-los. O pedido do dono do projeto foi uma seção **"Compensação de horas"**
dentro da Central de Jornada que sugira **quem** folga, **em que dia** e **por
quanto tempo**, usando o dia que menos vende, sem cair em domingo nem na folga da
pessoa.

Existe ainda um sinal de que a lacuna já era conhecida: o módulo de fiscais já
dispara o aviso *"Folga sugerida por excesso de extras — considere conceder um dia
livre para compensação"* (`fiscais-alertas.service.ts`). O aviso existe; o lugar
para agir, não.

## O que o sistema já tem (e o que não tem)

**Tem — e deve ser reaproveitado, não reescrito:**

| Ingrediente | Onde |
|---|---|
| Saldo de 50% real por pessoa, por ciclo (`extras50AtualMs`, `saldo50Ms`) | `central-jornada.service.ts` |
| Regra única de "quem folga no dia X" (ficha + escala semanal + convocação) | `FolgaService.consultor(dias)` |
| Rodízio de domingos, folga fixa, horário esperado por dia | `escala-domingo.domain.ts` |
| Fonte única de feriados | `feriados.consulta.ts` |
| Média de venda por dia da semana (janela de 90 dias) | `VendasService.calcularPadraoDiaSemana` (privada) |
| Média de venda por dia da semana **e hora** (heatmap 7×24) | `VendasService.calcularPerfilHorario` |
| Estimativa de venda **por data**, preenchida pela gestão | `EstimativaVendaDia` |
| Cobertura por dia (`trabalhando`/`folgas`/`faltas`) e mínimo de 20 operadores | `OperadorTurnoService.grade()` |
| Abono de falta como débito de horas | `POST /central-jornada/ausencia/:id/debito` |
| Estilo de sugestão da casa: recusar o palpite quando o dado é fraco | `sugestao-folga.domain.ts` |

**Não tem — e restringe o desenho:**

- **Nenhuma tabela de escala por data.** `EscalaEntry` é por **dia da semana**;
  a ficha guarda a folga fixa. Não existe hoje onde gravar "esta pessoa está
  liberada no dia 18". É a lacuna central a resolver.
- **Nenhuma hora é persistida.** Todo número de jornada é recalculado a cada
  requisição a partir das batidas e das ausências. Qualquer compensação só
  "existe" para o cálculo se o cálculo for ensinado a lê-la.
- **Venda não tem operador nem check-out.** É por loja, por hora. Não há contagem
  de clientes nem telemetria de fila. O melhor termômetro de movimento é o R$.
- **Histórico de venda limitado**: começa na `Data_Inicial_Sistema` e a purga
  mantém 24 meses; e um dia só existe se o `.txt` daquele dia foi enviado.

## Decisão proposta

### 1. Separar as duas compensações — e reconhecer que dividem a mesma carteira

O pedido descreve, na verdade, **dois movimentos opostos no tempo**:

- **(A) Liberação** — dar um dia, meio dia ou uma faixa de horas **no futuro**,
  reduzindo as 50% positivas.
- **(B) Cobertura de falta** — uma falta **não justificada já ocorrida** é
  coberta pelas 50% que a pessoa tem (é o botão "Débito" que já existe).

Os dois consomem **a mesma carteira**: `extras50Ms`. Sugerir os dois sem
descontar um do outro é prometer as mesmas horas duas vezes — o erro mais fácil
de cometer aqui e o mais difícil de perceber depois.

**Regra:** a carteira é calculada uma vez por pessoa; **primeiro** aloca-se a
cobertura de faltas passadas, **depois** o que sobra vira liberação futura.

A ordem não é arbitrária. Cobrir uma falta passada é a operação mais barata que
existe: não mexe na escala, não tira ninguém do caixa, elimina um desconto em
folha para a pessoa e apaga um passivo de 50% para a loja. Só faz sentido gastar
a carteira numa liberação futura — que custa cobertura — depois de esgotado o que
não custa nada.

> **A cobertura de falta é de horas, não de disciplina.** Marcar débito quita a
> hora; não apaga a falta nem o registro para advertência. A seção deve dizer
> isso na tela, ou o abono passa a ser lido como perdão.

### 2. Pontuar **datas**, não dias da semana

O pedido fala em "o dia que menos vende". A leitura literal — ranquear os sete
dias da semana pela média e mandar todo mundo folgar no mais fraco — é
tecnicamente fácil e operacionalmente ruim, por três razões:

1. **O calendário de pagamento pesa mais que o dia da semana.** Uma terça no
   início do mês vende mais que uma segunda no dia 18. Ranquear o dia da semana
   ignora justamente o efeito dominante.
2. **Feriado distorce a média** e não dá folga a ninguém: precisa sair da conta.
3. **Amostra pequena mente.** Se um dia da semana tem 2 observações, a "média"
   é ruído.

**Proposta:** ranquear as **datas concretas** que ainda restam no ciclo aberto,
com um score de movimento por data, nesta ordem de confiança:

1. **`EstimativaVendaDia` daquela data**, quando preenchida — é a previsão da
   própria gestão para aquele dia específico, mais informada que qualquer média.
2. **Média histórica do dia da semana** (janela de 90 dias, feriados fora),
   **ajustada pelo efeito do dia do mês** (a mesma posição no calendário de
   pagamento em meses anteriores).
3. Quando nem isso existir, a seção **não sugere** e diz por quê — coerente com
   `sugestao-folga.domain.ts`, que devolve `null` em vez de arriscar.

Cada sugestão carrega o número que a sustenta ("terça 18 — R$ 41 mil previstos,
23% abaixo da média do ciclo") e um selo de confiança quando a amostra é curta.
Sugestão sem justificativa visível não é usada; é obedecida ou ignorada, e as
duas coisas são piores.

> Reaproveitamento: a parte pura de `calcularPadraoDiaSemana` sai de dentro do
> `VendasService` para `vendas.domain.ts`, onde já vivem os auxiliares puros do
> módulo, e passa a ser usada pelos dois lados sem duplicar a estatística.

### 3. Escolher a **faixa de horas** pelo heatmap — e só nas pontas do turno

Para compensar poucas horas, liberar um dia inteiro é desperdício. O heatmap 7×24
já sabe qual é o trecho mais vazio de cada dia da semana, então a faixa pode ser
escolhida com precisão: a janela contígua de N horas com a menor venda média,
dentro do turno da pessoa.

Com uma restrição prática: **a janela só vale se tocar o início ou o fim do
turno.** Um buraco no meio do turno não serve para nada num supermercado — a
pessoa teria de sair e voltar. Compensação real é entrar mais tarde ou sair mais
cedo. Sem essa restrição a matemática acha ótimos que a operação não consegue
executar.

### 4. As exclusões, e por que cada uma existe

Nunca sugerir:

- **Domingo.** O pedido já pedia, e a aritmética reforça: no domingo o
  excedente é 100%, e **as 100% nunca são debitadas** (regra 6 da Central).
  Liberar um domingo não reduziria as 50% em nada — seria uma compensação que não
  compensa. Além disso o domingo é regido pelo rodízio de grupos, não pela folga
  fixa.
- **Feriado.** Mesma aritmética do domingo, e feriado não dá folga a ninguém.
- **A folga da pessoa** — fixa na ficha ou marcada na escala semanal —, seja
  operador, fiscal ou supervisor. Liberar quem já está de folga compensa zero.
  A resposta vem **só** do `FolgaService`, que é a regra única; reimplementar o
  "está de folga?" é o erro que criou a necessidade daquele serviço.
- **Férias, ausência já lançada ou atestado** naquela data.
- **Dia de convocação** (`especial && !folga`): a convocação existe porque a
  pessoa é necessária ali.
- **Data fora do ciclo de folha aberto** — ver item 5.
- **Data já usada** por outra compensação aprovada, para não empilhar todo mundo
  no mesmo dia fraco.

### 5. A compensação tem de cair **dentro do mesmo ciclo** das horas

Este é o ponto que não aparece no pedido e que decide se a seção funciona.

As horas são apuradas **por ciclo de folha (26→25)**. Se as 9h de 50% da Ana são
do ciclo que fecha no dia 25 e ela é liberada no dia 28, o sistema **não zerou
nada**: a loja paga as 9h de 50% deste ciclo e a Ana começa o ciclo seguinte
devendo horas. Piorou duas vezes.

Portanto: as datas candidatas são as que **restam no ciclo aberto**. E quando o
saldo da equipe não cabe nos dias fracos que sobraram, a seção deve dizer isso
com antecedência — "faltam 5 dias de ciclo e 32h para compensar; 11h não caberão"
— porque essa é exatamente a informação que hoje só aparece na folha, tarde.

### 6. Cobertura mínima é restrição, não conselho

O mínimo operacional é 20 operadores no caixa (`COBERTURA_MINIMA`). Se a seção
mandar todos os saldos para a data mais fraca do ciclo, ela quebra a loja no dia
que ela mesma recomendou.

Por isso a sugestão não é uma consulta, é uma **alocação**: para cada candidato,
simular o efeito na cobertura daquela data (partindo de `grade().cobertura`) e
**distribuir** as pessoas entre as datas fracas, respeitando o mínimo. Fiscais e
supervisores contam em cobertura própria, não no mínimo dos operadores.

### 7. O tipo de liberação sai do tamanho do saldo

Não se pergunta ao gestor "dia, meio dia ou faixa?" — isso já está determinado:

| Saldo de 50% da pessoa | Sugestão |
|---|---|
| ≥ carga do dia | **dia inteiro** |
| ≥ metade da carga | **meio dia** (na ponta mais fraca do turno) |
| ≥ mínimo útil (a definir, ~1h) | **faixa de horas** exata, na ponta mais fraca |
| abaixo do mínimo útil | não sugere (troco de escala não vale a mudança) |

Nunca sugerir mais do que a pessoa tem: liberação não pode criar saldo negativo.
Quem está com 50% **negativas** não aparece aqui — precisa trabalhar horas, não
folgar; é a lista espelho, candidata a uma fase posterior.

### 8. Onde gravar: nova tabela `CompensacaoHoras`

Como não existe escala por data, é preciso um lugar novo. Uma linha por
compensação: colaborador, data, tipo (dia / meio dia / faixa), hora inicial e
final, minutos compensados, status (sugerida → aprovada → aplicada, ou recusada /
cancelada), origem (sugestão automática ou manual), quem aprovou, e o **retrato
da justificativa** no momento da sugestão (venda prevista, cobertura, saldo).

Guardar a justificativa é o que permite responder em dezembro "por que a Ana
folgou na terça 18?" sem precisar recalcular um passado que já mudou.

**Por que não reaproveitar `Ausencia` com um motivo novo**, que seria o caminho
curto (o débito já reduziria as 50% sem escrever uma linha de cálculo): porque
`calcularPessoa` conta **qualquer** ausência que não seja atestado como
**falta**. A compensação apareceria como falta na card da pessoa, nos rankings,
nos comparativos e nos alertas. Uma pessoa bem gerida ficaria com a ficha de
faltosa. O atalho custa mais do que economiza.

### 9. Como o cálculo de horas aprende a compensação

Aqui há uma assimetria útil, que reduz bastante o trabalho:

- **Faixa de horas e meio dia já funcionam sozinhos.** A pessoa bate ponto e
  trabalha menos que a carga; o cálculo atual já gera déficit naquele dia, e o
  déficit já consome as 50%. **A aritmética está pronta.** Só falta registrar a
  autorização, para o dia não ser exibido como déficit inexplicado nem como
  jornada incompleta.
- **Dia inteiro precisa de código.** Sem batida nenhuma, o dia hoje viraria
  `FALTA_NAO_REGISTRADA` — a Central acusaria em laranja o dia que ela própria
  recomendou. Então `calcularPessoa` passa a ler as compensações do ciclo e a
  tratar o dia como tipo próprio (`COMPENSACAO`), somando os minutos num balde
  **separado** (`compensadoMs`) que abate as 50%.

Balde separado, e não "horas devidas", por uma razão de leitura: quem compensou
não **deve** horas — ele **usou** horas. Jogar tudo em "Deve" faria o gestor ver
dívida onde houve boa gestão.

### 10. O que a seção mostra

Uma card "Compensação de horas" na Central de Jornada, seguindo os componentes já
existentes (`Cartao`, `Selo`, `CartaoMetrica`):

1. **Resumo da carteira** — quanto a equipe tem de 50% em aberto, quanto cabe nos
   dias que restam do ciclo, quanto não vai caber.
2. **Faixa dos dias mais fracos do ciclo** — as datas candidatas com a venda
   prevista e a cobertura de cada uma.
3. **Sugestões**, ordenadas por urgência: risco de TAC primeiro, depois maior
   saldo, depois proximidade do fim do ciclo. Cada linha traz pessoa, função,
   tipo, data, horas e a frase que a justifica.
4. **Coberturas de falta** em bloco próprio, com o botão que já existe.
5. Ações por linha: **aplicar** e **descartar** (com o motivo do descarte, que é
   o único jeito de a sugestão melhorar com o tempo).

### 11. O que a seção **não** faz

- **Não aplica nada sozinha.** Toda compensação exige aprovação explícita. Isso
  mexe em folha e no descanso de pessoas.
- **Não altera a folga fixa da ficha** (`folgaDiaSemana`). Compensação é evento
  de uma data; folga fixa é regra semanal. Confundir as duas corromperia a escala
  de forma permanente — e é precisamente o defeito que o `FolgaService` teve de
  vir consertar.
- **Não mexe no rodízio de domingos.**

## Consequências

**A favor:**

- A loja deixa de pagar 50% por esquecimento, e passa a decidir com número.
- A falta não justificada de quem tem saldo deixa de ser desconto em folha e vira
  hora já trabalhada — melhor para as duas partes.
- O risco de TAC ganha uma válvula de escape planejada, antes de virar custo.
- Nasce a escala por data, que hoje falta no modelo e que outras necessidades
  (troca de turno, liberação pontual) vão pedir de novo.

**Contra / a vigiar:**

- **Nova tabela e mudança no coração do cálculo** (`calcularPessoa`), a parte mais
  sensível do sistema. Exige teste de propriedade: nenhuma compensação pode
  produzir saldo negativo nem alterar as 100%.
- **Qualidade da sugestão depende do envio dos `.txt` de venda.** Com histórico
  ralo, a seção precisa admitir que não sabe, em vez de sugerir mal.
- A estatística de dia fraco é de **loja**, não de operador: ela diz quando a
  loja está calma, não quem é dispensável.

## Fases propostas

- **Fase 1 — inteligência, sem gravar.** Motor de sugestão puro, ranking de datas
  por movimento, exclusões, alocação com cobertura, um endpoint de leitura e a
  card completa. As coberturas de falta já ficam **aplicáveis** (o endpoint
  existe). Liberações aparecem como recomendação. Entrega valor sem tocar no
  cálculo de horas.
- **Fase 2 — registrar e aplicar liberações.** Tabela `CompensacaoHoras`,
  migração, aprovação/cancelamento, integração com `calcularPessoa` (tipo de dia
  e `compensadoMs`) e reflexo na escala publicada e no Quadro de Operadores.
- **Fase 3 (opcional) — a lista espelho.** Quem está com 50% negativas e em que
  dia forte convocar para zerar.

## Pontos a confirmar antes de implementar

1. **Mínimo útil** para sugerir uma faixa de horas (proposto: 1h).
2. **Permissões:** ver com `CENTRAL_JORNADA` e aplicar com `OPERADORES_AUSENCIAS`
   (igual ao botão de débito hoje), ou criar `COMPENSACAO_HORAS` própria?
3. **Cobertura mínima** de 20 operadores vale como piso para liberar? Há mínimo
   para fiscais e supervisores?
4. **Meio dia** é metade da carga, ou existe convenção de horário na loja?
5. Compensação pode atravessar o ciclo em algum caso excepcional, ou é proibido?
