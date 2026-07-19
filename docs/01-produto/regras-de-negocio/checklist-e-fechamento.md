> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de checklist e fechamento do dia

# Checklist e fechamento

Este tema cobre os **checklists diários por foto** (abertura e fechamento) e o
**fechamento operacional do dia** (quando todos os arquivos estão resolvidos).

Detalhe técnico: [`checklist`](../../03-atlas-backend/checklist.md) e
[`fechamento`](../../03-atlas-backend/fechamento.md).

## 1. Checklists por foto

Há dois checklists por dia — **abertura** e **fechamento** — comprovados por foto
(na prática, o print do checklist feito no app externo).

**Regras-chave:**

1. **"FEITO" só com imagem válida.** A comprovação exige uma imagem rasterizada
   de uma lista fechada de formatos; **SVG é recusado** por segurança (evita
   XSS).
2. **Extensão de gravação segura:** o arquivo é gravado com uma extensão
   **derivada do tipo validado**, nunca com o nome enviado pelo cliente.
3. **Não se preenche dia passado** — a comprovação é do dia corrente.
4. **Data ≥ Data Inicial do Sistema** é exigida antes de gravar.

## 2. Janelas e pontualidade

A pontualidade é medida por **janelas fixas** de execução:

- **Abertura:** 08:15–09:15
- **Fechamento:** 13:15–14:15

5. **Fora da janela conta como atraso.** O estado visual de cada checklist é
   `FEITO_NO_PRAZO`, `ATRASADO`, `PENDENTE` ou `NAO_FEITO`.
6. **Lembretes e alertas:** um lembrete de início 5 minutos antes da janela
   (08:10/13:10) e um alerta de pendência 15 minutos antes do limite
   (09:00/14:00), quando ainda pendente.
7. As **métricas do mês** medem dias de operação (Seg–Sáb), % no prazo e a
   **racha** de dias recentes com abertura e fechamento no prazo.

## 3. Anti-fraude

8. **Foto repetida gera aviso:** se a mesma imagem (mesmo hash) aparecer em mais
   de um checklist, os gestores são avisados.
9. As **notificações são best-effort:** um erro ao avisar **nunca** derruba o
   envio da imagem.

## 4. Fechamento operacional do dia

O **fechamento do dia** detecta quando **todos os arquivos do dia** estão
resolvidos — as **5 arrecadações** + as **vendas por hora** — e monta um resumo
inteligente do estado do dia (arquivos + checklists, pendências e alertas).

**Regras-chave:**

10. **O dia está completo** quando **cada uma das 5 arrecadações** está enviada
    **ou** marcada como "sem movimento" **e** há vendas por hora.
11. **"Sem movimento" conta como resolvido**, mas **todas as 5 marcadas assim**
    geram um alerta de atenção (situação incomum).
12. **A notificação de conclusão é única por dia** — garantida por uma trava
    atômica que resiste a uploads concorrentes.
13. Itens faltantes aparecem como **`PENDENTE`** (dia atual) ou **`NAO_ENVIADO`**
    (quando o dia já passou).
14. O **resumo** é **somente leitura** (não altera nada nem notifica).

## 5. Observações

- **Ambos** — checklist e fechamento — são disparados pelos módulos de
  arrecadação/vendas ao concluir cada upload; ver
  [Arrecadação e indicadores](arrecadacao-e-indicadores.md).
- **Checklist** é liberado a todos os perfis operacionais (`CHECKLIST`);
  **Fechamento** exige `FECHAMENTO` (supervisor/gerente). Ver
  [Perfis e permissões](../perfis-e-permissoes.md).
