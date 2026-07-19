> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de contratos de experiência e tipos de contrato de jornada

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
   dia** aos gestores; um alerta de "decisão em atraso" tem **prioridade** sobre o
   de vencimento.
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
dia, intervalos, limites de extras e de TAC — que o cálculo da jornada consome
(ver [Ponto, jornada e TAC](ponto-jornada-e-tac.md)).

**Regras-chave:**

10. **Data-driven:** novos contratos entram pela interface do Centro de Controle;
    o cálculo é **genérico** sobre os parâmetros, sem mudança de código.
11. **Sempre existe um contrato padrão** (semeado na base), que serve de
    *fallback* do cálculo e **não pode ser desativado nem removido**.
12. **Contrato em uso não é removido** — é preciso reatribuir os colaboradores ou
    apenas desativá-lo.
13. **Coerência dos limites** é validada no servidor: intervalo mínimo menor que o
    máximo e limites crescentes (risco 1h30 ≤ risco 1h40 ≤ limite de extras — ver
    o TAC em [Ponto, jornada e TAC](ponto-jornada-e-tac.md)).
14. **Só o administrador** (`ADMIN_DADOS`) mexe no catálogo, pois ele afeta o
    cálculo de horas e a folha.

## 3. Como os dois se conectam ao colaborador

- O **cadastro do colaborador** define a admissão (para o contrato de
  experiência) e o **tipo de contrato de jornada** atribuído (para o cálculo de
  horas). Ver [`colaboradores`](../../03-atlas-backend/colaboradores.md).
- Hoje existe, na prática, um único contrato de jornada padrão (o vigente 6x1–2x1),
  mas a atribuição por colaborador já está pronta para novos contratos.
