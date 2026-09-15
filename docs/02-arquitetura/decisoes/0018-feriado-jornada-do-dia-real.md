# ADR 0018 — Feriado: jornada do dia real, adicional de domingo

- **Status:** aceita
- **Data:** 2026-09-15
- **Contexto:** jornada, folha, Central de Jornada

## Contexto

"Feriado segue a regra do domingo" foi tratado como uma frase só, e virou uma
linha só de código:

```ts
const baseMs = regras.cargaBaseMs(ehFeriado ? 0 : diaSemana);
```

O feriado era **remapeado para domingo** e, com isso, três respostas diferentes
sobre o mesmo dia passavam a vir juntas. São três perguntas distintas:

| Pergunta | Resposta correta |
|---|---|
| Que **horário** a pessoa cumpre? | o de domingo |
| As extras são 50% ou **100%**? | 100%, como domingo |
| Qual a **jornada esperada** do dia? | **a do dia real** |

Só as duas primeiras seguem o domingo. A terceira nunca deveria: uma segunda
feriada é uma segunda, com a jornada de uma segunda.

### O que isso custava na prática

O contrato é data-driven por dia da semana (`cargaBaseMinPorDia`, um valor para
cada dia). Para quem **folga fixo no domingo**, a forma natural de modelar o
contrato é pôr a carga de domingo em **zero**.

Com o remapeamento, todo feriado dessas pessoas passava a esperar **zero hora**.
Uma pessoa escalada numa segunda feriada, trabalhando a jornada normal dela:

1. `horasExtras = trabalhado − 0` ⇒ **a jornada inteira virava extra**;
2. o feriado paga 100% ⇒ **tudo a 100%**;
3. o total passava o limite de extras (1h50) ⇒ **TAC**, um dia irregular.

Ou seja: o sistema tratava o dia como se a pessoa tivesse trabalhado num dia em
que não devia nada — quando na verdade **era o dia dela**, e ela tinha folgado no
domingo, como sempre. O relato de quem sentiu o problema foi exatamente esse: "a
pessoa folga domingo, trabalha o feriado na segunda, e o sistema acusa TAC e
manda tudo como hora extra".

Com o contrato 6x1 padrão (domingo 7h20) o efeito era mais suave, mas igualmente
errado: a segunda feriada esperava 7h20 em vez de 7h, e um atestado nesse dia
abonava 7h20 em vez das 7h que a pessoa devia cumprir.

A regra também estava **escrita duas vezes** — no cálculo do dia e na base dos
dias de ausência/atestado. Uma regra de dinheiro duplicada é uma regra que vai
divergir.

## Decisão

**A jornada esperada de um feriado é a do seu próprio dia da semana.** Extraída
para uma função única, `cargaBaseDoDia(diaSemana, regras)`, que **não recebe
`ehFeriado`** — é o que impede o remapeamento voltar por descuido.

O feriado **continua** herdando do domingo:

- o **horário** de entrada/saída (`entradaEsperadaNoDia`/`saidaEsperadaNoDia`);
- o **adicional de 100%** sobre o que exceder a jornada;
- a **isenção de hora devida** que viaja com o adicional.

### Por que a isenção de débito continua

Foi uma decisão explícita do dono do produto, e a razão é boa: as horas do
feriado são pagas a **100%** e o trabalhador as cobra. Debitá-las seria cobrar o
mesmo dia duas vezes. Quem trabalha menos que a jornada num feriado não fica
devendo.

Note a assimetria deliberada: o feriado **não** herda a jornada de domingo (isso
inflava as extras), mas **sim** a isenção. São perguntas diferentes, e agora estão
separadas no código — `cargaBaseDoDia` responde a jornada, `diaPagaAdicional100`
responde o adicional e a isenção.

### O que NÃO muda

A **folga** nunca seguiu o feriado, e continua não seguindo: `ehDiaDeFolga` não
recebe `ehFeriado` e decide pelo dia REAL. Quem folga no domingo e trabalha numa
segunda feriada **não** está de folga na segunda. Isso já estava correto e há
teste que o protege — foi verificado antes desta mudança, porque a hipótese
inicial era justamente de que a folga estivesse deslocada. Não estava; o defeito
era só na jornada esperada.

## Alternativas descartadas

1. **Dar ao contrato uma carga própria de feriado** (um oitavo valor no arreglo).
   Modelaria o feriado como um "dia especial" configurável. Descartada: o feriado
   cai num dia da semana que já tem jornada definida, e um segundo número para o
   mesmo dia seria uma fonte a mais para ficar desatualizada — o problema que
   este ADR resolve.
2. **Tirar também a isenção de débito** ("feriado é como qualquer dia, então quem
   trabalha menos deve"). Descartada pelo dono do produto: as horas são pagas a
   100% e cobrá-las de volta como débito seria cobrar duas vezes.
3. **Proibir carga zero nos contratos.** Trataria o sintoma e quebraria um caso
   legítimo — um contrato 5x2 com domingo em zero está correto, e num domingo
   REAL trabalhado é certo que tudo conte como extra.

## Consequências

- **Extras de feriado passam a ser calculadas sobre a jornada do dia.** No 6x1,
  uma segunda feriada com 8h20 trabalhadas dá 1h20 a 100% (era 1h, medida contra
  as 7h20 de domingo). Em contratos com domingo zerado, deixa de contar a jornada
  inteira como extra — a correção mais significativa em valor.
- **Fim dos TAC falsos em feriado** para quem tinha o domingo zerado.
- **Atestado em feriado abona a carga do dia real** (7h numa segunda, não 7h20).
- **A isenção de hora devida em feriado permanece**, com teste dedicado para que
  a correção da jornada não a arraste.
- A regra deixa de estar duplicada: os dois chamadores usam `cargaBaseDoDia`.
- Dois testes que codificavam o comportamento antigo foram atualizados, com o
  porquê da mudança escrito neles.

## Referências

- [`ponto`](../../03-atlas-backend/ponto.md) — `cargaBaseDoDia`, `diaPagaAdicional100`
- [`central-jornada`](../../03-atlas-backend/central-jornada.md) — regra 4 (isenção)
- [`feriados`](../../03-atlas-backend/feriados.md) — regra 4
- [`escala-domingo`](../../03-atlas-backend/escala-domingo.md) — regra 7 (horário)
