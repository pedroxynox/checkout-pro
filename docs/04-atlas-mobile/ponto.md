> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-10-10 · **Cobre:** `mobile/src/screens/ponto/`

# Área: `ponto`

## 1. Propósito
Registro de ponto por **comprovante**: escolher o colaborador, ver a **jornada
do dia** calculada a partir das batidas e registrar/corrigir/remover batidas —
com **leitura automática por câmera/OCR** (só no APK) — além do controle do
**ciclo de folha (26→25)** pela Central de Jornada (saldo, extras, faltas,
inconsistências, **marcações inválidas**, **rankings do time**, fechamento e
feriados).

## 2. Quem usa (perfis)
- **Fiscal**: registra batidas novas (a hora do comprovante) e pode informar a
  própria falta do dia; não vê os botões de correção/exclusão.
- **Gestão que corrige o ponto** (`PONTO_EDITAR`): corrige e exclui batidas.
- **Central de Jornada** (`CENTRAL_JORNADA`): resumo do ciclo, inconsistências,
  relatório de marcações inválidas, revisão e fechamento do ciclo, e gestão de
  feriados. Quem **vê** o relatório precisa de `CENTRAL_JORNADA`; quem **ajusta**
  a batida precisa de `PONTO_EDITAR` (o relatório é só leitura).
- **Marcar falta como débito** (`OPERADORES_AUSENCIAS`): no detalhe da jornada.
- **Reabrir ciclo** (`ADMIN_DADOS`): libera edições de um ciclo fechado.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `RegistroPontoScreen.tsx` | Tela principal: busca, jornada do dia, batidas, leitor e **modo correção** | 1704 |
| `CentralJornadaScreen.tsx` | Portal do ciclo (hero, atalhos, resumo do time, **compensação de horas**, lista por pessoa, comparativo) | 715 |
| `RankingTimeScreen.tsx` | Ranking do time numa métrica do resumo (uma tela para as sete) | 549 |
| `metricasResumo.ts` | Identidade das sete métricas do resumo (fonte única de card + ranking) | 153 |
| `CartaoCompensacao.tsx` | Card-resumo "Compensação de horas" na Central: 50% em aberto, quanto **não cabe** no ciclo, quantas sugestões — e leva à tela | 178 |
| `CompensacaoScreen.tsx` | Tela de compensação: carteira de 50%, dias mais fracos, liberações, coberturas de falta e o que já foi concedido | 808 |
| `DetalheJornadaScreen.tsx` | Detalhe dia a dia de um colaborador no ciclo | 467 |
| `InconsistenciasScreen.tsx` | Problemas do ciclo agrupados por dia | 330 |
| `MarcacoesInvalidasScreen.tsx` | Marcações que faltam registrar: quantas e quais, por dia; cada item abre o ajuste | 644 |
| `filaCorrecao.ts` | Fila de correção (lógica pura): filtros, ordem de trabalho e próxima pendência | 118 |
| `ExportarCicloScreen.tsx` | Revisão dos totais e fechar/reabrir o ciclo | 248 |
| `FeriadosScreen.tsx` | Feriados nacionais (automáticos) + estaduais/municipais (manuais) | 214 |
| `leitorAoVivo.tsx` / `leitorAoVivo.native.tsx` | Leitor ao vivo (câmera): vazio na web, ML Kit no APK | 23 / 325 |
| `leitorComprovante.ts` / `leitorComprovante.native.ts` | Captura de foto: nula na web, câmera no APK | 15 / 33 |
| `leituraComprovanteUtil.ts` | Heurística de leitura (gatilho + extração da hora) | 85 |
| `montarTextoOcr.ts` | Reconstrução do texto do OCR pela geometria | 131 |

## 4. Fluxo do usuário
1. **Registro:** em `RegistroPontoScreen` seleciona o dia, busca o colaborador
   por nome (debounce) ou usa o **leitor** (APK): a câmera captura sozinha
   quando a leitura fica boa, o servidor interpreta nome/data/hora e sugere o
   colaborador. Com leitura confiável, seleciona sozinho e pré-preenche a hora.
2. **Batidas:** registra a hora do comprovante (`HH:mm`), corrige ou remove
   (só `PONTO_EDITAR`). Limite de **4 batidas** por dia; correção/exclusão de um
   dia com extras/TAC pede confirmação (recalcula os valores).
