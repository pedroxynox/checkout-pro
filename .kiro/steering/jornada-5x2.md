# Jornada 5x2 — trabalho em andamento (fim do 6x1)

> Aprovado pelo dono em **22/11/2026**. Spec completo:
> [`.kiro/specs/jornada-5x2/`](../specs/jornada-5x2/requirements.md)
> (`requirements.md` → `design.md` → `tasks.md`). **Ler antes de mexer em
> contratos, escala, folga, ponto, TAC, Central de Jornada, compensação ou ficha
> do colaborador.**

## Em uma frase

A partir de **23/11/2026** a empresa trabalha em **5x2 (44 h)**, com folgas pelo
**rodízio de folgas G1/G2/G3** (ciclo de 3 semanas, segunda a domingo) e horário
por dia (**disponibilidade**) na ficha; em **16/12/2026** passa a **42 h**. Os dias
até **22/11** continuam no **6x1** para sempre, por meio de **vigências**.

## Regras que valem agora (até a Fase 7 do spec)

- **Nenhum cálculo novo pode ler a ficha atual para decidir um dia.** Use a
  *jornada prevista do dia* (vigência daquele dia). Ver `design.md` §1 e §3.
- **Passado imutável:** dias até 22/11 dão os mesmos números de antes, mesmo
  depois de correções. Ciclo de folha fechado não aceita vigência nova.
- **Pausa de transição:** `PAUSA_TRANSICAO_JORNADA=true` em produção suspende
  falta automática, avisos de atraso/TAC/ponto em folga e alertas de fiscais
  baseados no horário antigo. O ponto continua funcionando. Só desligar depois
  das Fases 1–4 e das vigências de 23/11 carregadas.
- **Não fechar o ciclo 26/10–25/11** antes das vigências de 23/11.
- **Não editar o contrato 6x1**; contratos em uso não mudam regras — duplica-se e
  transfere-se com data.
- Domingo e feriado: extras a 100% e sem débito, com a carga do contrato
  (feriado tem carga própria).
- Decisões pendentes com o dono estão no fim de `requirements.md`: **não
  inventar** os valores.

## Ao terminar uma tarefa do spec

Marcar `[x]` em `tasks.md` com o número do PR e, se mudou o estado da transição
(pausa ligada/desligada, vigências carregadas, ciclo fechado), atualizar este
arquivo.
