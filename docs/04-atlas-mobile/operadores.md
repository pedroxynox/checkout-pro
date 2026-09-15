> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `mobile/src/screens/operadores/`

# Área: `operadores`

## 1. Propósito
**Quadro de operadores** com foco no dia: roster do dia (ordenado por entrada,
folgas ao fim), "Agora no caixa" (ao vivo), fiscais escalados, faltas e
não-retornos do dia, análise mensal (faltas e não-retornos com risco), o painel
de **justificativas**, o registro/cancelamento de **ausências a prazo**
(licença) e as **férias** (inativação não rígida: sai da escala pelo período).

## 2. Quem usa (perfis)
- **Escala/ausências** (`OPERADORES_AUSENCIAS`): vê justificativas, faltas do
  dia/mês e o status ao vivo dos fiscais.
- **Abrir o Perfil pela linha do quadro** exige `COLABORADORES_PERFIL` (a ficha é
  dado confidencial); sem a permissão a linha continua visível, mas não navega.
- **Programar período** (Gerente/Administrador/Supervisor): abre "Ausências a
  prazo".
- **Jornada da equipe** (`FISCAIS_JORNADA`): atalho para a Jornada de Equipe.
- **Ver escala** (`ESCALA_VISUALIZAR`): traz a escala de fiscais do dia.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `OperadoresScreen.tsx` | Quadro do dia, ao vivo, análise mensal e justificativas | 1937 |
| `JustificativasScreen.tsx` | Lista/edição de justificativas (`JustificativasLista` + tela) | 458 |
| `AusenciasAPrazo.tsx` | Card + modal para registrar **ou cancelar** ausência por período | 480 |
| `AtestadosCard.tsx` | Card + modal para lançar atestado (CID com autocompletar / sem CID), ver os **em curso e programados** (com filtro para incluir os encerrados) **e excluir** um lançado por engano | 625 |

> **Atestado na escala:** o status **ATESTADO** (azul + CID) aparece tanto no
> roster de operadores quanto na **linha do fiscal** (via `fiscalComoColaboradorDia`,
> que lê a marca de atestado/CID da falta do dia), distinguindo-o da falta comum.
> No card **"Atestados do dia"**, além do nome e do CID, mostra-se o **período do
> atestado** ("início até fim", de `atestadoInicio`/`atestadoFim`).
| `FeriasCard.tsx` | Card + modal para colocar de férias, listar as em curso/futuras (com filtro para incluir as encerradas) e cancelar | 471 |

## 4. Fluxo do usuário
0. **Atalhos do topo:** "Ver jornada da equipe" (`FISCAIS_JORNADA`) e **"Publicar
   escala (PDF ou imagem)"** (`ESCALA_VISUALIZAR`), que abre a área
   [`escala`](escala.md). O atalho de publicar vive aqui, e não na Home, porque é
   a **mesma escala desta tela vista como documento** — quem vai publicar já está
   olhando o dia.
1. **Dia:** `OperadoresScreen` mostra o roster do dia selecionado agrupado por
   turno (do cadastro), com estado por cor (🟢 trabalha · 🔴 falta · ⚪ folga · azul
   "no retorno"); tocar numa linha abre o Perfil (só com `COLABORADORES_PERFIL`).
2. **Ao vivo:** "Agora no caixa" traz relógio de Brasília, disponíveis/esperados
   e avisos de faltas e não-retornos da franja atual; fiscais têm status ao vivo
   (WebSocket + reconsulta a cada 60s).
3. **Faltas/não-retornos:** cards do dia e painéis do mês com risco (alto/médio/
   baixo), dia recorrente e tendência; o painel abre um modal com o mês inteiro
   e drill-down por colaborador (com advertência por falta não justificada).
4. **Justificativas:** `JustificativasLista` reúne faltas e não-retornos dos
   últimos 30 dias; permite justificar (motivo), marcar como não justificada ou
   reabrir, mostrando quem registrou/justificou. Os motivos **não** incluem
   "atestado médico" (mesma regra do card de ausências a prazo): atestado entra só
   pelo card **Atestados**, com CID e período. Abonar por aqui criava um atestado
   sem documento — o servidor também recusa esse motivo. O rótulo segue existindo
   para **exibir** os registros antigos e os dias criados pelo fluxo de Atestados. Gerente/supervisor/administrador
   têm ainda **Excluir** — tanto para **faltas** quanto para **não-retornos** —
   que apaga a ocorrência lançada por engano (ex.: escala desatualizada, ou
   retorno do intervalo anotado em atraso, que fez o verificador marcar o
   não-retorno antes da batida entrar) para que não pese no colaborador; é
   diferente de abonar (que mantém a ocorrência com peso reduzido).
