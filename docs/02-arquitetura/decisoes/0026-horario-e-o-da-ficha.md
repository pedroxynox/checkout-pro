> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-17 · **Cobre:** `backend/src/escala-exportacao/`, `backend/src/escala-domingo/folga.service.ts`, `backend/src/fiscais/`, `backend/src/operadores/operador-turno.service.ts`, `backend/src/compensacao-horas/`

# ADR 0026 — O horário é o da ficha; nada na escala o sobrepõe

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

## O que NÃO muda (de propósito)

**A regra conservadora da detecção de falta continua** (`hora-esperada-fiscal.ts`):
quando a ficha e a cópia semanal discordam, vale a hora **mais tardia**. Trocar a
fonte de uma vez adiantaria a cobrança de quem tem a ficha mais cedo que a escala e
**criaria faltas que hoje não existem** — corrigir um desencontro criando faltas
novas não é corrigir. Só o ramo da exceção saiu daquela função.

Mover a detecção de falta para ler a ficha (e retirar a cópia semanal) é a **etapa
2** deste trabalho, deliberadamente separada.

> **Atualização (2026-09-17) — o diagnóstico da etapa 2 já está entregue.** A tela
> **Conferência de escala** (Centro de Controle, só leitura) responde as três
> perguntas que a troca de fonte exige: quem seria **cobrado mais cedo** (com os
> minutos), quem **perderia o dia de descanso** (ficha sem folga) e quem **trabalha
> domingo sem horário**. Antes a apuração existia apenas como `npm run integridade`,
> um comando de terminal com acesso ao banco — inacessível para quem precisava da
> resposta. A troca da fonte só deve acontecer quando o veredito apontar **zero**
> pessoas afetadas.

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
  em [Roadmap e pendências](../08-gestao/roadmap-e-pendencias.md).
- **A coluna `especial` continua no banco**, sempre `false`: nenhum caminho a
  escreve como `true` e nenhum leitor a honra. `escalaConsolidada` ainda a filtra
  explicitamente, como cinto de segurança contra um resquício inserido à mão.
  Removê-la exige mexer em todas as consultas da escala e fica para a etapa 2.
- **A cópia semanal (`EscalaEntry`) segue existindo** e segue podendo ficar velha —
  é a etapa 2. O diagnóstico `npm run integridade` continua sendo a forma de ver as
  divergências.
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
4. **Fazer a detecção de falta ler a ficha agora.** Recusada **nesta etapa**: pela
   razão documentada em `hora-esperada-fiscal.ts`, adiantaria cobranças e criaria
   faltas novas. É a etapa 2, com o diagnóstico rodado antes.