3. **Modo lote:** registra vários comprovantes em sequência, com contador da
   sessão; sem conexão, a batida vai para a **fila offline** (idempotente).
4. **Painel da jornada:** mostra status (trabalhando/intervalo/encerrado/
   incompleto/sem registro), trabalhado, intervalo, extras (50%/100%), carga
   base, alerta de TAC iminente e "Como é calculado?".
5. **Ciclo:** pela Central de Jornada abre inconsistências, **marcações
   inválidas**, revisão/fechamento e feriados; toca numa pessoa para o detalhe
   diário. Cada card de pessoa traz o **nome completo** (em até duas linhas),
   como na Jornada de Equipe — com só o primeiro nome, dois homônimos ficavam
   indistinguíveis na lista do ciclo. O atalho "Marcações inválidas" mostra no
   rótulo **quantas marcações** faltam no ciclo (não quantos dias).
6. **Ajuste do ponto (fluxo de correção):** em `MarcacoesInvalidasScreen` o
   gestor vê, dia por dia, quem tem marcação faltando, **quais** faltam e as
   horas que existem. **Cada item é tocável** e abre o `RegistroPontoScreen` em
   **modo correção**, já na pessoa e no dia daquele item, com o aviso do que
   falta registrar. Dali o gestor pode:
   - **lançar a batida** e, se o dia ficou completo, seguir para a **próxima
     pendência** sem sair da tela (botão "Próxima: …"); ou
   - **voltar à lista**, que se recarrega no foco — o item resolvido desaparece.

   O relatório continua não editando nada: ele aponta, e o ajuste acontece no
   Relógio Ponto (é lá que vivem as permissões e a validação da batida).
7. **Compensação de horas:** logo abaixo do resumo do time, a card
   "Compensação de horas" mostra de relance quanto a equipe tem de 50% em aberto,
   quanto **não cabe** nos dias que restam do ciclo e quantas sugestões esperam
   decisão. **Tocá-la abre a tela de compensação**, onde ficam os dias mais fracos
   e uma linha por sugestão: quem liberar, em que dia, quanto trabalha e quanto
   compensa — com a frase que justifica cada uma. Duas ações por linha
   (**Conceder** / **Descartar**), sempre com confirmação. Em bloco próprio, as
   **coberturas de falta**: usar as mesmas horas de 50% para quitar faltas
   passadas, pelo botão de débito que já existe. No fim, **o que já foi
   concedido** no ciclo, com **Desfazer**.
   **Conceder** grava a decisão (`POST /compensacao-horas/aprovar`) e, dali em
   diante, a apuração trata aquele dia como **compensação**: as horas saem do
   saldo de 50% da pessoa, o dia curto não conta como falta nem como déficit sem
   explicação, e a entrada combinada passa a ser a esperada (sem atraso falso).
8. **Ranking do time:** cada card do "Resumo do time" abre o
   `RankingTimeScreen` daquela métrica (extras 50%, extras 100%, faltas,
   atestados, TAC, atrasos ou conflitos), da pessoa que mais tem à que menos tem;
   dali toca-se numa pessoa para cair no detalhe diário dela.
