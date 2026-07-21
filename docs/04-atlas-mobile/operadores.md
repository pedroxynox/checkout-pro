> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `mobile/src/screens/operadores/`

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
- **Programar período** (Gerente/Administrador/Supervisor): abre "Ausências a
  prazo".
- **Jornada da equipe** (`FISCAIS_JORNADA`): atalho para a Jornada de Equipe.
- **Ver escala** (`ESCALA_VISUALIZAR`): traz a escala de fiscais do dia.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `OperadoresScreen.tsx` | Quadro do dia, ao vivo, análise mensal e justificativas | 1886 |
| `JustificativasScreen.tsx` | Lista/edição de justificativas (`JustificativasLista` + tela) | 394 |
| `AusenciasAPrazo.tsx` | Card + modal para registrar **ou cancelar** ausência por período | 481 |
| `AtestadosCard.tsx` | Card + modal para lançar atestado (CID com autocompletar / sem CID) | 398 |

> **Atestado na escala:** o status **ATESTADO** (azul + CID) aparece tanto no
> roster de operadores quanto na **linha do fiscal** (via `fiscalComoColaboradorDia`,
> que lê a marca de atestado/CID da falta do dia), distinguindo-o da falta comum.
| `FeriasCard.tsx` | Card + modal para colocar de férias, listar e cancelar férias | 400 |

## 4. Fluxo do usuário
1. **Dia:** `OperadoresScreen` mostra o roster do dia selecionado agrupado por
   turno (do cadastro), com estado por cor (🟢 trabalha · 🔴 falta · ⚪ folga · azul
   "no retorno"); tocar numa linha abre o Perfil.
2. **Ao vivo:** "Agora no caixa" traz relógio de Brasília, disponíveis/esperados
   e avisos de faltas e não-retornos da franja atual; fiscais têm status ao vivo
   (WebSocket + reconsulta a cada 60s).
3. **Faltas/não-retornos:** cards do dia e painéis do mês com risco (alto/médio/
   baixo), dia recorrente e tendência; o painel abre um modal com o mês inteiro
   e drill-down por colaborador (com advertência por falta não justificada).
4. **Justificativas:** `JustificativasLista` reúne faltas e não-retornos dos
   últimos 30 dias; permite justificar (motivo), marcar como não justificada ou
   reabrir, mostrando quem registrou/justificou. Para **faltas**, gerente/
   supervisor/administrador têm ainda **Excluir** — apaga uma falta lançada por
   engano (ex.: escala desatualizada) para que não pese no colaborador; é
   diferente de abonar (que mantém a falta com peso reduzido).
5. **Ausências a prazo:** o card abre um modal com duas abas — **Registrar**
   (ausenta por período, criando faltas justificadas em cada dia, inclusive a
   folga) e **Cancelar** (desmarca/anula uma ausência a prazo inteira do período
   escolhido). Os motivos **não** incluem "atestado médico" — atestado tem card
   próprio (com CID); o modal traz uma dica apontando para ele.
6. **Férias:** o card abre um modal para colocar um colaborador de férias por um
   período (some da escala, sem virar falta), listar as férias cadastradas e
   cancelá-las. Ambos os cards são de gestão (programar período).
Trata **carregando / erro / vazio**.

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
| Registrar férias | `feriasService.registrar(input)` | `POST /ferias` |
| Listar férias | `feriasService.listar(filtro)` | `GET /ferias` |
| Cancelar férias | `feriasService.remover(id)` | `DELETE /ferias/:id` |
| Incidências | `escalaService.listarIncidencias(filtros)` | `GET /escala/incidencias` |
| Justificar não-retorno | `escalaService.justificarIncidencia(id, dados)` | `PATCH /escala/incidencias/:id/justificativa` |
| Escala de fiscais | `escalaService.consolidada(diaSemana, data)` | `GET /escala/consolidada/:diaSemana` |
| Painel de fiscais (ao vivo) | `fiscaisService.painel()` + `conectarPainelFiscais` | `GET /fiscais/painel` + WebSocket |
| Colaboradores | `colaboradoresService.listar(...)` | `GET /colaboradores` |

Módulos do backend relacionados: [`operadores`](../03-atlas-backend/operadores.md),
[`ferias`](../03-atlas-backend/ferias.md) (inativação não rígida),
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
  modo (`registrar`/`cancelar`), regra de `podeConfirmar` (no cancelar o motivo
  não é exigido) e empurrar o fim junto do início.
- Em `FeriasCard`: mesma busca/seleção de colaborador e período; lista as férias
  cadastradas com `vigente` e permite cancelar (com confirmação).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Selo`, `SeletorData`, `CampoTexto`, `Botao`, `Aviso`,
  `EstadoVazio`, `MensagemErro`, `Carregando`, `Modal`/`ScrollView` (RN);
  `ApiError`, `confirmar`/`notificar`, `conectarPainelFiscais` (socket),
  `ROTULO_STATUS_FISCAL` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `JustificativasScreen.test.tsx` | Falta pendente, justificar com motivo e excluir (gestão) | 3 |

## 10. Riscos, dívidas e pendências
- 🔧 `OperadoresScreen.tsx` (>1800 linhas) reúne roster, ao vivo, análise
  mensal, justificativas e sub-componentes; forte candidato a divisão.
- ⚠️ O status ao vivo combina WebSocket + reconsulta de 60s porque transições
  por tempo não geram batida.
- ⚠️ Faltas de fiscais são alternadas por ausências do dia (eles não estão no
  roster de operadores); depende de `OPERADORES_AUSENCIAS`.
