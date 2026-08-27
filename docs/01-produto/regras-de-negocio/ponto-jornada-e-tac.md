> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-27 · **Cobre:** regras de negócio de ponto, jornada e TAC

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

## 3. TAC — o que é, oficialmente

**TAC = Termo de Ajustamento de Conduta.** É o compromisso da empresa com uma
jornada saudável e conforme a lei — não é uma punição ao colaborador. O
informativo oficial da rede (Comercial Zaffari · Stok Center) lista **oito**
regras. Elas são a **fonte de verdade** deste tema:

| # | Regra oficial | Limite |
|---|---|---|
| A | **Intervalo intrajornada** | não pode ser inferior a **1 hora** |
| B | **Interjornada** | mínimo de **11 horas** entre uma jornada e outra |
| C | **Pausa durante a jornada** | não mais de **5 horas consecutivas** sem pausa de **15 minutos** (num turno) |
| D | **Horas extras** | até **2 horas** extras por dia |
| E | **Dias consecutivos** | não mais de **6 dias consecutivos** sem descanso |
| F | **Limite diário** | a jornada total do dia não pode passar de **10 horas** trabalhadas |
| G | **DSR — domingos** | não trabalhar mais de **2 domingos consecutivos** |
| H | **Descanso após o repouso semanal** | mínimo de **35 horas** antes do retorno |

### 3.1 O que o sistema verifica hoje (e o que não verifica)

Estado real do código, para não se confundir o que o app garante com o que a
regra manda:

| Regra | O sistema verifica? |
|---|---|
| A · intervalo mínimo de 1h | ✅ sim — `intervaloMinimoMs`, gera TAC |
| D · horas extras | ⚠️ sim, mas com **outro número**: o app aponta TAC acima de **1h50**, e a regra oficial é **2 horas** |
| B · interjornada 11h | ❌ não existe |
| C · pausa de 15 min em 5h | ❌ não existe |
| E · 6 dias consecutivos | ❌ não existe |
| F · limite diário de 10h | ❌ não existe |
| G · 2 domingos consecutivos | ⚠️ o rodízio de 3 grupos **evita por construção** (cada grupo folga 1 domingo em 3), mas **nada verifica** — se a âncora ou os grupos ficarem errados, ninguém é avisado |
| H · 35h após o repouso | ❌ não existe |

**Além disso, o sistema tem um gatilho que NÃO está na lista oficial:** intervalo
**acima de 3 horas** é tratado como TAC. Na prática isso descreve "saiu e não
voltou", que é conduta e não excesso de jornada — provavelmente pertence às
**incidências**, não ao TAC.

> **Duas decisões pendentes com o dono** (registradas para não serem inventadas):
> 1. As extras: o TAC fica nas **2 horas** da regra oficial (e 1h50 passa a ser
>    apenas aviso preventivo), ou a empresa quer mesmo marcar TAC 10 minutos antes?
> 2. O intervalo acima de 3h continua sendo TAC ou passa a ser incidência?

### 3.2 Como o TAC é acionado hoje no código

O **TAC** sinaliza quando a jornada saiu dos parâmetros aceitáveis. Hoje ele é
acionado quando:

10. as **horas extras passam de 1h50**; **ou**
11. o **intervalo é menor que 1 hora**; **ou**
12. o **intervalo passa de 3 horas**.

### 3.3 Escalada de aviso e o intervalo máximo

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
    **saldo do card de cada pessoa mostra só as horas a 50%** (extras 50% − o que
    deve, podendo ficar negativo): as 100% ficam fora porque nunca são debitadas
    e já aparecem no seu próprio chip `+100%`. Somar as duas escondia quem estava
    devendo — as 100% de um domingo mascaravam o débito da semana.
20. **Fechar o ciclo** (permissão `CENTRAL_JORNADA`) **bloqueia modificações**
    ordinárias na jornada daquele período; **reabrir** exige administrador
    (`ADMIN_DADOS`). A apuração é sempre sob demanda, então reabrir já reflete nas
    próximas leituras.
