> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de ponto, jornada e TAC

# Ponto, jornada e TAC

Este tema cobre como o Check-out PRO **registra o ponto**, **calcula a jornada**
(inclusive horas extras e TAC) e **apura o ciclo de folha 26→25**.

Detalhe técnico: [`ponto`](../../03-atlas-backend/ponto.md),
[`central-jornada`](../../03-atlas-backend/central-jornada.md),
[`ciclo-folha`](../../03-atlas-backend/ciclo-folha.md) e
[`fiscais`](../../03-atlas-backend/fiscais.md).

## 1. O Relógio de Ponto (leitor de comprovante)

O ponto é registrado a partir do **comprovante** do relógio físico: o app lê o
comprovante por foto (OCR feito no próprio aparelho), extrai nome, data e hora e
sugere de quem é a batida.

**Regras-chave:**

1. **A hora que vale é a do comprovante** — a hora de parede de Brasília impressa
   no comprovante, nunca a hora em que a foto foi carregada. O "agora" do sistema
   é sempre calculado no fuso de Brasília (UTC−3 fixo).
2. **Máximo de 4 batidas por dia** por pessoa.
3. **Anti-duplicidade:** duas batidas a menos de 2 minutos são recusadas.
4. **Idempotência:** reenvios da fila offline (mesmo `clienteId`) não duplicam a
   batida.
5. **Não se bate ponto em dia de folga** (folga fixa ou domingo de folga do
   rodízio — ver [Escala e rodízio de domingo](escala-e-rodizio-domingo.md)).
6. **Ciclo de folha fechado bloqueia** registrar, corrigir ou excluir batidas.

### 1.1 Classificação das batidas

As batidas são ordenadas pela hora e classificadas **pela ordem do dia**:
entrada → saída para intervalo → retorno do intervalo → encerramento. Quando o
contrato **não exige intervalo**, duas batidas próximas podem encerrar a jornada
sem intervalo.

## 2. Cálculo da jornada

A jornada do dia considera o tempo efetivamente trabalhado, o intervalo, as horas
extras e o TAC:

7. **O intervalo não conta como jornada.**
8. **Horas extras** são o que excede a jornada esperada do dia:
   - **50%** em dias comuns;
   - **100%** aos domingos e feriados (ver [Escala e rodízio de
     domingo](escala-e-rodizio-domingo.md) e o tratamento de feriados a 100%).
9. A **jornada esperada** depende do contrato de jornada da pessoa (ver
   [Contratos e jornada](contratos-e-jornada.md)); no padrão vigente, a
   referência dos fiscais é Seg–Qui 7h, Sex–Sáb 8h e Domingo 7h20.

## 3. TAC — os limites do dia

O **TAC** sinaliza quando a jornada saiu dos parâmetros aceitáveis. Ele é
acionado quando:

10. as **horas extras passam de 1h50**; **ou**
11. o **intervalo é menor que 1 hora**; **ou**
12. o **intervalo passa de 3 horas**.

### 3.1 Escalada de aviso e o intervalo máximo

- A supervisão é avisada em **etapas monotônicas**: risco a **1h30** → risco a
  **1h40** → **TAC** (só a etapa mais grave é anunciada).
- **Cada etapa é avisada uma única vez por pessoa/dia**, com dedup persistente
  que sobrevive a reinícios e coordena instâncias.
- **Retorno após o intervalo máximo é recusado** — o dia é tratado como "não
  retorno" do intervalo (vira incidência; ver
  [Disciplina e feedforward](disciplina-e-feedforward.md)).

## 4. Detecção automática de faltas e não-retornos

O sistema cruza a **escala do dia** com o Relógio de Ponto e, de forma defensiva:

13. marca **falta automática** quando passam **2 horas da entrada esperada** sem
    nenhuma batida;
14. registra **não-retorno do intervalo** quando um intervalo em curso ultrapassa
    o **intervalo máximo do contrato da pessoa** (3h no 6x1);
15. **bater ponto remove a falta automática** do dia (as faltas lançadas
    manualmente permanecem).

## 5. Ciclo de folha 26→25

A jornada é apurada por **ciclo de folha**, a janela que vai do **dia 26** ao
**dia 25** do mês seguinte. O portal gerencial (Central de Jornada) consolida por
pessoa: carga trabalhada, extras 50%/100%, horas devidas, atestados, faltas, dias
de TAC, conflitos, atrasos e o **saldo** (banco de horas).

**Regras-chave:**

16. **A janela de apuração é o ciclo 26→25** (deslocamento 0 = ciclo atual).
17. **Horas devidas só contam em dias completos** — o dia em andamento não gera
    déficit.
18. **Conflito ponto × ausência:** quando há batida e ausência no mesmo dia, valem
    as **batidas** (a ausência é ignorada no cálculo) e o conflito fica sinalizado
    para o gestor resolver.
19. **Saldo do time ≠ saldo individual:** no saldo do time, o débito de uma falta
    consome **apenas as horas a 50%**; as horas a **100% nunca são debitadas**. O
    saldo individual do card segue 50% + 100% − devidas (pode ficar negativo).
20. **Fechar o ciclo** (permissão `CENTRAL_JORNADA`) **bloqueia modificações**
    ordinárias na jornada daquele período; **reabrir** exige administrador
    (`ADMIN_DADOS`). A apuração é sempre sob demanda, então reabrir já reflete nas
    próximas leituras.

## 6. Observações

- O fiscal **registra batidas novas** de qualquer colaborador (`PONTO_REGISTRAR`)
  e vê o painel de jornada (`PONTO_VISUALIZAR`), mas **corrigir/remover** batidas
  exige `PONTO_EDITAR` (gestão). Ver [Perfis e permissões](../perfis-e-permissoes.md).
- Tudo é calculado no **dia civil de Brasília** para não gravar/ler no dia UTC
  seguinte à noite.
