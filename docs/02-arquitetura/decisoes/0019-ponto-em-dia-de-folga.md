# ADR 0019 — Ponto em dia de folga: aceitar e apontar, em vez de recusar

- **Status:** aceita
- **Data:** 2026-09-15
- **Contexto:** Relógio de Ponto, Central de Jornada, cadastro de colaboradores

## Contexto

O Relógio de Ponto recusava com `409` qualquer batida num dia de folga
(`PontoEmFolgaError`). A regra parecia obviamente certa: se é o descanso da
pessoa, ela não deveria estar registrando ponto.

A premissa estava errada, e quem opera o sistema descreveu o caso real:

> "O erro que tenho hoje é que esqueço de mudar a folga de alguém, e quando ela
> vai trabalhar não deixa marcar porque no sistema é o dia de folga dela."

Ninguém trabalha no seu descanso. O que acontece é que **a folga mudou e o
cadastro não foi atualizado**. A pessoa chega para o turno normal dela e o relógio
a rejeita.

Recusar era o pior desfecho possível dos três em jogo:

1. a pessoa trabalha o dia inteiro **sem registro nenhum** — some da jornada, das
   horas, da folha;
2. o **erro de cadastro** que causou tudo continua invisível: nada no sistema
   registra que houve uma tentativa;
3. alguém tem de resolver no calor do momento, sem saber onde está o problema.

## Decisão

**Aceitar a batida e apontar a divergência.** O bloqueio foi removido e a classe
de erro apagada (com um comentário no lugar, para ninguém a recriar por engano).

O dia é calculado como **qualquer dia de trabalho**: jornada do dia, extras de
50%, débito se houver. **Nenhum** tratamento especial — não é domingo, não é
feriado, não paga 100%. Ela veio cumprir o turno normal dela.

A divergência é sinalizada em três momentos:

| Quando | O quê |
|---|---|
| Ao registrar | Aviso à supervisão, **uma vez por pessoa/dia** (`AvisoPontoEmFolga`), com a **sugestão do novo dia de folga** |
| Enquanto não se corrige | Inconsistência `PONTO_EM_FOLGA` no painel da Central de Jornada |
| Ao corrigir a escala | Aviso de **resolução**, uma vez (cron de 5 min marca `resolvidoEm`) |

### Por que NÃO é TAC

Foi a decisão mais discutida, e a resposta mudou o desenho. O TAC entra no ranking
da pessoa e na planilha da folha. Marcar isto como TAC deixaria uma mancha no
histórico de alguém **por um esquecimento administrativo** — ela trabalhou
normalmente.

O apontamento vive no **painel de inconsistências**, que é por definição a lista
do que o **gestor** precisa resolver, e não toca nenhum indicador da pessoa:
`tac`, `diasTac`, `faltas`, o ranking e todos os valores monetários ficam
inalterados. No app o item é **azul** (informativo), não vermelho: a cor separa
"corrigir o cadastro" de "cobrar alguém".

### A cura é automática, por construção

O TAC e as inconsistências **não são persistidos** — são recalculados a cada
consulta. Quando o gestor corrige a folga, o apontamento desaparece sozinho na
consulta seguinte. Não há nada a programar, e é impossível ficar um apontamento
órfão.

O que **precisou** de código foi o aviso de resolução: a correção acontece no
**cadastro**, que não passa pelo Relógio Ponto e portanto não tem como notificar.
O cron de 5 minutos — o mesmo que já revalida as ocorrências automáticas — refaz a
pergunta à regra única de folga e fecha o aviso.

### A sugestão do novo dia de folga

Avisar "há uma divergência" resolve metade do problema: o gestor ainda tem de
descobrir qual é o novo dia de folga, e é justamente o passo em que se esquece de
novo.

O ponto batido é a evidência. `sugerirFolgaPorBatidas` (função pura) olha as
semanas recentes e conclui, por exemplo: *"nas últimas 3 semanas ela trabalhou
toda segunda e não apareceu nenhuma quarta — a folga parece ter mudado para
quarta"*.

A regra é **conservadora de propósito**: exige que a folga do cadastro tenha sido
trabalhada em **todas** as semanas observadas (mínimo 2) e que exista
**exatamente um** dia sem nenhuma presença. Domingo nunca é candidato (ali a
escala vem do rodízio). Qualquer ambiguidade devolve `null` e o aviso sai sem
sugestão — um palpite errado sobre a folga de alguém é pior do que não palpitar,
porque o gestor pode aplicá-lo sem verificar.

A sugestão **nunca se aplica sozinha**. A frase termina em "Confirme no cadastro".

## Alternativas descartadas

1. **Manter o bloqueio e pedir ao gestor que corrija antes.** É o comportamento
   que gerou o problema: a pessoa fica sem registro enquanto espera, e o gestor
   costuma não estar disponível no início do turno.
2. **Pedir confirmação na tela** ("hoje é seu descanso, confirma?"). Descartada
   pelo dono do produto: a pessoa não tem nada a confirmar, ela sabe que é o dia
   dela de trabalho. A dúvida é do sistema, não dela.
3. **Tratar como TAC.** Ver acima: penalizaria a pessoa por um erro de cadastro.
4. **Pagar as horas a 100%, como domingo/feriado.** Foi a proposta inicial e o
   dono do produto a corrigiu: não é trabalho em descanso, é um dia comum. Pagar
   100% criaria um incentivo perverso a não corrigir o cadastro.
5. **Registrar como `IncidenciaEscala`.** Teria criado persistência (e o problema
   de mantê-la coerente) para algo que o cálculo derivado já resolve de graça,
   incluindo a cura automática.

## Consequências

- Ninguém mais trabalha sem registro por causa de uma escala desatualizada.
- O erro de cadastro passou de invisível a **visível em três lugares**, com
  sugestão de correção.
- A pessoa não é penalizada: zero impacto em TAC, faltas, ranking e folha.
- Uma tabela nova (`AvisoPontoEmFolga`) apenas para dedup do aviso, com
  `resolvidoEm` em vez de exclusão — a trava continua valendo e fica rastro da
  correção.
- **Risco residual — resolvido depois.** Aceitar o ponto sem ajustar a varredura
  deixou a pessoa trabalhando fora de **toda** vigilância: `escaladosDoDia` exclui
  a folga, então ela saía para o intervalo, não voltava, e nenhum gestor era
  avisado. Foi corrigido acrescentando as batidas do dia como **segunda fonte** da
  varredura (`vigiadosForaDaEscala`, regra 17 de
  [`ponto`](../../03-atlas-backend/ponto.md)).

  A lição vale além deste caso: ao **relaxar uma recusa**, o caminho que passou a
  ser permitido precisa herdar as verificações do caminho normal. Aqui a recusa era
  o que garantia que ninguém trabalhasse fora da escala — retirá-la, sozinha,
  transferiu para a vigilância um caso que ela nunca soube tratar. Só o
  não-retorno alcança essa pessoa: atraso e falta pressupõem uma hora esperada,
  que num dia de folga não existe.

## Referências

- [`ponto`](../../03-atlas-backend/ponto.md) — regra 6, `sugestao-folga.domain.ts`
- [`central-jornada`](../../03-atlas-backend/central-jornada.md) — regra 15, `PONTO_EM_FOLGA`
- [`escala-domingo`](../../03-atlas-backend/escala-domingo.md) — a regra única de folga
- [ADR 0018](0018-feriado-jornada-do-dia-real.md) — o feriado, que **sim** paga 100%