21. **Feriado = domingo no horário e no pagamento; a folga não muda.** Num
    feriado (nacional, estadual ou municipal — os três valem igual) a pessoa é
    esperada no **horário de domingo**, a carga do dia é a de domingo e o que
    passa dela rende extra de **100%**, sem gerar hora devida abaixo dela. O que
    o feriado **não** faz: não dá folga a ninguém e não desloca o rodízio de
    domingos. Quem trabalha num feriado é exatamente quem trabalharia naquele dia
    da semana. Quem não tem horário de domingo cadastrado segue no seu horário
    habitual.
22. **Uma ocorrência automática desaparece sozinha quando deixa de ser verdade.**
    O sistema lança falta (2h sem bater ponto) e não retorno do intervalo; se o
    fato depois deixa de existir, a ocorrência sai da tela **sem ninguém precisar
    apagá-la**. Sai quando: aparece batida (mesmo lançada em atraso ou corrigida à
    mão), o intervalo é fechado, ou o dia passa a ser coberto por **atestado**,
    **ausência a prazo** ou **férias** — inclusive quando as férias ou o atestado
    são lançados **depois**, cobrindo dias já passados do ciclo aberto.

    Duas fronteiras: o que **uma pessoa registrou** nunca é apagado assim, e um
    dia já convertido em atestado não é tocado.
23. **Excluir uma ocorrência automática é definitivo para aquele dia.** A decisão
    do gestor prevalece sobre a detecção: ela não insiste, mesmo que a pessoa siga
    escalada e sem bater ponto. Antes a card voltava sozinha em 5 minutos e era
    preciso corrigir a escala antes de excluir.
24. **Quem tem ausência registrada no dia não recebe aviso de atraso.** O aviso de
    1h ("estava escalado(a) e não bateu ponto") não é enviado a quem tem atestado,
    ausência a prazo ou falta já lançada — antes era, e contradizia o próprio
    sistema. No painel do dia essa pessoa aparece como **Atestado**, não como
    falta, e continua visível (para se saber por que não está).
25. **Atestado não é falta.** O atestado médico é ausência **abonada**: tem o seu
    próprio contador (`atestados`) e as suas horas (`horasAtestadoMs`), e **não**
    entra no número de **faltas**. Antes o mesmo dia somava nos dois, então o
    contador de faltas acusava justamente quem havia apresentado atestado. A
    mudança é só de **classificação**: atestado nunca gerou hora devida, então
    horas devidas e saldo não mudam.
26. **Atestado lançado por engano se EXCLUI, não se edita.** A exclusão apaga o
    documento, apaga os dias que ele criou e **devolve à condição de falta
    pendente** os dias que já eram falta antes — a ocorrência que o gestor ainda
    precisava tratar não desaparece. Lançar é rotina da escala (o fiscal também
    lança), mas **excluir é alçada de gerente, supervisor ou administrador**,
    igual à exclusão de falta. Se o ciclo de folha do mês já estiver fechado, a
    exclusão é recusada. Para corrigir datas ou CID: excluir e lançar de novo.
27. **Férias encerradas saem da lista, não do sistema.** A lista de férias mostra
    apenas as **em curso e futuras** (é uma tela de operação); os períodos
    passados continuam guardados, e por isso os dias já vividos seguem
    aparecendo corretamente como férias na escala e nos relatórios.

## 6. Observações

- O fiscal **registra batidas novas** de qualquer colaborador (`PONTO_REGISTRAR`)
  e vê o painel de jornada (`PONTO_VISUALIZAR`), mas **corrigir/remover** batidas
  exige `PONTO_EDITAR` (gestão). Ver [Perfis e permissões](../perfis-e-permissoes.md).
- Tudo é calculado no **dia civil de Brasília** para não gravar/ler no dia UTC
  seguinte à noite.
