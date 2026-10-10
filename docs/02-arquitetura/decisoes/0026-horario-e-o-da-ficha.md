> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-10-10 · **Cobre:** `backend/src/escala-exportacao/`, `backend/src/escala-domingo/folga.service.ts`, `backend/src/fiscais/`, `backend/src/operadores/operador-turno.service.ts`, `backend/src/compensacao-horas/`, `backend/src/alertas/saudacao-diaria.service.ts`

# ADR 0026 — O horário é o da ficha; nada na escala o sobrepõe

> **Nota (2026-10-10):** a assistente de IA (Cluby) foi **removida do produto**. As menções a ela abaixo são o registro histórico do contexto desta decisão; a decisão continua valendo para os demais consumidores.

## Contexto

O dono do projeto relatou o sintoma: **"os fiscais têm o horário na sua ficha, mas
na aba de Escala aparecem outros horários, que não são os da ficha."**

A investigação descartou a suspeita inicial (a escala lendo o turno legado
`OperadorTurno`, que está morto no código) e encontrou a causa real: uma entrada
de `escala_entries` marcada como **`especial`** — uma "exceção de horário" por dia
da semana.

Quatro propriedades juntas transformavam esse recurso num problema:

1. **Sem validade.** Uma convocação pontual para um sábado valia **todos** os
   sábados, indefinidamente.
2. **Gravada sob o id legado** do fiscal (`funcionarioId`), então a ficha não a
   "via" e o vínculo tinha de ser traduzido a cada leitura.
3. **Sem nenhuma tela.** Nenhum ponto do aplicativo a criava, exibia ou apagava —
   existia apenas a rota técnica `POST /escala/:funcionarioId/especial`.
4. **Preservada de propósito** pela sincronização da ficha
   (`sincronizarEscalaFiscal` filtra `especial: false`), então salvar o cadastro de
   novo nunca a corrigia.

O resultado prático: a escala mostrava um horário que **não existia em nenhum campo
da ficha** e que **não havia como remover pelo aplicativo**. A origem da maior
parte delas era o seed de demonstração, que marcava dois fiscais como "especial" e
gravava horários fixos por turno — inclusive de domingo, que a ficha não preenchia.

Pior: a exceção era aplicada em **cinco** lugares independentes (escala publicada,
Quadro de Operadores, compensação de horas, detecção de falta de fiscais e detecção
de falta de operadores), e cada um a lia por um caminho próprio.

## Decisão

**O horário de um colaborador é o da sua ficha. Nenhuma outra fonte o sobrepõe.**

Concretamente:

1. **A exceção de horário deixa de existir.** `montarLinhaEscala` não recebe mais
   o parâmetro `especial`; `LinhaEscala` não tem mais o campo `horarioEspecial`; o
   carregador `carregarHorariosEspeciais` foi removido, junto com os seus cinco
   consumidores. A rota `POST /escala/:funcionarioId/especial` e o método
   `definirHorarioEspecial` foram removidos.
2. **A folga também.** As duas variantes que dependiam do `especial` —
   **convocação** (`especial` sem folga, que mandava trabalhar) e **folga
   concedida** (`especial` com folga, que vencia a ficha) — saíram de
   `FolgaService`. A convocação não podia sobreviver: sem exceção de horário, ela
   deixaria a pessoa **esperada e sem hora**, o caminho mais curto para uma falta
   automática indevida. A folga concedida saiu por coerência, e a regra que resta é
   a da [ADR 0023](0023-folga-a-ficha-manda.md): a ficha decide sozinha quando
   afirma um dia; a escala semanal geral só decide quando a ficha é omissa.
3. **Os dados são limpos com bisturi** (migração `9zzr_horario_e_da_ficha`):
   - `especial = true AND folga = false` (as exceções de **horário**) → `DELETE`;
   - `especial = true AND folga = true` (as **folgas concedidas**) → rebaixadas a
     `especial = false`, **preservando o descanso**. Apagá-las poderia retirar o
     dia de folga de quem tem a ficha omissa e produzir falta automática — o erro
     exato que este trabalho existe para evitar.
4. **O seed para de fabricar o problema.** Nunca mais grava `especial: true`, e
   deixa de criar linha de **domingo** (o domingo dos fiscais vem do rodízio
   G1/G2/G3, não de uma linha fixa da semana; gravá-la punha todo fiscal como
   escalado em todo domingo).
5. **A ficha passa a mostrar o horário de domingo.** Ele já era editável (no
   formulário, abaixo do grupo do rodízio), mas o **perfil** exibia apenas Seg–Qui
   e Sex–Sáb — e é o horário de domingo que decide **domingo e feriado**. Quem
   consultava a ficha via dois horários e a escala usava um terceiro, sem nada que
   explicasse. Agora o perfil mostra Domingo, o grupo do rodízio e a regra do
   feriado por escrito.

