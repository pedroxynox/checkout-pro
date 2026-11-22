> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** regras de negócio de contratos de experiência e tipos de contrato de jornada

# Contratos e jornada

Este tema cobre **dois conceitos diferentes** que compartilham o nome "contrato":

- o **contrato de experiência (45 + 45 dias)** dos operadores — com estado sempre
  **derivado**;
- os **tipos de contrato de jornada** — um catálogo **data-driven** que define os
  parâmetros usados no cálculo da jornada.

> ⚠️ **Não confundir os dois.** O contrato de **experiência** é o período de
> avaliação do operador recém-admitido. O contrato de **jornada** é o conjunto de
> parâmetros (carga, intervalos, limites de extras/TAC) que rege o cálculo de
> horas. Detalhe técnico em [`contratos`](../../03-atlas-backend/contratos.md) e
> [`tipos-contrato`](../../03-atlas-backend/tipos-contrato.md).

## 1. Contrato de experiência (45 + 45)

O contrato de experiência acompanha o operador recém-admitido em dois marcos: o
de **45 dias** e o de **90 dias** (45 + 45).

### 1.1 Estado sempre derivado

**Regra-chave 1:** o **estado do contrato nunca é gravado** — é sempre **derivado**
da data de admissão e das decisões registradas. Os estados possíveis:

- `SEM_ADMISSAO` — ainda sem data de admissão;
- `EXPERIENCIA` — dentro do período de experiência;
- `EFETIVADO` — passou pela experiência;
- `ENCERRADO` — reprovado por decisão explícita.

### 1.2 Ciclo automático

2. **O marco de 45 é aprovado por decurso** e a **efetivação acontece sozinha no
   dia 91** — sem exigir decisão manual.
3. **Decisão condicionada:** o marco de 90 só pode ser decidido **após aprovar o
   de 45**; nada pode ser decidido **após uma reprovação**.
4. **Reprovação explícita encerra** o contrato (mantida para casos históricos).

### 1.3 Avisos de vencimento

5. Nos **5 dias** antes de completar 90 dias, o sistema envia **um alerta por
   dia** aos gestores, avisando que a **efetivação será automática** — se
   pretenderem encerrar, devem fazê-lo antes. Este é o **único** alerta do ciclo
   (não existe mais "decisão em atraso", pois nada fica pendente).
6. A carteira tem um **semáforo de urgência** (`INATIVO`/`OK`/`ATENÇÃO`/`CRÍTICO`)
   para priorizar os cards.

### 1.4 Escopo e permissões

7. **O contrato de experiência aplica-se aos operadores** (a frente de caixa).
8. **Admissão histórica é permitida** (sem trava de data inicial do sistema).
9. **Visualizar** a carteira exige `CONTRATOS_VISUALIZAR`; **definir admissão e
   decidir marcos** exige `CONTRATOS_GERIR` (ver
   [Perfis e permissões](../perfis-e-permissoes.md)).

## 2. Tipos de contrato de jornada (data-driven)

Os **tipos de contrato de jornada** formam um catálogo **editável pela gestão**,
sem tocar no código. Cada tipo define os parâmetros de jornada — carga base por
dia, carga do feriado, dias a 100% (inclusive o feriado), intervalos, limites de
extras e de TAC, 1º e 2º aviso, teto de horas no dia, folgas por semana, folgas
padrão e se o sábado pode ser folga — que o cálculo da jornada consome
(ver [Ponto, jornada e TAC](ponto-jornada-e-tac.md)).

**Regras-chave:**

10. **Data-driven:** novos contratos entram pela interface do Centro de Controle;
    o cálculo é **genérico** sobre os parâmetros, sem mudança de código.
11. **Sempre existe um contrato padrão** (semeado na base), que serve de
    *fallback* do cálculo e **não pode ser desativado nem removido**. Todo
    colaborador tem um tipo de contrato **obrigatório**; sem escolha, recebe o
    padrão (Fase 0 do spec `solidez-contratos-jornada`).
12. **Contrato em uso não é removido** — é preciso reatribuir os colaboradores ou
    apenas desativá-lo. Um contrato que está no **histórico da jornada** de alguém
    (vigência, [ADR 0027](../../02-arquitetura/decisoes/0027-vigencia-da-jornada.md))
    também conta como em uso: ele decide os dias daquele período e só pode ser
    desativado. **As regras de cálculo de um contrato em uso também não mudam**
    (mudariam dias já calculados): duplica-se o contrato, ajusta-se a cópia e ela
    é aplicada com vigência. Nome, descrição e ativo continuam editáveis. O
    padrão conta sempre como em uso.
13. **Coerência dos limites** é validada no servidor: intervalo mínimo menor que o
    máximo; limites crescentes (1º aviso ≤ 2º aviso ≤ limite de extras — ver o TAC
    em [Ponto, jornada e TAC](ponto-jornada-e-tac.md)); folgas padrão sem
    repetição, no máximo as folgas por semana, e sábado só se o contrato permitir.
14. **Só o administrador** (`ADMIN_DADOS`) mexe no catálogo, pois ele afeta o
    cálculo de horas e a folha.

O administrador também pode **duplicar** um contrato (a cópia nasce inativa) e
**escolher o padrão**. A troca do padrão é recusada enquanto houver batida sem
ficha de colaborador, porque o padrão decide todos os dias dessas batidas. Um
contrato novo nasce com **2 folgas por semana** e feriado de 7h20 a 100%.

## 3. Vigência: cada dia com o contrato que valia nele

Desde o fim do 6x1 (spec `jornada-5x2`), a mudança de contrato, folgas ou horário de
uma pessoa é gravada como uma **vigência** com data de início
([ADR 0027](../../02-arquitetura/decisoes/0027-vigencia-da-jornada.md)):

15. **Cada dia é calculado com o contrato daquele dia.** Corrigir hoje uma batida de
    20/11 usa o contrato de 20/11, não o de agora.
16. **Os dias anteriores à primeira vigência seguem a ficha** (o 6x1), sem mudança.
17. **Vigência em ciclo de folha fechado é recusada** (a escrita entra com a tela da
    ficha).

## 4. Como os dois se conectam ao colaborador

- O **cadastro do colaborador** define a admissão (para o contrato de
  experiência) e o **tipo de contrato de jornada** atribuído (para o cálculo de
  horas). Ver [`colaboradores`](../../03-atlas-backend/colaboradores.md).
- Hoje existe, na prática, um único contrato de jornada padrão (o vigente 6x1–2x1),
  mas a atribuição por colaborador já está pronta para novos contratos.