Cada tela trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Buscar pessoas | `pontoService.buscarPessoas(busca)` | `GET /ponto/pessoas` |
| Jornada do dia | `pontoService.jornadaDoDia(...)` | `GET /ponto/dia` |
| Registrar batida | `pontoService.registrarBatida(input)` | `POST /ponto/batidas` |
| Corrigir batida | `pontoService.editarBatida(id, input)` | `PATCH /ponto/batidas/:id` |
| Remover batida | `pontoService.removerBatida(id)` | `DELETE /ponto/batidas/:id` |
| Ler comprovante | `pontoService.lerComprovante({ texto })` | `POST /ponto/ocr` |
| Meu resumo (fiscal) | `fiscaisService.meuResumo()` | `GET /fiscais/eu` |
| Informar falta | `fiscaisService.informarFalta()` | `POST /fiscais/eu/falta` |
| Resumo do ciclo | `centralJornadaService.resumo(ciclo)` | `GET /central-jornada` |
| Inconsistências | `centralJornadaService.inconsistencias(ciclo)` | `GET /central-jornada/inconsistencias` |
| Marcações inválidas | `centralJornadaService.marcacoesInvalidas(ciclo)` | `GET /central-jornada/marcacoes-invalidas` |
| Ranking do time | `centralJornadaService.rankings(ciclo)` | `GET /central-jornada/rankings` |
| Comparativo | `centralJornadaService.comparativos(qtd)` | `GET /central-jornada/comparativos` |
| Detalhe por pessoa (dias + resumo atual) | `centralJornadaService.pessoa(id, ciclo)` | `GET /central-jornada/pessoa/:id` |
| Marcar débito | `centralJornadaService.marcarDebito(id, debito)` | `POST /central-jornada/ausencia/:id/debito` |
| Débito em dia sem falta | `centralJornadaService.lancarFaltaComDebito(id, data)` | `POST /central-jornada/pessoa/:id/debito` |
| Painel de compensação | `compensacaoHorasService.painel(ciclo)` | `GET /compensacao-horas` |
| Conceder compensação | `compensacaoHorasService.aprovar(dados)` | `POST /compensacao-horas/aprovar` |
| Descartar sugestão | `compensacaoHorasService.recusar(id, data, motivo?)` | `POST /compensacao-horas/recusar` |
| Desfazer compensação | `compensacaoHorasService.cancelar(id)` | `POST /compensacao-horas/:id/cancelar` |
| Revisão do ciclo | `centralJornadaService.exportacao(ciclo)` | `GET /central-jornada/exportacao` |
| Status do ciclo | `cicloFolhaService.status(ciclo)` | `GET /ciclo-folha/status` |
| Fechar / reabrir | `cicloFolhaService.fechar/reabrir(ciclo)` | `POST /ciclo-folha/fechar` · `POST /ciclo-folha/reabrir` |
| Feriados | `feriadosService.listar/criar/remover(...)` | `GET/POST /feriados` · `DELETE /feriados/:id` |

Módulos do backend relacionados: [`ponto`](../03-atlas-backend/ponto.md),
[`central-jornada`](../03-atlas-backend/central-jornada.md),
[`compensacao-horas`](../03-atlas-backend/compensacao-horas.md),
[`ciclo-folha`](../03-atlas-backend/ciclo-folha.md),
[`feriados`](../03-atlas-backend/feriados.md) e
[`fiscais`](../03-atlas-backend/fiscais.md) (autosserviço do fiscal).

## 6. Estado local e regras de UI
- A hora é digitada com máscara `HH:mm` e validada por `HORA_VALIDA`
  (00:00–23:59); a batida é gravada como ISO `data + hora`.
- **Limite de 4 batidas/dia**: acima disso não oferece registrar, mas mantém
  correção/exclusão.
- Correção/exclusão em dia com extras/TAC exibe confirmação de consequência.
- Fila **offline**: batidas novas usam `clienteId` (idempotência); edições
  exigem a batida no servidor e não entram na fila.
- O leitor e a foto só aparecem fora da web; a origem da batida (`LEITOR`/
  `MANUAL`) e o nome lido são enviados para o servidor "aprender" a pessoa.
- Autosserviço do fiscal (informar falta) só aparece quando o usuário é fiscal
  e o dia é hoje.
- Central de Jornada: navegação por ciclo (0 = atual, sem avançar do atual);
  feriados "registrados" contam só os manuais; carregar checklist do ciclo
  respeita as permissões acima. As **"Extras 50%"** (métrica do resumo do time e
  chip "+50%" de cada colaborador) mostram as 50% **reais do momento**
  (`extras50AtualMs` = acumulado − o que deve, piso 0), não o bruto do mês. Do
  mesmo modo, o chip **"Deve"** usa `horasDevidasAtualMs` (o que deve − as 50%,
  piso 0): quem tem saldo 50% positivo não aparece devendo horas.
- O número grande ao lado do nome na card (rótulo **"saldo 50%"**) é o
  `saldo50Ms`: **só as horas 50%**, com sinal (verde positivo / vermelho
  negativo, via `formatarSaldo`). As **100% não entram** nesse saldo — seguem no
  chip `+100%` abaixo do nome —, porque nunca são debitadas e mascaravam quem
  estava devendo. `DetalheJornadaScreen` mostra o mesmo indicador, para as duas
  telas não discordarem.