## Etapa 2 (2026-09-18) — a hora cobrada também é a da ficha

A etapa 1 acertou o horário **exibido**. A etapa 2 acerta o **cobrado**, e foi
autorizada por dados, não por opinião: a tela **Conferência de escala** rodou em
produção e nomeou, entre 11 fiscais ativos, **7 pessoas** cuja cópia semanal estava
mais tardia que a ficha — cinco por 40 minutos, duas por 1 hora. Os horários da
cópia coincidiam exatamente com os do seed de demonstração (`06:50`, `11:00`,
`13:50`), o que confirmou a origem: a cópia nunca tinha sido revista por ninguém.

O efeito prático era o oposto do que a regra conservadora prometia proteger. Ela
existia para não criar faltas novas, e cumpriu esse papel; mas como a cópia era a
**mais tardia** em sete dos nove casos divergentes, era ela que decidia — e o atraso
real dessas sete pessoas, de 40 minutos a 1 hora por dia, simplesmente não existia
para o sistema. Zero faltas indevidas, e zero atrasos detectados.

**A ficha passou a ser a única fonte da hora esperada, em todos os sete lugares que
liam a cópia semanal:**

1. **`hora-esperada-fiscal.ts` foi apagado.** Era a regra conservadora inteira.
   Sem duas fontes não há o que comparar.
2. **A escala consolidada (`escala.service.ts`) resolve o turno na ficha em todos
   os dias**, não só no domingo. Usa `entradaEsperadaNoDia`/`saidaEsperadaNoDia` —
   as mesmas funções da escala publicada —, então a hora cobrada é, **por
   construção**, a hora que a equipe recebeu na escala.
3. **A detecção de falta (`escaladosDoDia`) deixou de reinterpretar nada:** consome
   a hora da escala consolidada e a cobra. Um cálculo, não dois.
4. **Os avisos automáticos seguiram a fonte:** lembrete de dez minutos
   (`fiscais-horario.service.ts`), saudação de entrada
   (`saudacao-diaria.service.ts`), alertas semanais de atraso
   (`fiscais-alertas.service.ts`) e ranking de pontualidade. Um aviso que chega na
   hora errada é pior do que nenhum: quem o segue chega atrasado por obedecer ao
   sistema.
5. **A assistente também** (`assistente.service.ts` e `contextoEscala`): ela
   respondia horários que não estavam na ficha de ninguém, com a autoridade de quem
   "consultou o sistema".
6. **As rotas que escreviam ou liam a cópia saíram:** `POST /escala` (gravava uma
   hora que já não teria efeito — uma rota que aceita um dado inócuo é pior do que
   rota nenhuma) e `GET /escala/:funcionarioId/efetiva` (sem nenhum consumidor).
7. **A leitura ficou num lugar só:** `turno-fiscal.ts` (puro) e
   `turno-fiscal.consulta.ts` (as consultas). Sete caminhos montavam por conta
   própria o trio `Fiscal` + `Usuario` + `Colaborador`, e bastava um `select`
   esquecido para um deles resolver um turno pela metade.

**Uma regra nova, e é a mais importante desta etapa:** *sem turno afirmado pela
ficha, não se cobra ponto.* Ficha sem horário para o dia, fiscal sem ficha nenhuma,
domingo sem âncora do rodízio — em todos, a pessoa sai da equipe do dia em vez de
entrar com uma hora inventada. É o mesmo critério que já valia para operadores e
supervisores.

### O que a Conferência de escala virou

A tela respondeu a pergunta para a qual foi feita, e essa pergunta expirou. Deixá-la
dizendo "7 pessoas seriam afetadas" depois da troca seria enganoso, então o assunto
dela mudou: **as lacunas da ficha**. Como a ficha é agora a única fonte, um vazio
nela não é mais coberto por nada — quem está sem horário não é esperado em dia
nenhum, e por isso nunca aparece atrasado nem faltante. `EfeitoNaCobranca` e
`minutosAdiantados` deram lugar a `minutosDeDiferenca` (informativo), e
`bloqueiamEtapa2` a `fichasComLacuna`.

## O que a etapa 2 NÃO fez (etapa 3)

**A tabela `EscalaEntry` continua existindo.** Nada lê mais um horário dela, mas
retirá-la exige resolver duas coisas primeiro, e nenhuma delas cabia aqui sem
inflar o risco desta mudança:

1. **`intervaloMin` só vive nela.** É a duração do intervalo do turno, e a ficha não
   tem campo para ela. Usam-na as sugestões de "não retornou do intervalo"
   (`incidencias.service.ts`, dois pontos). Antes de apagar a tabela, esse dado
   precisa de outro lugar — na ficha ou no tipo de contrato de jornada.
