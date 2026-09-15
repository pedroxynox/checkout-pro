# ADR 0018 — Feriado: jornada de 7h20 com valor próprio (não derivada do domingo)

- **Status:** aceita
- **Data:** 2026-09-15 (revisada no mesmo dia — ver "Correção")
- **Contexto:** jornada, folha, Central de Jornada

## Contexto

"Feriado segue a regra do domingo" era tratado como uma frase só, e virou uma
linha só:

```ts
const baseMs = regras.cargaBaseMs(ehFeriado ? 0 : diaSemana);
```

O feriado era remapeado para o **índice 0** do contrato — o domingo **daquela
pessoa**. E aí está o defeito: o contrato é data-driven por dia da semana, e para
quem **folga fixo no domingo** a forma natural de modelar é pôr a carga de domingo
em **zero**.

Com o remapeamento, todo feriado dessas pessoas passava a esperar **zero hora**.
Uma pessoa escalada numa segunda feriada, cumprindo a jornada normal:

1. `horasExtras = trabalhado − 0` ⇒ **a jornada inteira virava extra**;
2. o feriado paga 100% ⇒ **tudo a 100%**;
3. o total passava o limite de extras (1h50) ⇒ **TAC**, um dia irregular.

O sistema tratava o dia como se a pessoa tivesse trabalhado num dia em que não
devia nada. Mas ela **não estava de folga**: era o dia dela, e o domingo ela
folgou como sempre. O relato foi exatamente esse: "a pessoa folga domingo,
trabalha o feriado na segunda, e o sistema acusa TAC e manda tudo como hora
extra".

A regra também estava **escrita duas vezes** — no cálculo do dia e na base dos
dias de ausência/atestado. Uma regra de dinheiro duplicada é uma regra que vai
divergir.

## Decisão

**A jornada de um feriado é 7h20 — a de um domingo —, em qualquer dia da semana em
que ele caia.** Vem de um valor próprio, `RegrasContrato.cargaFeriadoMs`, e **não**
de `cargaBaseMs(0)`.

A distinção é o coração desta ADR: 7h20 é a jornada do **feriado**, não "a carga
de domingo desta pessoa". Quem nunca trabalha domingo também cumpre 7h20 num
feriado.

A leitura passa por uma função única, `cargaBaseDoDia(diaSemana, ehFeriado,
regras)`, usada pelos dois chamadores que antes repetiam a regra.

### O que o feriado herda do domingo

| Herança | Detalhe |
|---|---|
| **Jornada** | 7h20 (`cargaFeriadoMs`) |
| **Horário** de entrada/saída | `entradaEsperadaNoDia`/`saidaEsperadaNoDia` |
| **Adicional de 100%** | sobre o que exceder as 7h20 |
| **Isenção de hora devida** | viaja com o adicional |

### O que o feriado NÃO herda

- **O rodízio de grupos de domingo.**
- **A folga.** `ehDiaDeFolga` não recebe `ehFeriado` e decide pelo dia REAL: quem
  folga no domingo e está escalado numa segunda feriada **trabalha** nessa
  segunda. Isso já estava correto antes desta ADR e há teste que o protege — foi
  verificado explicitamente, porque a hipótese inicial era de que a folga
  estivesse deslocada. Não estava.

### Por que a isenção de débito continua

Decisão explícita do dono do produto: as horas do feriado são pagas a **100%** e
o trabalhador as cobra. Debitá-las seria cobrar o mesmo dia duas vezes. Quem
trabalha menos que as 7h20 num feriado não fica devendo.

### Limites que não mudam

O teto de extras é **1h50 por dia, em todos os dias** — acima disso é TAC. Num
feriado, com jornada de 7h20, isso significa TAC a partir de 9h10 trabalhadas.
As jornadas normais do 6x1 seguem: domingo 7h20, segunda a quinta 7h, sexta e
sábado 8h.

## Correção (mesma data)

A primeira versão desta ADR decidiu o **oposto**: que a jornada do feriado seria a
do **dia real** (uma segunda feriada esperaria 7h). Estava errada, e foi corrigida
pelo dono do produto no mesmo dia.

O erro veio de uma leitura ambígua do requisito ("que apenas seja o horário de
domingo") somada a um diagnóstico correto: o problema *era* o remapeamento para o
índice 0. Mas a conclusão não seguia. A jornada do feriado **é** 7h20; o defeito
estava em **de onde** esse número era lido — do domingo de cada contrato, que pode
ser zero — e não no valor em si.

Efeito prático da versão errada, enquanto durou: uma segunda feriada com 8h20
trabalhadas contava 1h20 de extra em vez de 1h, porque media contra 7h em vez de
7h20. Quem cumpria exatamente 7h20 num feriado ganhava 20 minutos de extra
indevidos.

A alternativa 1 abaixo ("dar ao contrato uma carga própria de feriado") havia sido
**descartada** na primeira versão. Era a correta.

## Alternativas descartadas

1. **Ler a jornada do feriado de `cargaBaseMs(0)`** (o comportamento original).
   É o defeito: para quem folga fixo no domingo esse valor é zero, e o feriado
   passa a esperar zero hora.
2. **Usar a jornada do dia real** (a primeira versão desta ADR). Descartada: a
   jornada de um feriado é 7h20 por regra, não a do dia em que ele cai. Media as
   extras contra a base errada.
3. **Tirar a isenção de débito** ("feriado é como qualquer dia, então quem
   trabalha menos deve"). Descartada pelo dono do produto: as horas são pagas a
   100% e cobrá-las de volta como débito seria cobrar duas vezes.
4. **Proibir carga zero nos contratos.** Trataria o sintoma e quebraria um caso
   legítimo — um contrato com domingo em zero está correto, e num domingo REAL
   trabalhado é certo que tudo conte como extra.
5. **Coluna `cargaFeriadoMin` no `TipoContratoJornada`.** Não descartada, apenas
   adiada: hoje 7h20 vale para todos os contratos, e `cargaFeriadoMs` no
   adaptador é o ponto de entrada pronto para quando a gestão precisar variá-la
   por contrato. Evita uma migração sem demanda.

## Consequências

- **Fim dos TAC falsos e das extras infladas em feriado** para quem tem o domingo
  zerado no contrato: a jornada esperada passa de 0 para 7h20.
- **Quem cumpre 7h20 num feriado não gera extra** — nem os 20 minutos que a versão
  errada desta ADR produzia.
- **Atestado em feriado abona 7h20**, a jornada do feriado.
- **A isenção de hora devida em feriado permanece**, com teste dedicado para que
  nenhuma correção futura a arraste.
- A regra deixa de estar duplicada: os dois chamadores usam `cargaBaseDoDia`.
- `cargaFeriadoMs` é obrigatório em `RegrasContrato`: um contrato novo não pode
  esquecer de definir a jornada do feriado.

## Referências

- [`ponto`](../../03-atlas-backend/ponto.md) — `cargaBaseDoDia`, `CARGA_FERIADO_MS`, `diaPagaAdicional100`
- [`central-jornada`](../../03-atlas-backend/central-jornada.md) — regra 4 (isenção)
- [`feriados`](../../03-atlas-backend/feriados.md) — regra 4
- [`escala-domingo`](../../03-atlas-backend/escala-domingo.md) — regra 7 (horário)
- [`tipos-contrato`](../../03-atlas-backend/tipos-contrato.md) — parâmetros por contrato