- **Débito também no dia "Faltou (não registrada)".** Esse dia não tem falta
  gravada (ex.: ela foi excluída na escala), e antes não havia como debitá-lo. O
  botão **Débito** aparece também nele (fora de domingo/feriado) e cria a falta já
  debitada. O texto do dia passou a orientar para esse botão.
- **O cabeçalho do detalhe vem do servidor, não da navegação.**
  `DetalheJornadaScreen` usa o `resumo` devolvido por
  `GET /central-jornada/pessoa/:id` (o mesmo cálculo da card). O `pessoa`
  recebido na navegação só preenche a tela enquanto a resposta não chega. Além
  disso, a tela **recarrega ao voltar** a ela (`useFocusEffect`, pulando o
  primeiro foco). Antes o cabeçalho era a cópia do momento do toque e a tela não
  recarregava: quem excluía um atestado na escala e voltava continuava vendo o
  chip "Atestado" (e os contadores antigos), mesmo puxando para atualizar. O **"Saldo atual" do topo (time)** continua sendo o
  `totais.saldoMs` (50% positivas + 100%), que nunca foi a soma das cards.
- **Domingo e feriado não entram no "Deve".** No detalhe do ciclo esses dias
  aparecem com `trabalhado` abaixo da `base` e ainda assim `devidas = 0` — não é
  erro de exibição: são dias pagos pela carga cumprida, com extra de 100% acima
  da base e sem débito abaixo dela (regra 4 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md)).
- Pela mesma regra, o botão **"Débito"** do detalhe da jornada (`aceitaDebito`)
  **não aparece em domingo nem em feriado**: faltar nesses dias fica apenas como
  ausência e o servidor recusaria a marcação. O botão segue disponível nos
  demais dias para quem tem `OPERADORES_AUSENCIAS`.
- **A card "Compensação de horas" some inteira para quem não pode conceder** —
  e, junto com ela, a consulta ao servidor. A permissão é `OPERADORES_AUSENCIAS`,
  **a mesma do botão "Débito"**, porque conceder compensação e marcar débito são o
  mesmo poder (ADR 0021 — "débito é compensação"). O hook de requisição roda
  sempre (regra dos hooks), então a chamada é trocada por uma promessa vazia; era
  isso ou pedir um painel caro (apuração do ciclo + escala + férias + 90 dias de
  venda) que o servidor recusaria de todo modo. Mesmo padrão do comparativo por
  ciclo, que só busca quando é aberto.
- **A compensação é uma tela, e a card só a anuncia — não é um recolhível.**
  Nasceu recolhível dentro da Central e mudou por dois motivos: a Central já é
  longa (hero, atalhos, resumo do time, uma card por pessoa, comparativo) e abrir
  ali uma lista de sugestões com dois botões cada empurrava a lista de pessoas
  para fora do alcance; e um recolhível **esconde justamente o trabalho que a
  seção existe para provocar** — quem não abre, não age. Na card ficam só os
  números que se leem de relance; decidir é um ato deliberado, e ganha tela.
  A rota `Compensacao` é liberada por `CENTRAL_JORNADA` (é por lá que se entra),
  mas **conceder continua exigindo `OPERADORES_AUSENCIAS`** — conferido na card,
  na tela e no servidor.
- **A tela nunca mostra lista vazia sem explicação.** Quando não há sugestões, o
  backend devolve o motivo (`bloqueio`) e a tela o traduz: ciclo passado, ciclo
  fechado, sem dia disponível ou **sem dado de venda**. "Não sei ainda, e por
  isso" é informação; uma lista vazia é um defeito aparente.
- **Toda ação pede confirmação, e a frase diz o efeito real.** Ao cobrir uma
  falta, o texto afirma que o débito **NÃO apaga a falta** nem o registro para
  advertência — sem isso o abono passa a ser lido como perdão. Ao desfazer, avisa
  que as horas **voltam** para o saldo da pessoa.
