# ADR 0022 — Indicador "Sacolas": quanto se vende por sacola que entra no estoque

- **Status:** aceita
- **Data:** 2026-09-16
- **Decidido com o dono do projeto em:** 2026-09-16 (respostas na seção final)
- **Contexto:** Insumos (almoxarifado), Metas, Painel de Vendas, Indicadores

## Contexto

Hoje o almoxarifado sabe **quantas** sacolas entraram e quantas há em estoque, e o
Painel de Vendas sabe **quanto** a loja vendeu por dia. Ninguém cruza os dois.

Falta a pergunta que o dono do projeto quer responder: **quanto de venda cada
sacola está sustentando?** Se a loja vende R$ 28 por sacola e no mês seguinte cai
para R$ 18, alguma coisa mudou — sacola sendo dada em excesso, sacola grande
usada para uma compra pequena, ou sacola saindo pela porta. Sem o número, a
percepção só chega quando o consumo salta e o estoque acaba antes do previsto: aí
já se comprou de novo, e o desperdício virou custo.

O pedido foi um indicador com meta editável em **Central → Metas**, calculado a
partir da **entrada de sacolas no estoque** — e não do consumo registrado.

> **A escolha da entrada como base está certa, e vale registrar por quê.** A
> entrada é **um evento único e auditável**: a mercadoria chega, alguém registra
> "200 fardos". O consumo depende de cada fiscal lançar cada saída, todos os
> dias; qualquer lançamento esquecido reduz o denominador e **melhora** o
> indicador artificialmente. Medir pela entrada é medir pelo que a loja
> comprovadamente pagou.

## O que o sistema já tem

| Ingrediente | Onde | Observação |
|---|---|---|
| Entradas de sacola, com data e quantidade | `MovimentoEstoque` (`delta > 0`) | Em unidades base (sacolas), não em fardos |
| Conversão fardo ↔ sacola | `Insumo.fatorEmbalagem` | Sacolas: 1 fardo = **1000** sacolas |
| Venda por dia | `VendaDiaria.valor` | Uma linha por dia, `Decimal(14,2)` |
| Meta mensal por tipo, com histórico | `MetaMensal` + `MetasService.resolver` | `tipo` é `String`: **não precisa de migração** |
| Tela de edição de metas | `mobile/src/screens/metas/MetasScreen.tsx` | Já lê `GET /metas` e grava `POST /metas` |
| Semáforo, variação mês a mês, sequência | `arrecadacao/historico-indicadores.domain.ts` | Puro e reutilizável |
| Precedente de "série diária × vendas" | `InsumosService.analiseInsumo` | Já junta consumo diário com `VendaDiaria` |

**Não existe** (e não é necessário): preço, custo ou fornecedor da sacola. O
indicador é sobre **venda por sacola**, não sobre o custo dela.

## A conta

```
Indicador do mês = venda do mês (R$) ÷ sacolas que entraram no mês
```

Com 200 fardos (200.000 sacolas) e R$ 3.000.000 de venda no mês, o indicador é
**R$ 15,00 por sacola**. `MAIOR_MELHOR`: quanto mais venda cada sacola sustenta,
melhor.

O denominador usa o **número inteiro de unidades base** que entrou — 200.000
sacolas —, como pedido. O total em fardos aparece ao lado, porque é a unidade em
que o gestor fala (o app já mostra tudo em embalagens).

## Decisão proposta

### 1. O problema que decide se o indicador serve: a entrada é em LOTE

Este é o ponto mais importante do documento, e não estava no pedido.

**As sacolas entram de golpe; as vendas acontecem todos os dias.** Um caminhão
traz 200 fardos de uma vez, e o próximo vem duas semanas ou um mês depois. Isso
quebra o indicador de duas maneiras:

- **Por dia é impossível.** No dia da entrega o indicador seria
  `venda do dia ÷ 200.000` ≈ R$ 0,15; em todos os outros dias o denominador é
  **zero**. Não existe indicador diário aqui — e é bom saber disso antes de
  alguém pedir um gráfico por dia.
- **Por mês fica preso à data da entrega.** Se um caminhão chega no dia 2 de
  setembro e o seguinte no dia 3 de outubro, **setembro recebe 400.000 sacolas e
  outubro recebe zero**. Setembro parece péssimo (metade do indicador) e outubro é
  incalculável. Nada mudou na operação: mudou o dia da entrega.

