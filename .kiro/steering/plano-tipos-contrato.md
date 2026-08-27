# Plano — Tipos de Contrato de Jornada (reelaboração)

> Plano de trabalho **aprovado pelo dono do projeto**, a ser seguido por
> qualquer sessão que continue este assunto. Vive aqui (e não numa conversa)
> justamente para não se perder entre sessões.
>
> **Escopo:** o *tipo de contrato de jornada* (`TipoContratoJornada`, aba "Tipos
> de contrato" do Centro de Controle) — o que governa horas extras, TAC,
> intervalo, atrasos. **Não** é o contrato de experiência (área "Contratos"),
> que só entra no fim e à parte.

## Decisões já tomadas (não reabrir sem o dono)

1. **Limiares em MINUTOS FIXOS, nunca em porcentagem.** O dono recusou
   explicitamente limiares proporcionais ("não quero estar tirando
   porcentagem"). O que resolve o problema do contrato de 6h **não** é a
   proporção: é cada contrato ter os **seus** minutos, e os avisos citarem o
   número do contrato em vez de um texto fixo.
2. **Ordem das fases é a de baixo** (1 → 5). O dono aceitou começar pelo que não
   se vê (fugas, vigência) antes da tela.
3. **`6x1 – 2x1` significa:** trabalha 6 dias e folga 1; trabalha 2 domingos e
   folga 1. Os contratos reais serão criados **depois**, já com as regras novas.

## Problema que originou tudo (exemplo real do dono)

Hoje um contrato de 6h receberia o aviso *"Excedeu 1h50 de horas extras"* — texto
escrito à mão com os números do 6x1 — e os avisos preventivos de TAC (1h30/1h40)
**nem leem o contrato**: são constantes globais. Ou seja: o motor já é
data-driven em parte, mas os **avisos** não, e é neles que o erro aparece para a
pessoa.

## Fase 1 — Fechar as fugas

Regras que hoje ignoram o contrato e precisam passar a lê-lo:

- `etapaAlertaTac` (`backend/src/ponto/ponto.domain.ts`): usa
  `RISCO_TAC_1H30_MS`/`RISCO_TAC_1H40_MS` globais; não recebe `RegrasContrato`.
- **Textos dos motivos de TAC** em `calcularJornadaDia`: "Excedeu 1h50",
  "Intervalo abaixo de 1h", "Intervalo acima de 3h" são literais. Devem ser
  derivados dos limites do contrato.
- `jornadaEsperadaMs` (`backend/src/fiscais/fiscais.domain.ts`): carga diária dos
  fiscais vinda do código, usada direto em `fiscais.service.ts` e
  `fiscais-alertas.service.ts`.
- `LIMITE_EXTRAS_MS` local (7h) em `fiscais-alertas.service.ts`: limite próprio de
  extras acumuladas, fora de qualquer contrato.
- `INTERVALO_MINIMO_ENTRE_BATIDAS_MS` fixo em `central-jornada.service.ts`
  (duplicidade de batidas) em vez do valor do contrato.

## Fase 2 — Vigência e congelamento

- Cada contrato passa a ter **versões com data de vigência**. Editar **não**
  reescreve o passado: cria uma versão nova a partir de uma data.
- O cálculo de um dia usa a versão vigente **naquele** dia.
- **Ciclo de folha fechado fica imutável:** guardar, no fechamento, com que
  versão foi fechado (ou os totais), de modo que reabrir a tela no futuro mostre
  os mesmos números.
- **Auditoria:** quem alterou, quando e por quê (o padrão de
  `PermissaoAuditoria`/`DecisaoContrato` já existe no projeto).

> Hoje toda a jornada é derivada on-the-fly, então **uma edição de contrato
> reescreve retroativamente todos os dias passados, inclusive de ciclos
> fechados**. É o risco mais sério da seção.

## Fase 3 — Limiares por contrato (em minutos)

- Todo limiar de TAC/aviso passa a vir do contrato, em minutos.
- **Escalonamento de avisos configurável**: hoje são dois degraus fixos
  (1h30/1h40); passar a uma lista de degraus por contrato.
- Permitir limiares **por dia da semana** quando fizer sentido (um sábado de 8h
  não é uma segunda de 6h).
- Os avisos passam a **citar o número do contrato** ("passou dos 40 min de extra
  do seu contrato"), nunca um texto fixo.

## Fase 4 — Novas regras, agrupadas

**Jornada e carga:** carga por dia · dias com adicional 100% · como o feriado é
pago (hoje fixo = domingo) · teto de horas do dia · teto semanal e mensal ·
arredondamento de minutos.

**Intervalo:** obrigatório ou não · mínimo e máximo · intervalo objetivo (hoje é
a constante `INTERVALO_ESPERADO_MS`, sem campo no modelo) · a partir de quantas
horas é exigido · se conta como trabalhado.

**Horas extras:** máximo por dia · máximo por semana e por ciclo · os percentuais
(50/100) configuráveis · se o contrato admite extras · tolerância antes de começar
a contar.

**TAC — o que o define:** limiar de extras · degraus de aviso preventivo ·
intervalo curto/longo · encerrar sem intervalo · desrespeitar o descanso entre
jornadas · trabalhar em dia de folga · a quem avisar e com que antecedência.

**Atrasos e saídas:** tolerância de atraso (hoje `TOLERANCIA_ATRASO_MIN = 15`,
global) · tolerância de saída antecipada · a partir de quantos minutos gera
incidência · quanto se espera sem batida antes de lançar falta (hoje 2h fixas).

**Batidas:** quantas por dia (hoje 4, posicional em `tipoPorOrdem`) · janela
antiduplicado · se permite bater em dia de folga · margem antes/depois do turno.

**Descanso e escala:** descanso mínimo entre jornadas · quantas folgas por semana
· se trabalha domingo e se entra no rodízio · a cada quantos domingos folga (hoje
o rodízio é global de 3 grupos) · máximo de dias consecutivos trabalhados.

**Ciclo:** qual ciclo usa (hoje 26→25 global, em `common/datas.ts`) · se admite
banco de horas.

## Fase 5 — Tela redesenhada

- **Modelos (templates)**: partir de um modelo e ajustar o que muda.
- **Seções recolhíveis**, com o avançado escondido por padrão.
- **Cada regra explicada em palavras, com o valor real** do contrato ao lado.
- **Simulador**: rodar o contrato contra um dia real de uma pessoa e ver o
  resultado antes de aplicar.
- **Visão de impacto** ao salvar: quantas pessoas e o que muda no ciclo atual.
- Falta hoje: não há como **trocar qual contrato é o `padrao`** (o serviço força
  `padrao: false` na criação e não existe endpoint).

## Relação com a futura "Disponibilidade"

O dono pretende criar uma **Disponibilidade** na ficha do colaborador (hora de
entrada e saída de cada dia). A divisão correta, a respeitar desde já:

- **contrato = regras** (tetos, tolerâncias, o que é TAC);
- **disponibilidade = horário concreto** de cada dia.

E o contrato precisa dizer **o que fazer quando os dois se contradizem** (ex.:
disponibilidade de 10h num contrato com teto de 8h → avisa, bloqueia ou aceita
como extra?). Decisão ainda pendente com o dono.

## Estado / pendências

- Aguardando do dono: um **informativo sobre o TAC** (o que é, como funciona na
  prática), que deve ser lido **antes** de mexer nas regras de TAC das fases 1 e 3.
- Os contratos reais serão cadastrados pelo dono depois das regras novas.
- Ver também `.kiro/specs/solidez-contratos-jornada/` (plano anterior, com
  `tasks.md` desatualizado em relação ao código já entregue) e
  `docs/01-produto/regras-de-negocio/contratos-e-jornada.md`.
