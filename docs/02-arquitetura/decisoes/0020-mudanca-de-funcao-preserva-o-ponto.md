# ADR 0020 — Mudança de função preserva o histórico de ponto

- **Status:** aceita
- **Data:** 2026-09-15
- **Contexto:** Relógio de Ponto, Central de Jornada, painel de Fiscais, cadastro

## Contexto

Um colaborador foi promovido a FISCAL pela tela de cadastro. A operação em si
correu bem: mesma ficha, mesmo `Colaborador.id`, login criado, escala regenerada.

O que aconteceu depois, contado por quem operava:

> "Bugou todas as horas e marcações de ponto dele: desapareceram as horas
> anotadas como batidas do dia, e aparece que deve muitas horas. Tive que anotar
> as horas de novo manualmente de todos os dias."

### A causa: uma pessoa, duas identidades de ponto

O ponto é keyed por um par polimórfico (`pessoaId`, `tipoPessoa`), como registra o
[ADR 0004](0004-cadastro-unificado-e-escala-opcao-a.md):

| Função | `pessoaId` | `tipoPessoa` |
|---|---|---|
| OPERADOR / SUPERVISOR | `Colaborador.id` | `OPERADOR` |
| FISCAL | **`Fiscal.id`** | `FISCAL` |

Ao promover alguém a fiscal, `ColaboradoresService.garantirFiscal` cria uma linha
`Fiscal` **com um id novo**. A partir daí a pessoa bate ponto com esse id — mas
todo o histórico dela continua gravado com o `Colaborador.id`. **Nada migra as
batidas, e nada precisava migrar:** o defeito não estava nos dados, estava em
quem os lia.

### O efeito em cascata, na ordem em que aconteceu

1. **O Relógio Ponto perdeu o dia.** `PontoService.jornadaDoDia` filtrava
   `pessoaId + tipoPessoa` de forma estrita. A tela passou a perguntar pela
   identidade nova; o histórico estava na antiga. Zero batidas.
   *(A Central de Jornada nunca perdeu nada — ela já cruzava as duas chaves. Foi
   por isso que o problema pareceu maior do que era.)*
2. **O painel de Fiscais e as horas extras do mês também.** Ali as fichas eram
   buscadas por `funcao`, então a função de **hoje** apagava o que a pessoa fez
   **ontem**.
3. **O gestor reanotou o dia à mão** — a reação correta diante de horas que
   pareciam perdidas.
4. **O dia terminou com oito marcações.** O limite de 4 por dia e a validação de
   duplicidade eram avaliados **por identidade**: as quatro antigas não contavam
   para a identidade nova. Nenhuma batida foi gravada por engano; cada uma passou
   pela validação da sua identidade.
5. **A jornada virou hora devida.** A ordem posicional é o que dá sentido a cada
   batida (1ª = entrada, 2ª = saída para o intervalo...). Com oito marcações
   intercaladas, o cálculo passou a medir intervalos entre marcações sem relação —
   resultando em **menos** horas do que a pessoa trabalhou, e o déficit virou
   débito contra ela.
6. **E uma falta automática no dia da transição.** A varredura comparava "já
   bateu ponto hoje?" usando só `pessoaId`, e o escalado fiscal é identificado
   pelo `Fiscal.id`. Não viu as batidas, concluiu ausência e notificou.

## Decisão

**A identidade de ponto de uma pessoa é o conjunto das suas identidades, não a
atual.** Toda leitura e toda validação de ponto passam a cobrir as duas.

O padrão, aplicado em todos os pontos afetados, são três condições:

```ts
OR: [
  { pessoaId, tipoPessoa },   // a identidade consultada
  { colaboradorId: fichaId }, // qualquer identidade vinculada à ficha
  { pessoaId: fichaId },      // batidas antigas sem vínculo gravado
]
```

A terceira existe porque num operador o `pessoaId` **é** a ficha, e batidas
anteriores à fase *expand* podem ter `colaboradorId` nulo.

Nos painéis que listavam pessoas por `funcao`, a ordem foi **invertida**: primeiro
as batidas do período, depois as fichas de quem bateu (`where: { id: { in } }`).
A função de hoje não decide o que aconteceu num dia passado; as batidas sim.

### O dia já duplicado: defesa no cálculo, não limpeza de dados

