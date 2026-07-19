> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de disciplina (incidências e advertências) e feedforward

# Disciplina e feedforward

Este tema cobre a gestão de **incidências** de escala, a **disciplina
progressiva** (advertência → suspensão), as **solicitações automáticas de
advertência** por falta não justificada e o **feedforward** (acompanhamento
prospectivo de desenvolvimento).

Detalhe técnico: [`incidencias`](../../03-atlas-backend/incidencias.md),
[`advertencias`](../../03-atlas-backend/advertencias.md) e
[`feedforward`](../../03-atlas-backend/feedforward.md).

## 1. Incidências de escala

As **incidências** registram eventos de escala de um colaborador (não-retorno do
intervalo, advertência, suspensão e alguns tipos legados) numa tabela genérica
por **tipo**.

**Regras-chave:**

1. **Unicidade colaborador + tipo + data** — uma duplicata é recusada.
2. **Tabela genérica por tipo:** novos tipos de evento entram sem criar tabelas
   novas.
3. **Só o "não-retorno do intervalo" é auto-detectável** a partir do ponto (ver
   [Ponto, jornada e TAC](ponto-jornada-e-tac.md)); os demais são manuais.
4. **Sanção (advertência/suspensão) exige motivo**; a suspensão guarda o período
   (data-fim).
5. **Data não pode ser anterior à Data Inicial do Sistema.**
6. **Justificativa/abono posterior** reduz o peso da incidência no score do
   colaborador, conforme o motivo.

### 1.1 Analítica e disciplina progressiva

7. O sistema calcula **ranking**, **analítica** (taxa, reincidência, maior
   sequência, tendência e risco) e um **panorama de sanções**.
8. A **disciplina progressiva** sugere o próximo passo: **advertência →
   suspensão → avaliar desligamento**.
9. Ao **cruzar o limite mensal** de incidências (3), os gestores são avisados; um
   **não-retorno** avisa toda a operação imediatamente. Os avisos são
   *best-effort* (nunca bloqueiam o registro).

## 2. Advertências por falta não justificada

A advertência **não é automática**: um cron diário cria uma **solicitação** para
o gestor decidir.

**Regras-chave:**

10. **O cron cria só a solicitação;** o gestor **aprova** (lança a advertência) ou
    **cancela**.
11. **Idempotência por falta:** cada falta gera **no máximo uma** solicitação.
12. **Janela retroativa de 30 dias:** evita solicitações para faltas muito
    antigas ao ligar a funcionalidade.
13. **Falta justificada ou removida cancela a solicitação** automaticamente (na
    listagem e ao aprovar) — cobre o caso "o funcionário justificou e o gerente
    esqueceu de marcar".
14. **Aprovar cria a advertência** em Sanções, vinculada à falta, recusando
    duplicatas.
15. **Só quem tem `ADVERTENCIAS_DECIDIR`** (gerente/supervisor) vê e decide as
    solicitações. Ver [Perfis e permissões](../perfis-e-permissoes.md).

## 3. Feedforward (prospectivo, não punitivo)

O **feedforward** registra rodadas de acompanhamento **prospectivo** no perfil do
colaborador: foto do formulário, registro do líder, **pontos a melhorar com
prazo** e nota de evolução.

**Regras-chave:**

16. **Feedforward é prospectivo, não punitivo** — são pontos a desenvolver, não
    sanções.
17. **Semáforo pelo prazo:** um ponto pendente vira **`PROXIMO`** a ≤ 3 dias do
    prazo e **`VENCIDO`** no dia ou depois; um ponto revisado
    (`ATINGIDO`/`NAO_ATINGIDO`) sai do semáforo de prazo.
18. **Aviso diário de prazo vencido** à liderança (sem duplicar no mesmo dia).
19. **A foto do formulário só aceita imagem** (validação de tipo no upload).
20. **Só rodada de colaborador existente** é criada (evita rodadas órfãs).
21. **Gerir feedforward** exige `FEEDFORWARD_GERIR`; **acompanhar** exige
    `FEEDFORWARD_VISUALIZAR` (supervisor, gerente e administrador).

## 4. Como os três se conectam

- Uma **falta não justificada** vira **solicitação de advertência**; ao ser
  aprovada, torna-se uma **advertência** registrada nas **incidências** (Sanções).
- As **incidências** alimentam o score e o panorama de disciplina do colaborador;
  o **feedforward** acompanha o desenvolvimento em paralelo, sem caráter
  punitivo.
- O score/perfil do colaborador consome tudo isso — ver
  [`colaboradores`](../../03-atlas-backend/colaboradores.md).
