> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de escala e rodízio de domingo

# Escala e rodízio de domingo

Este tema cobre a **escala semanal** de trabalho por turno e o **rodízio de
domingo** (esquema 2x1 entre os grupos G1, G2 e G3).

Detalhe técnico: [`fiscais`](../../03-atlas-backend/fiscais.md) (escala) e
[`escala-domingo`](../../03-atlas-backend/escala-domingo.md) (rodízio).

## 1. Turnos e escala semanal

Cada pessoa da operação tem um **turno** obrigatório, que organiza a escala do
dia:

- Turnos: **Abertura**, **Intermediário**, **Fechamento** e **Apoio**.
- **Turno é obrigatório** para fiscal e operador (é o que agrupa a escala do
  dia).

**Regras-chave:**

1. **O cadastro é a fonte única da escala** (Opção A): a escala semanal geral é
   gerada a partir do cadastro do colaborador. Editar o cadastro **regenera** a
   escala preservando as exceções.
2. **Horário especial prevalece** sobre a escala geral (a "escala efetiva" do dia
   usa o horário especial quando existe).
3. **Colaborador inativo sai do quadro**; reativar recria a escala a partir do
   cadastro.
4. A **escala consolidada** do dia mostra todos os escalados; **no domingo**, os
   fiscais que trabalham vêm do rodízio de grupos (abaixo).

## 2. Rodízio de domingo (2x1)

Aos domingos a operação trabalha com **2 grupos e folga 1** — o esquema **2x1**
entre **G1**, **G2** e **G3**. A cada domingo o grupo que folga avança um passo
na ordem configurada; num ciclo de **3 domingos**, cada grupo folga uma vez e
trabalha duas.

**Regras-chave:**

5. **Uma âncora basta:** um domingo de **referência** + a **ordem** do ciclo
   (uma permutação de G1/G2/G3) determinam, de forma determinística, qual grupo
   folga em **qualquer** domingo — passado ou futuro.
6. **A referência precisa ser um domingo** e a ordem precisa ser uma **permutação
   dos três grupos** (cada um exatamente uma vez); caso contrário, a configuração
   é recusada.
7. **Fora do rodízio = folga fixa aos domingos:** quem não tem grupo de domingo
   nunca trabalha aos domingos.
8. **Sem âncora configurada, o sistema não afirma folga nem turno de domingo** —
   para não bloquear o ponto nem apontar atraso por engano enquanto o rodízio não
   foi configurado.
9. A configuração do rodízio é **exclusiva do administrador**
   (`ESCALA_DOMINGO_CONFIG`; ver [Perfis e permissões](../perfis-e-permissoes.md))
   e oferece um **preview dos próximos 8 domingos** para conferência.

## 3. Entrada esperada, atraso e folga

As mesmas regras puras do rodízio alimentam o Relógio de Ponto e a apuração:

10. **Entrada esperada por dia:** Seg–Qui usa o horário de semana; Sex–Sáb o de
    fim de semana; **domingo** usa o horário de domingo (somente quando o rodízio
    está ancorado e manda a pessoa trabalhar).
11. **Atraso** só é contado quando ultrapassa a **tolerância de 15 minutos** sobre
    a entrada prevista.
12. **Dia de folga** (usado pelo ponto): de segunda a sábado vale a folga fixa da
    ficha; no domingo vale o rodízio, com a **folga fixa prevalecendo**.

## 4. Feriados = 100%

13. **Feriados são pagos a 100%** de adicional, assim como os domingos — o
    excedente sobre a jornada esperada do dia entra como hora extra a 100%. Ver
    [Ponto, jornada e TAC](ponto-jornada-e-tac.md).

## 5. Observações

- O rodízio assume **exatamente 3 grupos** (2x1); uma operação com número
  diferente de grupos exigiria revisar a regra.
- A escala é **visualizada** por todos os perfis operacionais
  (`ESCALA_VISUALIZAR`), mas **editada** só por supervisor, gerente e
  administrador (`ESCALA_EDITAR`).