- **Chip "Compensou" em verde, separado de "Deve".** São opostos: quem compensou
  **usou** horas que tinha; quem deve está negativo. Usar a mesma cor ou o mesmo
  chip faria boa gestão parecer dívida.
- **No detalhe diário, o dia compensado aparece como "Compensação"** (verde) com
  a linha "usou Xh de 50%" e a entrada combinada, e **não** como falta ou jornada
  incompleta — o dia curto foi acordado. Ver a regra 16 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md).
- **As frases de justificativa vêm do servidor, não da tela.** A mesma frase é
  gravada no banco quando o gestor decide (é o retrato do que se sabia naquele
  momento), então duplicá-la no app garantiria que um dia as duas divergissem.
- **Plural por palavra inteira, nunca por sufixo colado.** Concatenar o sufixo
  funciona em "dia/dias" e quebra no resto: `sugestão${n>1?'ões':''}` imprimia
  **"3 sugestãoões"** e `útil${n>1?'eis':''}` imprimia **"4 dias útileis"** ("úteis"
  é irregular — perde o `l` e muda o acento). Os contadores da compensação passam
  por funções que devolvem a frase inteira (`pluralSugestoes`, `pluralDiasUteis`,
  `pluralPessoas`, `pluralDias`), com um teste para o singular e um para o plural
  de cada. O caso do singular não é hipotético: no **último dia do ciclo** o
  cabeçalho dizia "1 dias para compensar".
- **Bater ponto em dia de folga é permitido**, e a tela não pede confirmação nem
  avisa a pessoa: quem tem de agir é o gestor. O dia aparece com a marca
  📅 **"Trabalhou num dia marcado como FOLGA"** em **azul** — informativo, não de
  alerta —, porque a pessoa não fez nada de errado: quase sempre a folga dela
  mudou e o cadastro não foi atualizado. No **painel de inconsistências** o item
  tem o rótulo **"Escala"** (também azul), separando "corrigir o cadastro" de
  "cobrar alguém", e traz a **sugestão do novo dia de folga** quando os dados a
  sustentam. Regra 6 de [`ponto`](../03-atlas-backend/ponto.md) e regra 15 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md).
- **"Faltou (não registrada)"** (`FALTA_NAO_REGISTRADA`, em laranja) é o dia em que
  a pessoa **estava escalada**, o dia terminou, não bateu ponto e ninguém lançou a
  falta. Antes esse dia vinha como `SEM_REGISTRO` e a lista o **esconde**
  (`.filter(d => d.tipo !== 'SEM_REGISTRO')`), então um **domingo** escalado e não
  cumprido não aparecia na card — nem como problema. Não é uma falta oficial: não
  entra no contador de faltas nem no "Deve"; é um aviso para o gestor lançar a
  falta pela escala do dia, se for o caso. Regra 14 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md).
  > O filtro de `SEM_REGISTRO` continua: dias de folga e dias que ainda não
  > terminaram seguem fora da lista, para a card não virar um calendário cheio de
  > linhas vazias.
- **As cards do resumo usam tipografia enxuta** (valor 12, rótulo 10, ícone 28).
  Numa grade de duas colunas o texto divide a largura com o ícone e a seta, e
  valores como "2 atestados" ou "12h 30min" apareciam **cortados com "…"** — um
  valor cortado não informa nada. O `adjustsFontSizeToFit` que existia ali não
  resolvia: só funciona no iOS, então no Android dava a falsa sensação de que
  caberia. Ver [`CartaoMetrica`](componentes-compartilhados.md).
- **Resumo do time: as sete cards são tocáveis e de posição fixa.** Antes, as
  cards de atraso e de conflito só apareciam quando havia ocorrência, então a
  grade mudava de tamanho e a posição de cada botão dançava; agora todas estão
  sempre no mesmo lugar e a zerada fica apenas **esmaecida** (`apagado` do
  `CartaoMetrica`), que também exibe a seta de afordância — sem ela, um cartão
  clicável parece estático.
- **"Atestados" é uma card própria, ao lado de "Faltas".** Atestado médico é
  ausência **abonada**: não é falta e não pode aparecer como tal (ver regra 11 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md)). Por isso a card
  usa **azul** (informativo, não de alerta) e o ranking a lê com semântica
  **positiva** — quem tem mais atestados não está "pior".
