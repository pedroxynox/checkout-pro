# Requisitos — Jornada 5x2 (fim do 6x1)

> **Leia isto antes de mexer em contratos, escala, folga, ponto, TAC ou Central
> de Jornada.** Este spec substitui o modelo 6x1 e foi aprovado pelo dono do
> projeto em **22/11/2026**. Design em [`design.md`](design.md), tarefas em
> [`tasks.md`](tasks.md). As decisões abaixo **não se reabrem sem o dono**.

## Contexto

- A **EC 141/2026** (promulgada em 16/10/2026) acabou com a escala 6x1: dois dias
  de repouso semanal, um deles preferencialmente aos domingos.
- O **decreto de 19/11/2026** fixou a transição: a partir de **16/12/2026**, no
  máximo **42 h semanais** e a segunda folga; a partir de **16/12/2027**, **40 h**.
  Fontes: [Câmara](https://www.camara.leg.br/noticias/1311797-congresso-promulga-emenda-que-acaba-com-escala-6x1-e-estabelece-jornada-maxima-de-40-horas-semanais),
  [PEGN](https://revistapegn.globo.com/economia/noticia/2026/11/fim-da-6x1-governo-lula-assina-decreto-que-regulamenta-escala-5x2.ghtml),
  [Valor](https://valor.globo.com/brasil/noticia/2026/11/19/escala-5x2-saiba-quando-entra-em-vigor-apos-o-fim-da-6x1.ghtml).
- A empresa passa a operar em **5x2 com 44 h semanais a partir de segunda-feira
  23/11/2026** e muda para **42 h em 16/12/2026**.
- Hoje o sistema só conhece o 6x1: **uma** folga fixa por pessoa, horários em
  três blocos (Seg–Qui, Sex–Sáb, Domingo), rodízio só de domingo e **nenhuma
  vigência**: trocar o contrato ou a ficha de alguém recalcula todo o passado,
  inclusive ciclos de folha fechados.

## Glossário

- **Tipo de contrato (de jornada):** `TipoContratoJornada`. Conjunto de REGRAS
  (carga por dia, adicional 100%, intervalo, TAC). Não é o contrato de experiência.
- **Disponibilidade:** o horário concreto da pessoa (entrada e saída) para cada
  dia da semana. É o que a escala mostra e o que o ponto cobra.
- **Grupo:** `G1`, `G2` ou `G3`. No 5x2, o grupo define as **duas folgas de cada
  semana** pelo rodízio de folgas.
- **Rodízio de folgas:** a tabela grupo × semana com os dias de folga, num ciclo
  de 3 semanas que começa numa segunda-feira.
- **Vigência:** "a partir desta data, esta pessoa tem este contrato, este grupo,
  esta disponibilidade e estas folgas". Cada dia é calculado com a vigência
  daquele dia.
- **Regime LEGADO_6X1:** os dias anteriores à primeira vigência da pessoa,
  calculados com a ficha antiga que está no `Colaborador` (folga fixa + três
  blocos + rodízio só de domingo), como hoje.
- **Regime SEMANAL:** os dias cobertos por uma vigência (disponibilidade por
  dia + grupo ou folgas fixas).

## Decisões do dono (22/11/2026)

1. **Corte em 23/11/2026** (segunda-feira). Os dias até **22/11** continuam a ser
   calculados com o contrato 6x1, **inclusive quando uma batida ou ausência desses
   dias for corrigida depois**. A partir de 23/11, vale o contrato novo da pessoa.
   O ciclo 26/10–25/11 fica dividido: 26/10–22/11 no 6x1, 23–25/11 no 5x2.
2. O corte é carregado **perfil por perfil**, todos com data 23/11/2026.
3. **44 h semanais em 5x2** agora; em **16/12/2026** nova transição para **42 h**.
   O 5x2 vale para todos; poderá haver mais de um contrato 5x2.
4. **Semana de segunda a domingo.** Semana 1 do rodízio = 23/11 a 29/11/2026.
5. **Rodízio de folgas** (ciclo de 3 semanas, repete na 4ª):

   | Grupo | Semana 1 | Semana 2 | Semana 3 |
   |---|---|---|---|
   | G1 | qui + sex | ter + qua | seg + dom |
   | G2 | ter + qua | seg + dom | qui + sex |
   | G3 | seg + dom | qui + sex | ter + qua |

   Ninguém de grupo folga no **sábado**. Cada grupo trabalha 2 domingos e folga 1.
6. **Continuidade dos domingos:** no 6x1, G3 folgou 08/11, G2 15/11 e G1 22/11.
   No 5x2, G3 folga 29/11, G2 06/12 e G1 13/12. Ninguém passa de 2 domingos
   seguidos trabalhados.
7. **Pessoas sem grupo:** as folgas vêm do tipo de contrato ou são escolhidas na
   ficha (**no máximo 2 por semana**). Essa seção só aparece quando a pessoa não
   tem grupo. **Sábado só pode ser folga se o contrato permitir** e a pessoa não
   tiver grupo.
8. **Disponibilidade ≠ carga do contrato → o sistema avisa** (não bloqueia).
9. **Feriado:** vale o horário da disponibilidade daquele dia da semana (por isso
   todos os dias precisam ser preenchidos). A folga continua sendo decidida pelo
   grupo (ou folgas fixas); feriado não dá folga.
10. **Domingo:** carga definida pelo contrato; extras a **100%**; **sem débito**.
11. **Feriado:** carga **própria em cada contrato**; extras a **100%**; **sem
    débito**. "Feriado" passa a ser uma opção em "Dias com adicional de 100%".
12. **TAC no contrato**, por exemplo: máximo de **10 h trabalhadas** no dia, máximo
    de **1h10 de extras** no dia, intervalo máximo de **2h50**.
13. Não é preciso congelar permissões: os gerentes foram avisados para não mexer
    em fichas e contratos até o novo modelo estar publicado.

Respostas de 22/11/2026 (segunda rodada):

14. **Avisos preventivos de TAC: conforme o contrato.** Cada contrato define em
    quantos minutos de extra saem o 1º e o 2º aviso; não há valor global.
15. **Intervalo mínimo e máximo: conforme o contrato.**
16. **Disponibilidade × carga com tolerância.** Hoje a equipe faz 2 h de
    intervalo, mas isso pode passar a 1 h ou 1h30. A conferência não usa um
    intervalo fixo: a disponibilidade "fecha" com a carga quando o intervalo que
    ela deixa (saída − entrada − carga do dia) cabe entre o intervalo mínimo e o
    máximo do contrato.

## Requisitos

### R0 — Proteger a operação durante a transição

- **R0.1** DEVE existir um interruptor de transição (variável de ambiente
  `PAUSA_TRANSICAO_JORNADA=true`) que, ligado, suspende tudo o que é gerado
  automaticamente a partir do horário/folga/contrato antigos: falta automática,
  aviso de atraso de 1h, avisos de TAC, aviso de ponto em dia de folga, alertas de
  fiscais por padrão/excesso de extras, aviso de cobertura baixa, lembrete de
  entrada e saudação de entrada dos fiscais.
- **R0.2** Com o interruptor ligado, o **registro de ponto continua funcionando**
  normalmente, assim como o não-retorno do intervalo e a autocura das ocorrências.
- **R0.3** Desligado (ou ausente), o comportamento é idêntico ao atual.
- **R0.4** O ciclo de folha **26/10–25/11 não deve ser fechado** antes de as
  vigências de 23/11 estarem carregadas (regra operacional, registrada aqui e no
  steering).

### R1 — Vigência da jornada por pessoa

- **R1.1** Cada colaborador DEVE ter um histórico de vigências; cada vigência tem
  data de início, regime, tipo de contrato, grupo, folgas fixas e disponibilidade.
- **R1.2** Todo cálculo de um dia (carga, extras 50/100, horas devidas, TAC,
  folga, entrada/saída esperadas, atraso, falta automática, compensação, dias
  escalados) DEVE usar a vigência **daquele dia**, nunca a ficha atual.
- **R1.3** Os dias **anteriores à primeira vigência** de uma pessoa usam a ficha
  legada que já está no `Colaborador` (folga fixa, blocos de horário, grupo de
  domingo, tipo de contrato), exatamente como hoje. **Nenhum número do passado
  pode mudar** (validado por testes e por comparação com cópia do banco).
- **R1.3a** Depois que a pessoa tem uma vigência, os campos legados da ficha ficam
  **congelados**: a API recusa alterá-los (409), porque eles passaram a ser a
  história do 6x1.
- **R1.4** Não se DEVE criar, alterar nem remover vigência que comece dentro de um
  ciclo de folha **fechado** (`CicloFechadoError`, 409).
- **R1.5** A data de início pode ser retroativa dentro do ciclo aberto (ex.: lançar
  em 24/11 uma vigência de 23/11).
- **R1.6** Cada vigência registra quem criou/alterou, quando e o motivo.
- **R1.7** Remover a única vigência de uma pessoa a devolve ao regime legado em
  todos os dias; só é permitido com o ciclo aberto (R1.4).

### R2 — Tipo de contrato 5x2

- **R2.1** O contrato DEVE ter **carga de feriado própria** (minutos).
- **R2.2** "Dias com adicional de 100%" DEVE aceitar **Feriado** além dos dias da
  semana. Dia com 100% não gera débito (regra existente).
- **R2.3** O contrato DEVE ter **limite de horas trabalhadas no dia** (TAC quando
  ultrapassado). Vazio = sem verificação (preserva o 6x1).
- **R2.4** Os avisos preventivos de TAC (hoje 1h30/1h40 fixos no código) DEVEM
  usar os minutos do contrato.
- **R2.5** Os textos de TAC e dos avisos DEVEM citar os números do contrato, nunca
  valores fixos ("1h50", "1h", "3h", "Faltam 20 minutos").
- **R2.6** O contrato DEVE definir quantas folgas por semana tem (5x2 = 2), as
  **folgas padrão** para quem não tem grupo e se **permite folga no sábado**.
- **R2.7** A conferência da disponibilidade contra a carga usa o **intervalo
  mínimo e máximo do contrato** como tolerância (decisão 16, R4.6). Não há campo
  de "intervalo previsto".
- **R2.8** Regras de cálculo de um contrato **em uso** (referenciado por alguma
  vigência) NÃO podem ser editadas; para mudar, **duplica-se** o contrato e
  aplica-se o novo com vigência. Nome, descrição e ativo continuam editáveis.
- **R2.9** DEVE ser possível escolher qual contrato é o **padrão** (hoje não há
  endpoint).
- **R2.10** Valores fixos do 6x1 fora do contrato DEVEM sair do caminho de cálculo:
  feriado 7h20, `jornadaEsperadaMs`, domingo fixo na compensação e no app.

### R3 — Rodízio de folgas (aba "Rodízio", Centro de Controle)

- **R3.1** A configuração DEVE ter vigência própria: segunda-feira de início
  (semana 1), número de semanas do ciclo e a tabela grupo × semana × dias.
- **R3.2** A configuração inicial DEVE ser a da decisão 5, com início em
  23/11/2026.
- **R3.3** Validação: início numa segunda-feira; cada grupo com exatamente 2 dias
  distintos por semana; **sábado proibido** para grupos.
- **R3.4** Avisos (sem bloquear): dia da semana sem nenhum grupo de folga ou com
  mais de um; mais de 6 dias seguidos trabalhados; mais de 2 domingos seguidos.
- **R3.5** Prévia das próximas semanas mostrando, para cada dia, o grupo que folga.
- **R3.6** Dias anteriores à primeira vigência do rodízio continuam a usar o
  rodízio antigo de domingo (âncora em `ConfigSistema`).

### R4 — Ficha do colaborador (Centro de Controle ▸ Colaboradores gestão)

- **R4.1** Saem da ficha: dia fixo de folga, entrada/saída Seg–Qui, entrada/saída
  Sex–Sáb e entrada/saída Domingo.
- **R4.2** Permanece o **turno** (Abertura, Intermediário, Fechamento, Apoio).
- **R4.3** Abaixo do turno, a **disponibilidade**: uma linha por dia (Seg a Dom)
  com entrada e saída, e um botão pequeno que **copia a primeira linha para
  todas**.
- **R4.4** Permanece o **grupo** (G1/G2/G3 ou "sem grupo"). Sem grupo, aparece a
  seção **Folgas fixas** (até `folgasPorSemana` do contrato; sábado só se o
  contrato permitir; vazio = padrão do contrato).
- **R4.5** Permanece o **tipo de contrato**.
- **R4.6** Ao salvar, o sistema DEVE avisar (sem bloquear) quando, num dia, o
  intervalo que a disponibilidade deixa (saída − entrada − carga do dia) ficar
  fora do intervalo mínimo–máximo do contrato (jornada curta sem intervalo, quando
  o contrato não exige intervalo, é aceita); quando um dia que pode ser de
  trabalho estiver sem horário; e quando a pessoa ficar sem folga.
- **R4.7** Mudanças de contrato, grupo, folgas ou disponibilidade DEVEM pedir a
  data "vale a partir de" e gravar uma vigência (R1).
- **R4.8** O perfil do colaborador DEVE mostrar a disponibilidade por dia, o grupo,
  as próximas folgas, o contrato vigente (desde quando) e o histórico de vigências.

### R5 — Escala

- **R5.1** A aba **Escalas** (`OperadoresScreen`) DEVE mostrar, em todo dia, o
  grupo que folga naquele dia (e quem folga por folga fixa), com entrada e saída
  tiradas da disponibilidade.
- **R5.2** Saem da aba Escalas os cards **"Faltas do mês"** e **"Não-retornos do
  mês"**. O resto permanece igual.
- **R5.3** "Publicar escala" (PDF/imagem) e a Conferência de escala DEVEM seguir o
  mesmo modelo (folga do grupo por dia, disponibilidade, avisos de R4.6).

### R6 — Central de Jornada e cálculos derivados

- **R6.1** Até 22/11 a Central DEVE dar exatamente os mesmos números de hoje; a
  partir de 23/11, os do contrato novo de cada pessoa.
- **R6.2** Domingo e feriado: extras a 100% e sem débito, com a carga do contrato.
- **R6.3** O detalhe do dia DEVE dizer se o dia gera débito a partir do backend
  (hoje o app fixa "domingo não gera").
- **R6.4** Falta automática, atraso, ponto em dia de folga, dias escalados,
  "emenda" de faltas, compensação de horas e alertas DEVEM reconhecer as duas
  folgas semanais.
- **R6.5** A sugestão automática de "nova folga" (ADR 0019) fica desligada para o
  regime SEMANAL (a folga vem do rodízio).

### R7 — Transição para 42 h (16/12/2026)

- **R7.1** DEVE ser possível duplicar um contrato e **transferir** todas as pessoas
  de um contrato para outro a partir de uma data, preservando grupo, folgas e
  disponibilidade.
- **R7.2** O dia 16/12/2026 (quarta-feira) divide a semana: dias anteriores com a
  carga de 44 h, dias seguintes com a de 42 h.

### RT — Transversais

- **RT.1** Domínio puro e determinístico para vigência, rodízio e jornada prevista
  (ADR 0003), com testes de propriedade.
- **RT.2** Teste de regressão: no regime `LEGADO_6X1` (sem vigência), as novas funções devem
  dar o mesmo resultado que as atuais em qualquer ficha e data.
- **RT.3** Migrações aditivas e compatíveis com rolling deploy; backup (Render ▸
  Recovery ▸ Create export) antes de cada migração em produção.
- **RT.4** Espelhos backend↔mobile atualizados (tipos, permissões). O APK antigo
  não pode quebrar: campos antigos de resposta permanecem até a limpeza final.
- **RT.5** Cada fase atualiza o Atlas e as regras de negócio, roda `npm run
  docs:gen` quando necessário e passa no `npm run docs:check`.

## Fora do escopo (por ora)

- As demais regras oficiais de TAC ainda não verificadas (interjornada de 11 h,
  pausa de 15 min a cada 5 h, 6 dias consecutivos, 35 h após o repouso). O R3.4
  só **avisa** na configuração do rodízio.
- Turnos que cruzam a meia-noite.
- A etapa de 40 h (16/12/2027): será só configuração (R7).

## Decisões pendentes com o dono

Nenhuma no momento. Novas dúvidas entram aqui, com o valor proposto usado
**apenas como padrão editável** até a resposta.

Resolvidas em 22/11/2026:

- Avisos de TAC e intervalos conforme o contrato (decisões 14 e 15) e a
  tolerância da disponibilidade (decisão 16).
- **Quem escolhe o contrato na ficha:** só o administrador (como hoje).
- **Alerta "folga sugerida por mais de 7 h de extras no mês"** (fiscais):
  **retirado**.
- **Transição 22→23/11:** as folgas já foram calculadas pela gestão; ninguém passa
  de 6 dias seguidos. O sistema não precisa tratar o caso.
