# ADR 0015 — Férias como inativação NÃO rígida (some da escala, sem falta)

- **Status:** Aceito
- **Contexto:** É preciso poder colocar um colaborador de **férias** (ou
  afastamento programado) por um período. Durante as férias, a pessoa não deve
  aparecer na escala do dia nem gerar **falta automática** pelo cron de detecção
  (que marca falta de quem estava escalado e não bateu ponto 2h após a entrada).
  Ao mesmo tempo, férias **não são desligamento**: o `Colaborador.ativo` precisa
  continuar `true` (o desligamento de verdade usa `ativo=false` + `desligadoEm`,
  com janela de retenção). Também não são **falta** (nem justificada): são uma
  ausência esperada e planejada. As opções consideradas foram: (a) reaproveitar
  `ativo=false` durante as férias; (b) gravar as férias como faltas justificadas
  a prazo em cada dia; (c) modelar um período de férias próprio.
- **Correção posterior (2026-09-15):** a premissa da "fonte única" estava
  **errada**. `FiscaisService.escaladosDoDia` alimenta a equipe do dia e o cron de
  falta, mas **não** é a única a montar "quem trabalha hoje": o **Quadro de
  Operadores** (`OperadorTurnoService`, que serve `GET /quadro-operadores/*`)
  monta a sua própria lista a partir de `Colaborador`, e nunca consultou férias.
  Como as férias não tocam `ativo` nem criam `Ausencia`, a pessoa caía no caminho
  de quem trabalha e aparecia como **"Trabalha"** durante todo o período — no
  mesmo dia em que a escala publicada já a mostrava de férias. Hoje o Quadro
  também aplica a exclusão (removendo a pessoa no roster do dia e marcando
  `FERIAS` na grade semanal), mas a lição fica: **a exclusão não é central**, e
  cada construtor de escala precisa aplicá-la — ver os riscos em
  [`ferias`](../../03-atlas-backend/ferias.md) e [`operadores`](../../03-atlas-backend/operadores.md).
- **Convergência (2026-09-15, depois):** a resposta à lição acima não foi
  "lembrar de aplicar em cada lugar" — foi reduzir o número de lugares. O Quadro
  de Operadores e a escala publicada passaram a decidir estado e horário pela
  **mesma função pura**, `montarLinhaEscala`
  ([`escala-exportacao`](../../03-atlas-backend/escala-exportacao.md)), e a folga
  passou a ter uma regra única de verdade (`FolgaService`), incluindo a
  **convocação** que vence o descanso. `escaladosDoDia` **não** foi unificada: ela
  tem forma própria (whitelist, só entrada) e carrega a tradução
  `Fiscal.id ↔ Colaborador.id` que o domínio puro não conhece; além disso, a fonte
  do horário do fiscal (escala semanal × ficha) é uma decisão de produto ainda
  aberta. O que se fez foi **prender as duas com um teste de coerência**
  (`fiscais/coerencia-escalados-escala.spec.ts`), que já revelou três divergências
  reais. A duplicação restante está documentada como risco em
  [`fiscais`](../../03-atlas-backend/fiscais.md).
- **Decisão:**
  1. **Modelo dedicado `FeriasColaborador`** (`id`, `colaboradorId`, `inicio`,
     `fim` inclusivos em 00:00 UTC, `observacao?`, auditoria e `criadaEm`), com
     FK para `Colaborador` (`onDelete: Cascade`), como
     [`ColaboradorIdentificador`](../../05-referencia-dados/dicionario-de-dados.md).
     Um colaborador pode ter vários períodos (histórico). Migração aditiva
     `9u_add_ferias_colaborador`.
  2. **Inativação NÃO rígida:** férias **não tocam** em `Colaborador.ativo` e
     **não criam** linhas em `Ausencia`. A exclusão da escala é feita numa
     **fonte única** — `FiscaisService.escaladosDoDia` filtra quem está de férias
     no dia (pela ficha), usando `FeriasService.colaboradoresDeFeriasNoDia`. Como
     tanto a "equipe do dia" quanto o cron de falta automática partem de
     `escaladosDoDia`, excluir ali já garante os dois efeitos: some da escala e
     não vira falta. A escala consolidada (tela "Escala") também exclui quando há
     **data concreta**.
  3. **Decisão pura no domínio:** "está de férias no dia", sobreposição de
     períodos e validação do período ficam em `ferias.domain` (funções puras,
     testadas por propriedade — ADR 0003). O estado "de férias" é **derivado**
     dos períodos, nunca um flag persistido.
  4. **Sem sobreposição** de períodos do mesmo colaborador (evita ambiguidade),
     e **autorização de gestão** (`OPERADORES_CRUD`) para registrar/cancelar; a
     leitura segue a permissão de quem vê a escala (`OPERADORES_AUSENCIAS`).
- **Consequências:**
  - ✅ Férias saem da escala e não geram falta, sem confundir com desligamento
    (`ativo` intacto) nem com falta (nada em `Ausencia`).
  - ✅ Ponto único de verdade (`escaladosDoDia`): a regra vale para a equipe do
    dia e para o cron automaticamente, sem duplicar lógica.
  - ✅ Histórico de férias preservado (vários períodos por pessoa) e reversível
    (cancelar remove o período e a pessoa volta à escala).
  - ⚠️ A grade **semanal** genérica (sem data concreta) não conhece férias —
    elas são por dia; as telas por data (equipe do dia, escala com data) aplicam
    a exclusão corretamente.
  - ⚠️ Férias e faltas são fontes **separadas** de propósito. Se o RH quiser vê-las
    no painel de faltas como "férias", será preciso uni-las na leitura no futuro.