- **O número da card são ATESTADOS, não dias** (regra 12 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md)): um atestado de 3
  dias conta 1, e um de 3 dias mais um de 2 contam 2 — não 5. No ranking, cada
  linha do detalhe é **um atestado** e mostra o **período** que ele cobre
  ("Seg 06/07 a Qua 08/07"), quantos dias são e as horas abonadas; os dias
  justificados sem documento cadastrado saem marcados como "sem documento
  cadastrado", o que também é a dica de que cadastrar o documento deixa a
  contagem exata. As horas seguem no chip "Atestado" de cada pessoa e na revisão
  do ciclo.
- **Uma só tela para os sete rankings** (`RankingTimeScreen`, parâmetros
  `metrica` + `ciclo`). A identidade de cada métrica (rótulo, título, ícone, cor,
  como formatar e de onde sai o número) vive em **`metricasResumo.ts`**, a mesma
  fonte que a card usa: é o que impede a card e o ranking de discordarem em cor
  ou em valor. A tela acrescenta apenas o que é seu — o detalhe dia a dia e a
  frase do estado vazio.
- **Nome completo nos cards do ciclo.** `CentralPessoaResumo` já trazia `nome`
  do backend; a card usava `primeiroNome`. Passou a usar `nome` com
  `numberOfLines={2}` — o resto da Central de Jornada (rankings, detalhe diário,
  inconsistências, marcações inválidas) já mostrava o nome inteiro, então a card
  era a única fora do padrão.
- **Leitura do ranking:** a **cor é a mesma da card** que foi tocada (para não se
  perder), e o que "estar no topo" significa vai **escrito** no cabeçalho — cor
  não basta para dizer se muito é bom (extras) ou ruim (faltas, atrasos, TAC,
  conflitos). A **barra é proporcional ao 1º colocado**, que é a comparação que
  interessa; as três primeiras posições recebem cor de pódio. Quem está em
  **zero não compete**: vai para um rodapé recolhido ("N pessoas sem novidade"),
  também tocável para abrir o detalhe diário.
- **Detalhe por métrica:** faltas mostram cada dia como falta com débito (com as
  horas) ou falta simples; atestados, as horas abonadas de cada dia; atrasos, os
  minutos além do turno e o horário previsto; TAC, os motivos do dia; conflitos,
  o motivo e o estado da ausência. **Horas extras não têm detalhe** — ali o
  número é a informação.
- **Marcações inválidas × não retorno do intervalo.** Dias de não retorno **não**
  aparecem na lista: ali a pessoa saiu e não voltou, então não há marcação
  esquecida a ajustar (regra 12 da
  [`central-jornada`](../03-atlas-backend/central-jornada.md)). Mas a tela
  **avisa quantos foram** (`totais.naoRetornosExcluidos`) e diz que são
  incidências — se o dia simplesmente desaparecesse, um ciclo só com não-retornos
  pareceria limpo.
- **Marcações inválidas:** os dias vêm **abertos por padrão** (o estado guarda os
  dias *fechados*), porque a tela é uma lista de trabalho — o gestor quer ver o
  que ajustar sem ter que tocar em cada dia. É a diferença proposital em relação
  a `InconsistenciasScreen`, que abre recolhida por ser um painel de leitura.
  Filtra por pessoa (busca) e pela **marcação que falta** (`Segmentado`:
  Todas · Entrada · Saída · Retorno · Fim). Cada item mostra, nessa ordem: o que
  falta (frase + selos vermelhos), as horas que existem com o turno esperado, as
  horas devidas que o dia gerou e — só quando `confianca === 'BAIXA'` — um aviso
  laranja com a `observacao` do servidor. **Hipótese nunca é exibida como fato**:
  sem o aviso, o item é conclusivo.
- **Item tocável só com acesso ao Relógio Ponto** (`PONTO_VISUALIZAR`). A rota
  `RegistroPonto` só existe na pilha de quem tem essa alçada, então para os
  demais o item segue sendo texto de leitura — um item que parece clicável e não
  faz nada é pior do que um item claramente estático. Na prática, quem vê o
  relatório (`CENTRAL_JORNADA`) é gestão e também tem `PONTO_EDITAR`.