**Proposta:** manter o **mês** como o número oficial (é o que foi pedido e é como
todas as outras metas funcionam), e acrescentar duas defesas:

1. **Uma referência estável de 90 dias**, ao lado: `venda de 90 dias ÷ sacolas de
   90 dias`. É o número que realmente se pode comparar entre meses, porque
   atravessa dois ou três ciclos de entrega e dilui a data do caminhão. É a
   leitura que responde "estamos melhorando ou piorando?".
2. **Mês sem entrada não vira zero.** O indicador devolve **"sem entrada de
   sacolas neste mês"** e **não é comparado com a meta**. Mostrar R$ 0,00 por
   sacola diria "catástrofe" onde a verdade é "o caminhão não veio". Mesmo
   princípio das médias de venda, que devolvem `null` em vez de ruído.

E um aviso explícito quando o mês tem **mais entregas que o normal**: "este mês
recebeu 2 entregas; o indicador cai por isso, não por desperdício".

### 2. O estoque inicial fica FORA da conta

Existem hoje **200.000 sacolas** lançadas como `origem = 'ESTOQUE_INICIAL'`
(migração `9i_estoque_inicial` e `prisma/seed.ts`). **Não foram uma compra** — são
o saldo de abertura do sistema.

Se entrarem no denominador, o mês em que o sistema foi implantado ganha um lote
inteiro que nunca existiu como entrega, e o indicador daquele mês fica pela
metade. Pior: é um erro que ninguém encontraria depois, porque o número é
plausível.

**Entram no denominador:** `ENTRADA` (manual), `REQUISICAO` (requisição
aprovada), `PEDIDO_RECORRENTE` (sugestão confirmada) e entradas sem `origem`
(registros antigos).
**Fica fora:** `ESTOQUE_INICIAL`.

### 3. O semáforo sairia INVERTIDO — e é o defeito mais perigoso desta mudança