Havia oito marcações gravadas em produção, e quem opera **não tem como consultar
nem apagar linhas** do banco. A correção teve de funcionar sozinha.

`descartarBatidasRepetidas` — função pura, aplicada dentro de
`classificarBatidas`, por onde passam **todos** os cálculos de jornada — descarta
as marcações repetidas antes de classificar, usando o **mesmo critério e o mesmo
limite** que o relógio já usa para recusar uma batida próxima demais
(`batidaDuplicada`, 2 min).

Três escolhas deliberadas:

- **Nada é apagado.** As duas séries continuam no banco, na auditoria, e o painel
  de inconsistências segue apontando `DUPLICADA` naquele dia — é assim que o
  gestor descobre que há algo para revisar.
- **Mantém a primeira** de cada grupo (a que o relógio aceitou primeiro), com
  desempate por `id`. Precisa ser **determinístico**: sem isso o total de horas de
  uma pessoa mudaria entre dois carregamentos da mesma tela, conforme a ordem em
  que o banco devolvesse as linhas.
- **Compara com a última MANTIDA**, não com a anterior original. A consequência é
  conservadora: uma marcação a exatamente 2 min sobrevive. Entre descartar de
  menos e descartar de mais, vale o de menos — uma marcação a mais aparece como
  `DUPLICADA` e o gestor decide; uma a menos apaga trabalho real da conta de
  alguém.

## Alternativas descartadas

1. **Reetiquetar as batidas históricas** (`pessoaId → Fiscal.id`,
   `tipoPessoa → FISCAL`). Devolveria o histórico às telas de fiscal, mas é um
   `UPDATE` em massa sobre registros de trabalho — irreversível na prática, e num
   dia com oito marcações violaria o invariante de 4/dia. Reescrever o passado
   para consertar uma leitura é a ordem errada.
2. **Migrar as batidas no momento da mudança de função.** Move o problema: quem
   já mudou de função antes da migração continua quebrado, e cada mudança futura
   passa a mexer em dados de folha.
3. **Uma coluna/tabela de "identidades da pessoa".** É a solução estruturalmente
   correta a longo prazo, e o `ADR 0004` já aponta nessa direção (aposentar o
   `Fiscal` em favor da ficha única). Descartada **agora**: exigiria migração e
   tocar todo o módulo de ponto, com um caso de folha em aberto. O `OR` de três
   condições é o passo compatível.
4. **Apagar as batidas duplicadas por SQL.** Quem opera não tem esse acesso — e
   apagar registros de ponto para corrigir um cálculo é o tipo de conserto que não
   se desfaz.
5. **Uma flag `anuladaEm` nas batidas.** Resolveria a duplicidade de forma
   explícita e auditável, mas exige mudança de schema e uma tela para gerenciá-la.
   Fica anotada como caminho se a defesa no cálculo se mostrar insuficiente.

## Consequências

- O histórico de ponto **sobrevive a uma mudança de função**, em todas as telas.
- **Impossível recriar o dia duplicado:** a validação de duplicidade e o limite de
  4 marcações agora enxergam a pessoa inteira, então a reanotação é recusada.
- Os dias já duplicados **voltam a calcular a jornada real**, sem que ninguém
  toque no banco.
- Fim da falta automática espúria no dia da transição.
- **Não há migração neste ADR.** Nenhum dado foi alterado — só a forma de lê-los.
- **Dívida que fica:** a identidade dupla continua existindo. Enquanto o `Fiscal`
  não for aposentado (ADR 0004), qualquer consulta nova a `batidas_ponto`,
  `ausencias` ou `registros_ponto_fiscal` precisa cobrir as duas chaves. Está
  registrado nos riscos de [`ponto`](../../03-atlas-backend/ponto.md) e
  [`fiscais`](../../03-atlas-backend/fiscais.md).

## Referências

- [`ponto`](../../03-atlas-backend/ponto.md) — `descartarBatidasRepetidas`, `filtroBatidasDaPessoa`
- [`fiscais`](../../03-atlas-backend/fiscais.md) — painel e horas extras por ficha
- [`colaboradores`](../../03-atlas-backend/colaboradores.md) — `garantirFiscal`
- [ADR 0004](0004-cadastro-unificado-e-escala-opcao-a.md) — os ids polimórficos