- **A navegação usa `push`, não `navigate`.** O Relógio Ponto costuma já estar
  embaixo na pilha (ele tem um atalho para a Central), e `navigate` voltaria até
  ele, descartando a lista — o "voltar" deixaria de trazer o gestor ao trabalho
  que ele estava fazendo.
- **Modo correção do `RegistroPontoScreen`** (parâmetros `correcao*`): fixa o dia
  e resolve a pessoa **pela ficha do Cadastro** (`colaboradorId`), não pelo id do
  ponto — para fiscais `PessoaPonto.id` é o id do fiscal, e casar pelo id erraria
  a pessoa. Quando não dá para resolver, a tela **não adivinha**: deixa o nome na
  busca e explica o que fazer.
- **A hora nunca é preenchida sozinha.** Quando a marcação que falta é a entrada
  e a escala tem turno, o cartão oferece o horário previsto como **sugestão**
  tocável ("Turno previsto 08:00 — usar como hora"). Preencher e salvar sozinho
  transformaria a previsão da escala em batida registrada, que é exatamente o que
  o ponto não pode fazer.
- **Quem decide a próxima pendência é o servidor.** Após cada batida a tela
  reconsulta `marcacoes-invalidas` do mesmo ciclo: se o dia **continua**
  incompleto, permanece nele e só atualiza o que falta (um dia com duas marcações
  faltando não se resolve com uma batida); se saiu do relatório, oferece o item
  seguinte; se não há mais nada, avisa que a fila acabou. Sem conexão a fila
  **não anda** — o servidor ainda não conhece a batida enfileirada e diria que o
  dia segue incompleto.
- **A fila respeita os filtros da lista de origem** (pessoa e marcação), que
  viajam nos parâmetros da rota. Sem isso, "próxima" levaria a um item que a
  lista nem estava mostrando.
- **No modo correção o atalho da Central sai** do topo (o cabeçalho é o próprio
  ajuste pedido) e o aviso genérico de "dia diferente de hoje" também: o cartão
  já mostra o dia do ajuste e avisa, em amarelo, se o gestor **mudar** de dia no
  seletor. Trocar de pessoa ("Trocar") **encerra** o modo correção.
- **Central de Jornada: os contadores dos atalhos recarregam no foco.** Antes só
  o resumo era atualizado ao voltar; com o ajuste de marcações acontecendo em
  outra tela, um contador congelado diria que ainda há trabalho onde já não há.

## 7. Lógica pura / utilidades
- `leituraComprovanteUtil.ts`: `leituraCompleta(texto)` (gatilho do leitor ao
  vivo: exige hora + marcador do documento) e `horaLida(texto)` (extrai `HH:mm`
  tolerante às trocas do OCR).
- `montarTextoOcr.ts`: `montarTextoDeLinhas` e `textoPelaGeometria` reagrupam as
  linhas do ML Kit por faixa horizontal para o interpretador ancorar
  `HORA:`/`DATA:`/`NOME:`.
- Locais da tela: `seloStatus`/`descricaoStatus` (estados da jornada),
  `mascaraHora`, `corConfianca`/`rotuloConfianca` (confiança da leitura) e
  `progressoCiclo` (dias percorridos do ciclo, na Central).
- `metricasResumo.ts`: `IDENTIDADE_METRICA` (rótulo, título, ícone, cor,
  semântica, `formatar`, `valorTotal` e `valorPessoa` de cada métrica),
  `ORDEM_METRICAS` (ordem fixa das cards) e `contar` (singular/plural).
- `RankingTimeScreen.tsx`: `EXTRA_METRICA` (detalhe dia a dia e frase de vazio
  por métrica), `rotuloMotivo`/`rotuloStatus` (enums de ausência em português) e
  `dataCurta`. A ordenação e a proporção da barra são calculadas na tela — são
  apresentação, não regra de negócio.
- `MarcacoesInvalidasScreen.tsx`: `rotuloMarcacao` (nome da marcação na tela) e
  `seloQuantidade` (amarelo quando falta 1, vermelho quando faltam 2+). A
  **decisão** de quais marcações faltam é do servidor — a tela não recalcula
  nada, só apresenta.