5. **Ausências a prazo:** o card abre um modal com duas abas — **Registrar**
   (ausenta por período, criando faltas justificadas em cada dia, inclusive a
   folga) e **Cancelar** (desmarca/anula uma ausência a prazo inteira do período
   escolhido). Os motivos **não** incluem "atestado médico" — atestado tem card
   próprio (com CID); o modal traz uma dica apontando para ele. O período usa o
   [`SeletorPeriodo`](componentes-compartilhados.md), com contador de dias ao
   vivo e duração digitável (sem aviso de limite neste fluxo).
6. **Atestados (lançar):** o período usa o
   [`SeletorPeriodo`](componentes-compartilhados.md): o contador mostra quantos
   dias corridos o atestado cobre e o campo **Duração (dias)** posiciona o fim
   sozinho — um atestado de 5 dias não precisa mais ser contado de cabeça. Acima
   de **15 dias corridos** aparece um aviso sobre possível encaminhamento ao
   INSS. O aviso fala apenas **deste** atestado: a regra real soma os dias do
   **mesmo CID** numa janela de 60 dias e só o servidor a avalia, devolvendo
   `ultrapassaInss`/`totalDiasMesmoCid` ao lançar.
7. **Atestados (conferir e excluir):** o mesmo modal lista, abaixo do formulário,
   os **atestados em curso e programados** — os já encerrados ficam **fora por
   padrão**, porque a seção é operacional ("quem está de atestado e quem vai
   entrar"), não um arquivo histórico. A janela pedida ao backend **começa hoje**
   e vai 60 dias à frente; como o filtro do backend é de **interseção**, um
   atestado que começou antes e ainda não terminou continua aparecendo.
   O filtro **“Mostrar encerrados”** recua o início da janela 90 dias e traz os
   passados de volta — é o caminho para **excluir um atestado lançado por engano
   num período que já terminou**, que de outra forma ficaria inalcançável.
   Cada linha marca o estado: **“• em atestado”** (em curso) ou
   **“• encerrado”**; sem marca é um atestado programado. Os dois vêm dos campos
   `vigente`/`encerrado`, derivados no backend — o app não compara datas.
   Cada linha traz período, dias, CID e quem lançou. O botão **Excluir** só aparece para
   gerente, supervisor e administrador; a confirmação diz quantos dias serão
   apagados e quantos **voltarão a ser falta pendente**, e avisa que a ação não
   pode ser desfeita. Não há edição: para corrigir datas ou CID, exclua e lance
   de novo.
8. **Férias:** o card abre um modal para colocar um colaborador de férias por um
   período (some da escala, sem virar falta), listar as férias **em curso e
   futuras** e cancelá-las. O período usa o
   [`SeletorPeriodo`](componentes-compartilhados.md), com aviso acima de **30
   dias corridos** (duração usual de um ciclo) — é só um alerta, não um bloqueio.
   A duração vem do **backend** (`dias` em `FeriasDetalhada` e na resposta do
   registro), tanto no aviso de confirmação quanto na lista.
   Períodos já encerrados não aparecem **por padrão** — a tela é operacional, e o
   registro continua guardado para os dias passados seguirem corretos na escala.
   O filtro **“Mostrar encerradas”** envia `incluirEncerradas` e os traz de volta,
   que é o caminho para **cancelar umas férias lançadas por engano num período
   passado**. Cada linha marca o estado: **“• em férias”** (em curso) ou
   **“• encerrada”**; sem marca é uma férias programada — campos
   `vigente`/`encerrada`, derivados no backend.
   Todos esses cards são de gestão (programar período).
Trata **carregando / erro / vazio**.

### Aviso de ciclo de folha (nos três fluxos de período)
Os três modais consultam, enquanto se escolhem as datas, quais **ciclos de folha
(26→25)** o período toca — via [`useAvisoCicloFolha`](hooks-e-utilidades.md) —, e
mostram o resultado como aviso, sem bloquear:

- **Atravessa o fechamento:** informa entre que ciclos o período se reparte e
  quantos dias vão para cada um. Importa porque os dias caem em **duas folhas**.
- **Alcança um ciclo fechado:** em atestado e ausência a prazo o backend
  **recusa** o lançamento (409, nomeando o ciclo), então o aviso anuncia o
  impedimento; em **férias** o backend permite, e o texto apenas avisa que o
  registro muda o que aquele ciclo mostra.

Antes disso o gestor só descobria o problema ao salvar — e o backend conferia
apenas o **primeiro** dia do período, deixando o resto entrar num ciclo fechado
sem controle.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Roster do dia | `operadoresService.dia(data)` | `GET /quadro-operadores/dia` |
| Ao vivo | `operadoresService.aoVivo()` | `GET /quadro-operadores/ao-vivo` |
| Faltas (mês) | `operadoresService.analiticaFaltas(ini, fim)` | `GET /quadro-operadores/faltas/analitica` |
| Não-retornos (mês) | `operadoresService.analiticaNaoRetornos(ini, fim)` | `GET /quadro-operadores/nao-retornos/analitica` |
| Faltas do dia | `operadoresService.listarAusencias(ini, fim)` | `GET /operadores/ausencias` |
| Justificar falta | `operadoresService.justificarAusencia(id, dados)` | `PATCH /operadores/ausencias/:id/justificativa` |
| Excluir falta (rejeitar engano) | `operadoresService.removerAusencia(id)` | `DELETE /operadores/ausencias/:id` |
| Ausência por período | `operadoresService.registrarAusenciaPeriodo(input)` | `POST /operadores/ausencias/periodo` |
| Cancelar ausência a prazo | `operadoresService.removerAusenciaPeriodo(input)` | `DELETE /operadores/ausencias/periodo` |
| Lançar atestado | `atestadosService.lancar(input)` | `POST /atestados` |
| Autocompletar CID | `atestadosService.buscarCid(busca)` | `GET /atestados/cid` |
| Listar atestados em curso e programados | `atestadosService.listar(hoje, hoje+60)` | `GET /atestados` |
| Excluir atestado | `atestadosService.remover(id)` | `DELETE /atestados/:id` |
| Registrar férias | `feriasService.registrar(input)` | `POST /ferias` |
| Ciclos tocados pelo período | `cicloFolhaService.intervalo(inicio, fim)` | `GET /ciclo-folha/intervalo` |
| Listar férias | `feriasService.listar(filtro)` | `GET /ferias` |
| Cancelar férias | `feriasService.remover(id)` | `DELETE /ferias/:id` |
| Incidências | `escalaService.listarIncidencias(filtros)` | `GET /escala/incidencias` |
| Justificar não-retorno | `escalaService.justificarIncidencia(id, dados)` | `PATCH /escala/incidencias/:id/justificativa` |
| Escala de fiscais | `escalaService.consolidada(diaSemana, data)` | `GET /escala/consolidada/:diaSemana` |
| Painel de fiscais (ao vivo) | `fiscaisService.painel()` + `conectarPainelFiscais` | `GET /fiscais/painel` + WebSocket |
| Colaboradores | `colaboradoresService.listar(...)` | `GET /colaboradores` |

Módulos do backend relacionados: [`operadores`](../03-atlas-backend/operadores.md),
[`ferias`](../03-atlas-backend/ferias.md) (inativação não rígida),
[`ciclo-folha`](../03-atlas-backend/ciclo-folha.md) (aviso e bloqueio por ciclo),
[`incidencias`](../03-atlas-backend/incidencias.md),
[`fiscais`](../03-atlas-backend/fiscais.md) (status ao vivo) e
[`escala-domingo`](../03-atlas-backend/escala-domingo.md) (rodízio de domingo).

## 6. Estado local e regras de UI
- **Faltas e não-retornos são detectados automaticamente** pelo ponto; a linha
  apenas exibe o estado (não há marcação manual no roster).
- `turnoDe` usa o **turno do cadastro** (Abertura/Intermediário/Fechamento/
  Apoio); folga vai para um card no fim; sem turno cai em "Sem turno".
- `COBERTURA_MINIMA = 20`: abaixo disso, aviso de cobertura baixa; a contagem
  por turno considera só quem trabalha.
- Fiscais entram no topo, tratados como `ColaboradorDia`; sem ficha vinculada
  viram linha só de leitura ("Sem ficha").
- Domingo: banner do rodízio de grupos (ou aviso se não configurado).
- O relógio atualiza a cada 1s; o status ao vivo só aparece quando o dia é hoje;
  `versaoJustificativas` força recarregar a lista.
- **Status ao vivo para fiscais E operadores:** o selo (Disponível/Intervalo/
  Fora) aparece na linha de qualquer pessoa que bateu ponto hoje. O `painel()`
  agora inclui operadores (com `tipoPessoa`), e o operador emite evento WebSocket
  ao bater ponto (tempo real); a reconsulta de 60s cobre as transições por tempo.
- **Excluir atestado é alçada de gestão** (gerente/supervisor/administrador),
  igual à exclusão de falta em Justificativas: lançar é rotina da escala, mas
  desfazer é destrutivo. Se o ciclo de folha do mês já estiver fechado, o servidor
  recusa a exclusão.
- O mapa de **status ao vivo** é indexado pela **ficha canônica**
  (`colaboradorId`), com fallback ao `fiscalId` legado — painel, evento WebSocket
  e a busca na linha da escala usam a mesma chave (Fase 4 · Opção A · A.5).

## 7. Lógica pura / utilidades
- `corStatus`/`rotuloStatus`, `turnoDe`, `contarTurnos`, `iconeGenero`,
  `relogioBrasilia`, `gruposQueTrabalhamDomingo`, `mesAtualISO`,
  `fiscalComoColaboradorDia`, `seloJustificativa`.
- Em `JustificativasScreen`: `janela()` (últimos 30 dias em dia-calendário de
  Brasília), `coresStatus` e a ordenação por estado.
- Em `AusenciasAPrazo`: filtro de busca com `MAX_RESULTADOS`, alternância de
  modo (`registrar`/`cancelar`) e regra de `podeConfirmar` (no cancelar o motivo
  não é exigido). O ajuste das datas saiu daqui: quem cuida do período é o
  `SeletorPeriodo`.
- Em `FeriasCard`: mesma busca/seleção de colaborador e período; lista as férias
  em curso/futuras com `vigente`/`encerrada` e permite cancelar (com confirmação).
  `DIAS_FERIAS_USUAIS = 30` é o limite do aviso de duração; os dias exibidos vêm
  do backend. O estado `mostrarEncerradas` entra nas dependências do
  `useRequisicao`, para a lista recarregar ao alternar o filtro.
- Em `AtestadosCard`: `isoDeslocado(dias)` (sobre `deslocarDiasISO`) para os
  limites da janela da listagem, que **começa em `hojeISO()`** — é o que descarta
  os atestados encerrados — ou em `-JANELA_ATRAS_DIAS` quando `mostrarEncerrados`
  está ligado (esse estado entra nas dependências do `useRequisicao`, para a
  lista recarregar ao alternar); `LIMITE_INSS_DIAS = 15` é o limite do aviso (espelho do
  backend, que decide de verdade); `PERFIS_EXCLUEM_ATESTADO` (também espelho)
  decide se o botão **Excluir** aparece — quem decide de verdade é o servidor,
  que devolve 403 para quem não tem alçada.
- Os três cards deixaram de ter o seu próprio `ddmm(iso)`: a formatação curta é
  `isoParaDiaMes` em [`utils/formato`](hooks-e-utilidades.md).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `SeletorPeriodo` — período com contador de dias e duração editável, usado nos
  três fluxos de período (ausência a prazo, atestado e férias).
- `useAvisoCicloFolha` — o aviso de ciclo de folha que os três passam ao
  `avisoExtra` do `SeletorPeriodo`; ver [Hooks e utilidades](hooks-e-utilidades.md).
- `contarDiasCorridos`, `deslocarDiasISO` e `isoParaDiaMes` de `utils/formato` —
  ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Selo`, `SeletorData`, `CampoTexto`, `Botao`, `Aviso`,
  `EstadoVazio`, `MensagemErro`, `Carregando`, `Modal`/`ScrollView` (RN);
  `ApiError`, `confirmar`/`notificar`, `conectarPainelFiscais` (socket),
  `ROTULO_STATUS_FISCAL` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `JustificativasScreen.test.tsx` | Falta pendente, justificar com motivo, "atestado médico" fora da lista de motivos e excluir (gestão) | 5 |

## 10. Riscos, dívidas e pendências
- 🔧 `OperadoresScreen.tsx` (>1800 linhas) reúne roster, ao vivo, análise
  mensal, justificativas e sub-componentes; forte candidato a divisão.
- ⚠️ O status ao vivo combina WebSocket + reconsulta de 60s porque transições
  por tempo não geram batida.
- ⚠️ Faltas de fiscais são alternadas por ausências do dia (eles não estão no
  roster de operadores); depende de `OPERADORES_AUSENCIAS`.
- ⚠️ A janela da listagem vai só **60 dias à frente**: um atestado programado para
  além disso não aparece. E com "mostrar encerrados" ela alcança **90 dias para
  trás** — um atestado mais antigo que isso continua inalcançável para exclusão.
- ⚠️ O filtro de férias **não tem recorte de janela**: ligá-lo traz o histórico
  inteiro do colaborador (ou de todos). Hoje isso é irrelevante, mas com anos de
  operação a lista cresce — o backend aceita `referencia`, então há por onde
  limitar quando incomodar. (Em atestados o recorte já existe: 90 dias.)
- ⚠️ Os limites dos avisos (**15** dias no atestado, **30** nas férias) são
  espelhos escritos à mão. O do atestado acompanha `LIMITE_INSS_DIAS` do
  backend; o das férias **não existe no backend** (lá o único teto é 366 dias),
  então é uma convenção só da tela.
- 🔧 O aviso de ciclo de folha **não desabilita** o botão de lançar quando o
  ciclo está fechado: quem recusa é o servidor (409, com o ciclo nomeado).
  Deixar tentar e falhar com uma mensagem clara é aceitável, mas desabilitar
  seria melhor.
- ⚠️ O aviso de ciclo é **best-effort**: se a consulta falhar (sem rede ou sem
  permissão), o modal segue sem aviso e a recusa só aparece ao salvar.
