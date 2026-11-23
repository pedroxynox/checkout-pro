> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** regras de negócio de escala e rodízio de domingo

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

1. **O cadastro (a ficha) é a fonte única da escala** (Opção A): horário e folga
   de cada dia saem da ficha do colaborador
   ([ADR 0023](../../02-arquitetura/decisoes/0023-folga-a-ficha-manda.md) e
   [ADR 0026](../../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md)).
2. **Não existe mais "horário especial"** que sobreponha a ficha: as exceções por
   dia da semana foram retiradas (ADR 0026). Para mudar o horário de alguém, edita-se
   a ficha.
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

## 5. Vigência da jornada

14. **A escala de um dia segue a vigência daquele dia**
    ([ADR 0027](../../02-arquitetura/decisoes/0027-vigencia-da-jornada.md)): quem passou
    ao 5x2 é escalado pela disponibilidade e pelas folgas da vigência; antes do corte, e
    para quem não tem vigência, valem a ficha e o rodízio de domingo acima.

## 5.1 Rodízio de folgas do 5x2 (desde 23/11/2026)

No 5x2, quem tem grupo (G1/G2/G3) folga **2 dias por semana**, e os dias mudam a
cada semana de um ciclo de 3 semanas
([ADR 0028](../../02-arquitetura/decisoes/0028-rodizio-de-folgas-5x2.md)). A semana
vai de **segunda a domingo**; a semana 1 começou na segunda **23/11/2026**:

| Grupo | Semana 1 | Semana 2 | Semana 3 |
|---|---|---|---|
| G1 | qui + sex | ter + qua | seg + dom |
| G2 | ter + qua | seg + dom | qui + sex |
| G3 | seg + dom | qui + sex | ter + qua |

**Regras-chave:**

15. **Ninguém de grupo folga no sábado.** Cada dia útil e cada domingo têm um
    grupo de folga; cada grupo trabalha 2 domingos e folga 1.
16. **Continuidade dos domingos:** no 6x1, G3 folgou 08/11, G2 15/11 e G1 22/11;
    no 5x2, G3 folga 29/11, G2 06/12 e G1 13/12. Ninguém passa de 2 domingos
    seguidos nem de 5 dias seguidos de trabalho.
17. **O rodízio tem vigência:** mudar a tabela é gravar uma nova, que começa numa
    segunda-feira; os dias anteriores não mudam. Não se grava vigência que comece
    num ciclo de folha fechado.
18. **A configuração recusa** início fora da segunda, semana sem exatamente 2 dias
    distintos e sábado; e **avisa, sem impedir**: dia sem grupo de folga ou com
    mais de um, mais de 6 dias seguidos e mais de 2 domingos seguidos (também na
    passagem do rodízio anterior).
19. **Vale só para quem tem grupo numa vigência da jornada.** Quem não tem grupo
    folga nas folgas fixas da ficha ou nas padrão do contrato. Os dias do 6x1
    continuam com a folga fixa e o rodízio de domingo acima.
20. A configuração fica no Centro de Controle, com a mesma permissão do rodízio de
    domingo (`ESCALA_DOMINGO_CONFIG`).

## 6. Observações

- O rodízio assume **exatamente 3 grupos** (2x1); uma operação com número
  diferente de grupos exigiria revisar a regra.
- A escala é **visualizada** por todos os perfis operacionais
  (`ESCALA_VISUALIZAR`), mas **editada** só por supervisor, gerente e
  administrador (`ESCALA_EDITAR`).