- `filaCorrecao.ts`: `chaveFila` (identidade do item — o relatório é derivado e
  não tem id próprio, então a chave é pessoa + dia, tolerante às duas formas de
  data), `filtrarFila`, `ordenarFila` (dia mais recente primeiro, pessoas em
  ordem alfabética) e `proximaPendencia`. É a **fonte única** dos filtros e da
  ordem: a lista e o Relógio Ponto precisam concordar sobre quais itens estão em
  jogo e em que sequência, senão "próxima" foge do trabalho em curso.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CartaoAcao`, `CartaoMetrica`, `Selo`, `SeletorData`,
  `Segmentado`, `Botao`, `CampoTexto`, `EstadoVazio`, `MensagemErro`,
  `Carregando`; `ApiError`, `confirmar`/`notificar`, contexto offline —
  ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `RegistroPontoScreen.test.tsx` | Busca, jornada, registro manual, limite de 4, erro de duplicidade, leitura do comprovante e o **modo correção** (abre na pessoa/dia pedidos, sugestão do turno sem registrar sozinho, próxima pendência, permanência no dia incompleto, fim da fila, voltar à lista e pessoa não localizada) | 13 |
| `ExportarCicloScreen.test.tsx` | Revisão (totais) e fechamento do ciclo com confirmação | 2 |
| `InconsistenciasScreen.test.tsx` | Agrupamento por dia e filtro por pessoa | 3 |
| `MarcacoesInvalidasScreen.test.tsx` | O que falta em cada dia (já expandido), horas registradas + turno, motivo da conferência, resumo, filtros por pessoa e por marcação, recolher dia, estado vazio, aviso dos não-retornos deixados fora, abertura do ajuste na pessoa/dia do item, filtros levados para a fila, item não tocável sem acesso ao ponto e guarda do primeiro foco | 13 |
| `filaCorrecao.test.ts` | Identidade do item, filtros, ordem de trabalho e próxima pendência (mesmo dia ainda incompleto, item seguinte, volta ao topo, respeito aos filtros e fim da fila) | 10 |
| `CartaoCompensacao.test.tsx` | Card-resumo: invisível (e sem consultar o servidor) para quem não pode conceder, 50% em aberto + o que **não cabe** no ciclo, contagem de sugestões no plural certo ("3 sugestões", nunca "3 sugestãoões") e no singular, a frase de propósito quando não há sugestões, **toque leva à tela** `Compensacao`, e nenhuma lista ou botão de ação na card | 7 |
| `CompensacaoScreen.test.tsx` | Tela de compensação: ciclo e dias restantes, carteira com o que não cabe (e "4 dias úteis", nunca "útileis"), os singulares no último dia do ciclo ("1 dia", "1 pessoa", "1 dia útil"), o **motivo** de não haver sugestões em vez de lista vazia (sem venda, ciclo passado), a liberação com dia/horas/justificativa/régua de venda, conceder só após confirmar (com os minutos certos), nada gravado ao negar, descarte registrado, cobertura de falta pelo débito existente avisando que a falta permanece, lista do que já foi concedido com desfazer, e o estado vazio de quem tem menos de 3h | 12 |
| `RankingTimeScreen.test.tsx` | Ordem do maior ao menor, total do time, zerados no rodapé recolhido, detalhe dia a dia, navegação ao detalhe diário, título/formato por métrica, atestados como métrica separada das faltas, estado vazio e ciclo recebido | 9 |
| `leituraComprovanteUtil.test.ts` | Gatilho `leituraCompleta` e extração `horaLida` (tolerante ao OCR) | 4 |
| `montarTextoOcr.test.ts` | Reconstrução do texto pela geometria do OCR | 3 |

## 10. Riscos, dívidas e pendências
- 🔧 `RegistroPontoScreen.tsx` (>1700 linhas) concentra busca, leitor, jornada,
  formulário, fila offline e o modo correção; candidato a quebrar em
  componentes/hooks (o cartão de correção e o modo correção já saem quase
  inteiros como um hook próprio).
- ⚠️ O OCR só existe no APK (ML Kit); na web o registro é sempre manual — o OCR
  de imagem no servidor foi desativado.
- ⚠️ A leitura da hora nas batidas assume a "hora de parede" do ISO (sem fuso);
  a interpretação final do comprovante depende do servidor.
