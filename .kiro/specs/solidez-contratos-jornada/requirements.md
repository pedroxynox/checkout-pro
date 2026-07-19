# Requisitos — Solidez de Contratos, Jornada, TAC e Operadores

> **Objetivo.** Tornar mais sólidas quatro áreas críticas: **tipos de contrato**,
> **jornada/TAC**, **Central de Jornada** e **cadastro de operadores**. "Sólido"
> significa: (1) não se quebra sozinho com o tempo; (2) não pode ser quebrado sem
> querer ao mexer no código (protegido por testes); (3) o sistema avisa se algum
> dado ficar inconsistente.
>
> **Decisões já tomadas com o dono do produto:**
> - **Opção A:** existe **um único conceito "Tipo de Contrato"** que já traz suas
>   próprias regras de **jornada e de TAC** (carga por dia, intervalos, limites de
>   extras e TAC, adicional de domingo/feriado). Podem existir **vários** tipos.
> - **Hora de Brasília, sempre:** todo cálculo de data/hora usa a hora de Brasília,
>   de forma única e centralizada.
> - O tipo de contrato **6x1** que já existe é **mantido e conectado** (não é
>   recriado do zero).
>
> **Ordem de execução:** Fase 0 → 1 → 2 → 3 → 4. Domingo/escalas ficam para depois.

---

## Fase 0 — Tipo de Contrato como fonte única (jornada + TAC)

**R0.1** O sistema DEVE ter um conceito único de **Tipo de Contrato** que contenha
todas as suas regras de jornada e de TAC (carga base por dia da semana, dias com
adicional de 100%, intervalo mínimo/máximo, limite de extras, limites de risco de
TAC 1h30/1h40, intervalo obrigatório, trabalha domingo).

**R0.2** Todo **colaborador** DEVE estar vinculado a exatamente um Tipo de
Contrato. O vínculo deixa de ser opcional.

**R0.3** DEVE existir sempre um Tipo de Contrato **padrão**, usado como fallback e
que **não pode ser desativado nem removido** (regra já existente, mantida).

**R0.4** O Tipo de Contrato **6x1** existente DEVE ser preservado e migrado para a
estrutura corrigida, sem perda de dados nem mudança de comportamento para quem já
o usa.

**R0.5** As regras de jornada/TAC **NÃO DEVEM** existir "fixas no código" em mais
de um lugar: a única fonte é o Tipo de Contrato (data-driven). O enum legado
`TipoContrato` e o catálogo de regras em código DEVEM ser removidos ou reduzidos a
um único ponto de fallback.

**R0.6** A criação/edição de Tipo de Contrato DEVE validar a coerência dos limites
(intervalo mínimo < máximo; risco 1h30 ≤ risco 1h40 ≤ limite de extras; carga com
7 valores; dias de adicional entre 0 e 6) — regra já existente, mantida e coberta
por testes.

## Fase 1 — TAC e jornada dependem do Tipo de Contrato

**R1.1** O cálculo da jornada do dia (trabalho, intervalo, extras 50%/100%, status)
DEVE usar **sempre** as regras do Tipo de Contrato do colaborador.

**R1.2** O **TAC** (risco 1h30 → risco 1h40 → TAC; intervalo mínimo/máximo) DEVE ser
avaliado **sempre** com os limites do Tipo de Contrato do colaborador, e não com
valores fixos no código.

**R1.3** Quando o colaborador não tiver Tipo de Contrato resolvível, o cálculo DEVE
cair no Tipo de Contrato **padrão** (nunca em números "quemados").

**R1.4** O comportamento atual para quem usa o 6x1 DEVE permanecer idêntico
(mesmos limites de hoje) — validado por testes de regressão.

## Fase 2 — Central de Jornada com todos os Tipos de Contrato

**R2.1** A Central de Jornada DEVE incluir colaboradores de **qualquer** Tipo de
Contrato (hoje filtra fixo um único tipo).

**R2.2** O cálculo por pessoa na Central DEVE usar as regras do Tipo de Contrato
**daquela** pessoa (carga, extras, devidas, TAC), não um contrato único global.

**R2.3** A inclusão/exclusão de pessoas na Central segue a função (operador,
supervisor, fiscal; gerentes/administradores fora), **independente** do tipo de
contrato.

## Fase 3 — Contratos de experiência (clareza e proteção)

**R3.1** A documentação e a interface DEVEM distinguir claramente **Contrato de
Experiência** (45+45 dias) de **Tipo de Contrato** (regras de jornada) — nomes que
hoje confundem.

**R3.2** O campo legado sem uso (`marcoEmAtraso`) DEVE ser removido ou claramente
marcado como obsoleto, sem afetar os alertas.

**R3.3** O ciclo automático do contrato de experiência (aprovação por decurso,
efetivação no dia 91, avisos nos 5 dias) DEVE continuar coberto por testes de
propriedade.

## Fase 4 — Consolidar o cadastro de operadores (retirar o legado)

**R4.1** O sistema DEVE ter **uma única fonte de verdade** para as pessoas: o
**Cadastro Unificado de Colaboradores**. Os modelos legados
(`Operador`/`OperadorTurno`/`Fiscal`) DEVEM ser retirados de forma gradual.

**R4.2** A retirada DEVE ser feita em etapas seguras, sem perda de histórico
(ponto, incidências, arrecadação) e com migração dos vínculos.

**R4.3** Ao final, nenhuma tela ou serviço DEVE depender dos modelos legados; as
consultas DEVEM usar `Colaborador`/`Fiscal` canônico.

## Requisitos transversais (todas as fases)

**RT.1 — Hora de Brasília única.** Todo cálculo de "hoje", "agora", dia da semana e
fechamento de dia DEVE usar a hora de Brasília a partir de **um único ponto**
(`common/datas`). Nenhum módulo DEVE reimplementar o deslocamento por conta própria.

**RT.2 — Regras blindadas por testes.** Cada regra crítica de TAC, jornada, contrato
e tipo de contrato DEVE ter um teste que **falhe** se o valor/comportamento mudar
sem intenção (teste "congela-regra").

**RT.3 — Integridade de dados.** DEVE existir uma verificação que sinalize registros
órfãos (ex.: incidência/vínculo apontando para colaborador inexistente), já que os
vínculos são por id sem chave estrangeira (ver ADR 0005).

**RT.4 — Documentação em dia.** Cada fase DEVE atualizar o Atlas e as regras de
negócio afetadas; a referência gerada DEVE ser regenerada. O guardião de
documentação DEVE passar.

**RT.5 — Sem regressão.** Ao final de cada fase, `npm run verify` e
`npm run docs:check` DEVEM passar.