A regra do semáforo (`nivelDoMes`, declarada no código como "fonte única de
verdade") decide olhando a **base**, não o **sentido**:

```ts
export function nivelDoMes(base, valor, meta): NivelIndicador {
  if (base === 'FIXA') {          // maior é melhor
    if (valor >= meta) return 'OK';
    …
  }
  if (valor <= meta) return 'OK'; // menor é melhor
  …
}
```

Funciona hoje **por coincidência**: os dois únicos casos existentes são
`FIXA ↔ MAIOR_MELHOR` e `VENDAS ↔ MENOR_MELHOR`, perfeitamente correlacionados.

O indicador de sacolas quebra a coincidência: é **`MAIOR_MELHOR`** (mais venda por
sacola é melhor), mas a sua base **não é `FIXA`** — o denominador é *sacolas
recebidas*, não vendas nem um valor absoluto. Com a regra atual ele cairia no
`else` e seria julgado como "menor é melhor": **o sistema pintaria de VERDE
justamente o mês em que a loja mais desperdiçou sacolas**, e de vermelho o mês
mais eficiente.

Um indicador que mente na direção é pior do que não ter indicador: ele é obedecido.

**Proposta:** `nivelDoMes` e `cumpriuMeta` passam a decidir pelo **`sentido`**, e
não pela `base`. Como hoje os dois andam juntos, a mudança **não altera nenhum
valor de nenhum indicador existente** — é comportamento idêntico com a
ambiguidade removida. De quebra, alinha a regra com
`IndicadoresResumoService.semaforo`, que **já** decide pelo `sentido`, encerrando
uma divergência entre duas das três cópias da mesma regra.

> A terceira cópia vive na tela (`IndicadoresScreen.tsx`, `nivelMes`) e também
> olha a `base`. Precisa do mesmo ajuste, ou o app e o servidor discordarão sobre
> a cor do mesmo mês.

### 4. Unidade nova: R$ por unidade

`UnidadeMeta` hoje é `'REAIS' | 'PERCENTUAL'`. "R$ 28,00 por sacola" não é
nenhum dos dois: é uma **razão**. Reutilizar `REAIS` faria a tela escrever
"R$ 28,00" sem dizer *por quê*, e a meta perderia o sentido na leitura.

**Proposta:** acrescentar `'REAIS_POR_UNIDADE'`. Isso obriga a atualizar as três
condições de formatação da `MetasScreen` — que hoje caem no ramo de
`PERCENTUAL` para qualquer unidade desconhecida, ou seja, mostrariam "28,00%".

### 5. Onde o cálculo mora: em `insumos`, não em `arrecadacao`

A tentação é registrar `SACOLAS` como um indicador de arrecadação e herdar de
graça o semáforo, a projeção, o painel de atenção e o histórico. **Seria errado**,
por três razões concretas:

1. Todo indicador de arrecadação lê **uma tabela só** (`RegistroArrecadacao`,
   alimentada por upload de `.txt` diário). Sacolas vivem em
   `MovimentoEstoque`. `ArrecadacaoService.resumo()` ganharia um caso especial que
   busca dados em outro módulo — e o módulo passaria a depender do almoxarifado.
2. `congelarMes` percorre `TIPOS_ARRECADACAO` e verifica se o mês está completo
   comparando com o tamanho da lista. Entrar ali marca todos os meses já
   congelados como incompletos e os reescreve.
3. Quem ler o código em seis meses vai procurar o `.txt` de sacolas que não
   existe.

**Proposta:** o **cálculo** fica em `insumos`, onde está o denominador e onde já
existe o precedente de cruzar série diária com `VendaDiaria` (`analiseInsumo`). A
**meta** entra em `TIPOS_META`, para ser editada em Central → Metas como pedido. E
as regras de julgamento (`nivelDoMes`, `cumpriuMeta`, `variacaoMensal`,
`evolucaoDoMes`) são **reaproveitadas** de `historico-indicadores.domain.ts` — são
funções puras, não exigem entrar no catálogo de arrecadação.

### 6. O denominador conta a CATEGORIA, não um item

Somam-se as entradas de **todos** os insumos com `categoria = 'SACOLA'`, e não
apenas do item chamado "Sacolas". Assim, no dia em que a loja cadastrar "Sacola
grande" e "Sacola pequena", o indicador continua correto sem ninguém lembrar de
mexer nele. Hoje o resultado é idêntico (existe um item só).

### 7. O que o indicador entrega

- **Do mês:** venda, sacolas recebidas (em sacolas e em fardos), o indicador em
  R$/sacola, a meta vigente naquele mês, o semáforo e a comparação com o mês
  anterior.
- **Referência de 90 dias:** o mesmo cálculo na janela estável.
- **Quantas entregas o mês teve** — o contexto que explica um mês fora da curva.
- **Estado explícito** quando não há entrada no mês ou não há venda registrada.

### 8. O que NÃO entra nesta entrega

- **Congelar o indicador em `FotoMesIndicador`.** Sem isso, meses passados são
  recalculados a partir dos dados brutos — o que funciona **até 24 meses**,
  porque a purga apaga `VendaDiaria` (o numerador) além dessa janela. Como o
  sistema tem 3 meses de história, não é urgente; passa a ser antes de 2028.
  Congelar exige uma coluna nova para o denominador de sacolas (`FotoMesIndicador`
  só tem `vendas`).
- **Projeção e painel de atenção**, que hoje vivem no módulo de arrecadação.

### 10. O detalhe: o indicador lido de trás para frente (o TETO de sacolas)

A intenção, dita pelo dono do projeto, é *"no fim do mês não desperdiçar sacolas
e vender o que diz a meta, ou mais, por sacola"*. Isso muda qual pergunta é útil.

Enquanto o mês corre, saber que o indicador está em R$ 22 **não diz o que fazer**.
O que diz é a mesma conta invertida:

```
indicador = venda ÷ sacolas ≥ meta    ⟺    sacolas ≤ venda ÷ meta
```

Existe, portanto, um **teto de sacolas** que o mês suporta sem furar a meta. Com
R$ 3.000.000 esperados e meta de R$ 28, o teto é 107.142 sacolas — **107 fardos**.
Se 100 já entraram, **ainda cabem 7**. O indicador deixa de ser um boletim (que só
se lê no fim) e passa a ser uma **régua de compra** (que serve durante o mês).

O teto em fardos é **truncado para baixo**: com teto de 107.142 sacolas, o 108º
fardo furaria a meta. Arredondar para cima daria um número que não se pode usar.

**O que a tela de detalhe mostra, nesta ordem:** o teto (o número que serve para
decidir vem primeiro) · a projeção do fechamento (o horizonte da intenção) ·
recebido × usado (separa desperdício de reposição) · os dias em que entrou sacola
(o extrato que sustenta o denominador, com data, fardos, origem e quem registrou)
· a série do mês (venda e consumo dia a dia).

**A venda esperada do mês, em ordem de confiança:**

| Fonte | Quando vale | O que é |
|---|---|---|
| `ESTIMATIVA` | há estimativas para os dias que faltam | realizado até hoje **+** as estimativas da gestão para o resto do mês |
| `RUN_RATE` | sem estimativas | projeção pelo ritmo (média dos dias com venda × dias do mês) |
| `REALIZADO` | mês fechado | o que aconteceu |

Junto vai a **fração já realizada**: o teto calculado no dia 2 é quase todo
previsão e no dia 30 é quase todo fato. Sem esse aviso o gestor confiaria num
número frágil como se fosse certo.

#### ⚠️ A direção é contraintuitiva, e isso fica escrito na tela

Receber **menos** sacolas **melhora** o indicador. Isso nunca pode ser lido como
"compre menos": a loja precisa de sacolas para atender. O teto é uma **linha de
aviso** — passar dela significa que, com a venda esperada, o mês fecha abaixo da
meta. E a saída pode ser **vender mais**, não necessariamente comprar menos. Por
isso o detalhe mostra também a pergunta espelho: **quanta venda o mês precisaria
para as sacolas já recebidas ficarem na meta**.

#### Desperdício ≠ acúmulo de estoque

O indicador oficial mede pela entrada, mas o estoque é um **amortecedor**: num mês
a loja pode receber 200 fardos e usar 150. Nesse mês o indicador oficial parece
pior do que o uso real, e a diferença **não é desperdício** — é estoque que subiu,
e que vai aparecer como indicador melhor no mês seguinte.

O detalhe mostra os dois lado a lado: **oficial** = venda ÷ sacolas *recebidas*;
**referência de uso real** = venda ÷ sacolas *consumidas*. Desperdício aparece no
consumo alto em relação à venda; acúmulo aparece na entrada alta em relação ao
consumo. Sem os dois, um mês de reposição maior seria lido como desperdício —
exatamente o erro que a intenção do dono do projeto quer evitar.

#### A suposição da projeção fica visível

Para projetar o fechamento é preciso supor se **ainda vem entrega** no mês. A
regra: se restam ao menos 3 dias, o ciclo é quinzenal e só veio **uma** entrega,
supõe-se uma segunda do tamanho da primeira. Essa frase viaja com o dado
(`baseDaPrevisao`) e aparece na tela: um palpite sem rótulo seria lido como fato.

### 11. Onde o indicador aparece (revisto)

Passa a existir **só no painel de Indicadores** — a card foi **removida do
Almoxarifado**, por decisão do dono do projeto. O almoxarifado segue com o que é
dele (saldo, ruptura, pedido quinzenal); o indicador de gestão fica junto dos
outros, e tocá-lo abre o detalhe (tela própria `SacolasDetalhe`, porque o detalhe
dos indicadores de arrecadação é acoplado ao catálogo `FIXA`/`VENDAS`).

Esta seção **substitui** a decisão 4 da tabela abaixo, que dizia "no Almoxarifado
**e** no painel".

## Consequências

**A favor:**
- Responde em número a uma pergunta que hoje só se responde por percepção, e
  **antes** de o desperdício virar recompra.
- Corrige um defeito real e latente (o semáforo que decide pela base), sem mudar
  nenhum indicador existente.
- Abre o caminho para outras metas de razão (venda por bobina, por metro de pano)
  sem novo desenho — a unidade `REAIS_POR_UNIDADE` e a regra por `sentido`
  passam a existir.

**Contra / a vigiar:**
- **A leitura mensal depende da data da entrega.** Mitigado pela janela de 90
  dias, pelo estado "sem entrada" e pelo aviso de mês com duas entregas, mas o
  gestor precisa entender isso — está na tela, não só neste documento.
- **Uma entrada lançada com quantidade errada distorce o mês inteiro.** O
  denominador é um número só, informado à mão. Vale conferir a entrada quando o
  indicador salta.
- **`MovimentoEstoque` não tem índice por `dataHora`** (só por `insumoId`).
  Janelas largas fazem varredura; hoje irrelevante, merece índice se crescer.
- **Se o `fatorEmbalagem` for editado**, as entradas antigas passam a ser lidas
  com o fator novo na conversão para fardos. O indicador em R$/sacola **não** é
  afetado (usa a unidade base); só a exibição em fardos.

## Fases propostas

- **Fase 1 — o indicador e a meta.** Cálculo em `insumos`, meta em Central →
  Metas, unidade `REAIS_POR_UNIDADE`, correção do semáforo (as três cópias) e a
  exibição no Almoxarifado com a referência de 90 dias.
- **Fase 2 (opcional) — histórico congelado.** Coluna do denominador em
  `FotoMesIndicador` e entrada no congelamento mensal, para o histórico
  sobreviver à purga de 24 meses.
- **Fase 3 (ideia) — indicador por ENTREGA.** "Entre esta entrega e a seguinte,
  a loja vendeu R$ X por sacola." É a forma como um dono de loja realmente pensa
  ("este lote me durou três semanas") e elimina de vez o problema do calendário,
  porque o período passa a ser o ciclo de compra em vez do mês.

## Decisões do dono do projeto (2026-09-16)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Meta é piso? | **Piso na direção, diagnóstico na apresentação** — ver item 9 |
| 2 | Valor padrão | **R$ 28,00 por sacola** |
| 3 | Referência | **Mensal.** A janela de 90 dias foi recusada |
| 4 | Onde aparece | No Almoxarifado **e** no painel de Indicadores, junto aos outros cinco |
| 5 | Estoque inicial | **Fora** do denominador, confirmado |

### O que muda por causa da decisão 3 (referência mensal)

A janela estável de 90 dias sai do desenho. Isso **aumenta** a importância das
outras duas defesas contra a entrada em lote (item 1), que passam a ser as únicas:

- **mês sem entrada de sacola** devolve estado próprio e **não** é comparado com a
  meta;
- **o número de entregas do mês** é exibido junto ao indicador, porque é o que
  explica um mês fora da curva.

Vale notar que o efeito é menor do que o pior caso descrito no item 1: as sacolas
seguem um **ciclo quinzenal** (existe até uma rota
`GET /insumos/pedidos-recorrentes/proximo-quinzenal` para elas), então o mês
típico tem 2 entregas e a variação vem de um mês ocasional com 1 ou 3. O aviso da
contagem de entregas cobre exatamente esse caso.

### O que muda por causa da decisão 4 (aparecer no painel de Indicadores)

O indicador entra na tela de Indicadores ao lado dos cinco de arrecadação, mas
**continua sendo calculado em `insumos`** (item 5 desta proposta segue de pé, e o
dono do projeto reforçou que "este indicador é diferente dos outros"). Na prática:

- a tela de Indicadores passa a compor **duas fontes** — os cinco de arrecadação e
  este —, em vez de percorrer um catálogo só;
- o card precisa deixar visível que a base dele é **outra** (sacolas recebidas, e
  não vendas nem um valor fixo), ou o gestor vai comparar coisas que não se
  comparam;
- `TIPOS_ARRECADACAO` **não** é alterado, então `congelarMes` e a purga seguem
  intactos.

### 9. A leitura da meta: piso na direção, diagnóstico na apresentação

A resposta do dono do projeto foi **"a B com R$ 28 como piso"** — e as duas metades
dizem coisas diferentes, sobre eixos diferentes. Separá-las é o que faz o
indicador ficar certo:

| Eixo | Decisão | Consequência |
|---|---|---|
| **Direção** (como se julga) | **`MAIOR_MELHOR`**, com R$ 28,00 como piso | O lado ruim é **abaixo** da meta. Passar dos R$ 28 **nunca** é problema: significa que a loja usou menos sacolas para o mesmo faturamento |
| **Apresentação** (como se mostra) | **Diagnóstico**, não boletim | O card mostra **sempre** o desvio com sinal ("R$ 34,00 · +R$ 6,00 acima da meta"), e não apenas uma cor. Ficar acima aparece como informação, nunca como alerta |

Na prática, o semáforo é o de "maior é melhor" já existente — o que muda é que o
número **nunca aparece sozinho**: vem acompanhado da distância até a meta, para
o gestor ver *quanto* e *para que lado*, e não só se passou ou não passou.

Isto reforça por que a correção do item 3 é obrigatória: com `sentido` decidindo o
semáforo, "abaixo do piso" pinta amarelo/vermelho corretamente. Com a regra atual
(que decide pela `base`), R$ 22 por sacola sairia **verde** — o mês de maior
desperdício seria premiado.
