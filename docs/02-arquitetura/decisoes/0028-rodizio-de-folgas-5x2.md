> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `backend/src/escala-domingo/rodizio-folgas.*`, `backend/prisma/schema.prisma` (`RodizioFolgasVigencia`)

# ADR 0028 — Rodízio de folgas do 5x2: uma tabela por grupo e semana, com vigência

## Contexto

No 6x1 cada pessoa tinha **uma folga fixa** na semana (`Colaborador.folgaDiaSemana`)
e os domingos seguiam um rodízio de 3 grupos (G1/G2/G3) em que um grupo folgava por
domingo ([`escala-domingo`](../../03-atlas-backend/escala-domingo.md)). A âncora
desse rodízio (um domingo e a ordem dos grupos) basta para dizer quem folga em
qualquer domingo.

No 5x2 (desde 23/11/2026) quem tem grupo folga **2 dias por semana**, e os dias
mudam de semana para semana num ciclo de 3 semanas (decisão 5 do spec
[`jornada-5x2`](../../../.kiro/specs/jornada-5x2/requirements.md)):

| Grupo | Semana 1 | Semana 2 | Semana 3 |
|---|---|---|---|
| G1 | qui + sex | ter + qua | seg + dom |
| G2 | ter + qua | seg + dom | qui + sex |
| G3 | seg + dom | qui + sex | ter + qua |

Ninguém de grupo folga no sábado. A semana vai de segunda a domingo.

## Decisão

1. **Tabela própria com vigência:** `rodizio_folgas_vigencias` guarda, a partir de
   uma **segunda-feira** (`vigenteDesde`), o número de semanas do ciclo e o padrão
   `grupo → semana → dias` (JSON, dias 0 = domingo). A semana 1 começa em
   `vigenteDesde`; o ciclo repete depois. Cada dia é decidido pela vigência de
   maior início que não passe dele, como a vigência da jornada
   ([ADR 0027](0027-vigencia-da-jornada.md)). Mudar o rodízio é gravar uma vigência
   nova numa data, e os dias anteriores ficam como estavam.
2. **A migração `9zzw_rodizio_folgas` semeia 23/11/2026** com a tabela acima. Ela
   continua os domingos do rodízio antigo (G3 folgou 08/11, G2 15/11, G1 22/11 → G3
   folga 29/11, G2 06/12, G1 13/12), então ninguém passa de 2 domingos seguidos.
3. **Só vale para quem tem grupo numa vigência da jornada** (regime SEMANAL). A
   jornada prevista (`previstoNoDia`) recebe `folgasDoGrupo(grupo, dia)` do
   `JornadaVigenciaService.consultor`. Sem rodízio vigente no dia, o grupo **não
   afirma** folga nem turno (o mesmo cuidado do domingo sem âncora no 6x1).
4. **O rodízio antigo de domingo não é apagado:** continua decidindo os dias do
   regime 6x1 (antes da primeira vigência de cada pessoa) e aparece na prévia da
   tela para conferir a passagem.
5. **Validar bloqueia, avisar não** (R3.3, R3.4):
   - **Bloqueia (400):** início que não é segunda; ciclo fora de 1 a 6 semanas;
     faltando G1, G2 ou G3, ou semana a menos; semana sem exatamente 2 dias
     distintos; sábado.
   - **Só avisa:** dia (fora o sábado) sem grupo de folga ou com mais de um; mais
     de 6 dias seguidos trabalhados; mais de 2 domingos seguidos, inclusive na
     passagem do rodízio anterior.
6. **Ciclo de folha fechado não aceita** vigência que comece nele (409): os dias
   desde o início seriam recalculados.

## Alternativas consideradas

- **Estender a âncora do domingo** para os dias da semana. Rejeitada: a âncora
  descreve uma rotação de um passo por domingo; o 5x2 tem dois dias por semana que
  mudam por semana, e uma regra de rotação esconderia a tabela que o dono
  realmente definiu.
- **Folga por pessoa** (gravar as folgas de cada semana na vigência de cada um).
  Rejeitada: o rodízio é do grupo; mudar a tabela exigiria reescrever a vigência de
  todos.

## Consequências

- `GET/PUT /config/rodizio-folgas` e `POST /config/rodizio-folgas/simular`
  (`ESCALA_DOMINGO_CONFIG`). A simulação mostra avisos e prévia sem gravar.
- O número de dias de folga por grupo é fixo em **2** na validação (5x2). Um
  regime diferente exigirá revisar `validarRodizio`.
- Enquanto ninguém tiver vigência com grupo (até a Fase 4), nenhum número muda: a
  comparação `main` × branch sobre o banco de ensaio deu 158 leituras idênticas.

## Referências

- [`escala-domingo`](../../03-atlas-backend/escala-domingo.md) — rodízio de folgas e rodízio de domingo
- [`jornada-vigencia`](../../03-atlas-backend/jornada-vigencia.md) — `folgasDoGrupo` no consultor
- [Escala e rodízio de domingo](../../01-produto/regras-de-negocio/escala-e-rodizio-domingo.md)