2. **O vínculo `funcionarioId → colaboradorId` gravado nela** é o único jeito de
   reconhecer a ficha de um fiscal que teve a conta de acesso desvinculada. Sem ele,
   essa pessoa desaparece da escala — e, se estiver **desligada**, escapa do filtro
   que tira os desligados do quadro, o pior dos dois mundos. `carregarFiscaisComFicha`
   lê da cópia **apenas esse vínculo**, nunca um horário.

Também ficou de fora, de propósito, o **passo da ficha omissa na regra de folga**
(`FolgaService`): quando a ficha não tem dia de folga cadastrado, a cópia semanal
ainda pode afirmar o descanso. É o último fio que liga a cópia a uma decisão, e
cortá-lo agora não traria benefício nenhum — apenas o risco de escalar sete dias por
semana quem tem a ficha incompleta, que é a classe de erro que este trabalho existe
para evitar. A Conferência de escala aponta essas fichas como lacuna.

## Consequências

**Positivas**
- A escala publicada, o Quadro de Operadores, a compensação de horas e as duas
  detecções de falta passam a ler **a mesma fonte**. Cinco caminhos, uma verdade.
- Desaparece a classe de bug "horário que aparece na escala e não existe na ficha",
  e com ela um gerador silencioso de falta automática indevida.
- Menos código: um arquivo, uma rota, um método, um campo de resposta e três
  conjuntos de estado a menos.
- O que decide domingo e feriado passou a ser **visível** onde o gestor olha.

**Negativas / limites**
- **Não existe mais como dar um horário diferente a alguém num dia**, nem convocar
  no descanso, nem dispensar pela escala semanal. Como nenhuma dessas ações tinha
  tela, na prática nada que o gestor usava foi perdido — mas se o negócio precisar
  disso, tem de ser construído como recurso de primeira classe: **com data de
  validade, com tela para ver e desfazer, e vinculado à ficha**. Ficou registrado
  em [Roadmap e pendências](../../08-gestao/roadmap-e-pendencias.md).
- **A coluna `especial` continua no banco**, sempre `false`, e a tabela
  `EscalaEntry` também — ver "O que a etapa 2 não fez". A diferença é que nenhuma
  das duas decide mais um horário.
- **Os atrasos reais de sete pessoas passaram a ser detectados**, de 40 minutos a
  1 hora por dia. Isto é o objetivo da mudança, não um efeito colateral, mas é uma
  mudança visível na vida da equipe e precisa ser comunicada: ninguém começou a
  chegar mais tarde — o sistema parou de esperá-las mais tarde do que a escala que
  elas receberam.
- **Um fiscal sem ficha deixa de ser cobrado.** Em produção não há nenhum (os 11
  ativos têm ficha), mas se houver, a pessoa sai do controle de ponto em silêncio.
  A Conferência de escala é onde isso aparece.
- Uma dispensa ou folga concedida gravada para um dia que a **ficha diz de
  trabalho** deixa de valer. É a ADR 0023 aplicada ao último lugar que escapava
  dela, e não uma regra nova: a ficha já vencia nesse conflito em todos os outros
  casos.

## Alternativas consideradas

1. **Manter a exceção e apenas apagar as linhas atuais.** Recusada: sem tela para
   criar, ver e desfazer, e sem validade, o problema voltaria na primeira vez que
   alguém usasse a rota técnica.
2. **Manter a convocação (folga) e remover só o horário.** Recusada: uma convocação
   sem hora deixa a pessoa esperada e sem turno — pior do que não convocar.
3. **Apagar todas as linhas `especial` num único `DELETE`.** Recusada: levaria
   embora as folgas concedidas e poderia gerar falta automática em quem estava
   descansando. Daí a migração em dois passos.
4. **Fazer a detecção de falta ler a ficha na etapa 1.** Recusada então, feita na
   etapa 2 — e a ordem foi o ponto. Sem o diagnóstico rodado antes, a troca seria
   uma aposta sobre a vida de pessoas reais; com ele, foi uma decisão informada
   sobre sete nomes conhecidos.
5. **Retirar a tabela `EscalaEntry` no mesmo passo da troca de fonte.** Recusada:
   juntaria uma mudança de comportamento (arriscada, pequena, verificável) com uma
   remoção mecânica que toca dezenas de arquivos. Se algo desse errado, não haveria
   como saber qual das duas causou. E há um bloqueio real: `intervaloMin` não tem
   outro lugar onde morar.
6. **Manter a regra conservadora e apenas avisar o gestor das divergências.**
   Recusada: era o estado anterior. As divergências existiam há meses, ninguém as
   via, e sete pessoas seguiam com o atraso invisível.
