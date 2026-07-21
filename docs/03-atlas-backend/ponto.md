> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/ponto/`

# Módulo: `ponto`

## 1. Propósito
Registro de Ponto (leitor de comprovante): grava as batidas do relógio físico,
classifica-as pela ordem do dia, calcula a jornada (trabalho, intervalo, horas
extras e TAC), lê o comprovante por foto (OCR feito no aparelho) e detecta
automaticamente faltas e não-retornos do intervalo.

## 2. Responsabilidades e limites
- **Faz:** registra/corrige/remove batidas (hora do comprovante); calcula a
  jornada do dia com adicional 50%/100%; classifica cada batida
  (entrada → saída p/ intervalo → retorno → encerramento); interpreta o texto
  do comprovante (nome/data/hora) e sugere o colaborador; avisa a supervisão nos
  riscos de TAC (1h30 → 1h40 → TAC); marca faltas automáticas (2h sem batida) e
  não-retorno do intervalo (acima do intervalo máximo do **contrato da pessoa**,
  3h no 6x1); sincroniza o status do fiscal e remove a falta automática quando a
  pessoa bate ponto.
- **Não faz** (fica em outro módulo): agregação por ciclo de folha
  (fica em [`central-jornada`](central-jornada.md)); fechamento do ciclo
  (fica em [`ciclo-folha`](ciclo-folha.md)); as regras data-driven de cada
  contrato (fica em [`tipos-contrato`](tipos-contrato.md)); cadastro das pessoas
  (fica em [`colaboradores`](colaboradores.md)/`fiscais`); notificação em si
  (fica em `notificacoes`); feriados (fica em `feriados`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `ponto.controller.ts` | Rotas HTTP (OCR, pessoas, dia, batidas, histórico TAC) | 122 |
| `ponto.service.ts` | Regras de aplicação: persistência, classificação, avisos de TAC | 1421 |
| `ponto.domain.ts` | Regras puras: classificação e cálculo da jornada/TAC | 410 |
| `ponto.errors.ts` | Erros de domínio (mapeados para HTTP) | 94 |
| `ponto.module.ts` | Ligações (DI) do módulo | 45 |
| `ponto-ocr.service.ts` | Leitura do comprovante + memória de aliases (nome→pessoa) | 285 |
| `ponto-ocr.parser.ts` | Regras puras: extrai nome/data/hora do texto lido | 354 |
| `ponto-nome-match.ts` | Regras puras: similaridade de nomes (Levenshtein) | 93 |
| `ponto-alertas.service.ts` | Cron (1 min): verifica riscos de TAC (dia civil de Brasília) | 58 |
| `ponto-deteccao-automatica.service.ts` | Cron (5 min): falta automática, não-retorno e auto-cura | 277 |
| `deteccao-automatica.domain.ts` | Regras puras: estado do escalado sem batida | 71 |
| `pessoas-ponto.ts` | Funções (não-fiscais) que batem ponto | 15 |
| `dto/ponto.dto.ts` | Validação de entrada das rotas | 88 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `ponto`](../05-referencia-dados/api-http.md#ponto). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /ponto/ocr` | `PONTO_REGISTRAR` | Interpreta o texto do comprovante (lido no APK) e devolve nome/data/hora + candidatos. |
| `GET /ponto/pessoas` | `PONTO_REGISTRAR` | Busca fiscais e operadores ativos por nome para escolher de quem é a batida. |
| `GET /ponto/dia` | `PONTO_VISUALIZAR` | Batidas + jornada calculada de uma pessoa num dia. |
| `GET /ponto/alertas-tac/historico` | `PONTO_VISUALIZAR` | Trilha de alertas de TAC (avisado/corrigido/reincidente) do dia. |
| `POST /ponto/batidas` | `PONTO_REGISTRAR` | Registra uma batida (hora do comprovante) para um colaborador. |
| `PATCH /ponto/batidas/:id` | `PONTO_EDITAR` | Corrige a hora e/ou o tipo de uma batida (só gestão). |
| `DELETE /ponto/batidas/:id` | `PONTO_EDITAR` | Remove uma batida e reclassifica o dia (só gestão). |

## 5. Serviços e funções

### `PontoService`

#### `registrarBatida(dto, usuario)`
- **Recebe:** dados da batida (`RegistrarBatidaDto`) e o usuário autenticado.
- **Devolve:** a jornada do dia recalculada (`JornadaDiaResposta`).
- **Efeitos:** valida idempotência (`clienteId`), data/hora, data permitida e
  ciclo aberto; resolve a ficha ativa; bloqueia dia de folga; grava a batida em
  transação `SERIALIZABLE` (com retry em conflito P2034), reclassifica o dia e
  reescreve o log do fiscal; fora da transação: aprende o alias do leitor,
  publica o status ao vivo (fiscal via `publicarStatusDoDia`; **operador via
  `FiscaisService.publicarStatusColaborador`** — para o painel da escala
  refletir o operador em tempo real), remove a falta automática, avisa conflito
  com ausência e dispara o alerta de TAC.
- **Regras aplicadas:** limite de 4 batidas/dia; anti-duplicidade (< 2 min);
  recusa do retorno após o intervalo máximo.
- **Erros possíveis:** `LimiteBatidasDiaError`, `BatidaDuplicadaError`,
  `RetornoAposLimiteIntervaloError`, `HoraForaDoDiaError`, `HoraFuturaError`,
  `PessoaPontoNaoEncontradaError`, `PessoaPontoInativaError`, `PontoEmFolgaError`.

#### `editarBatida(id, dto)` / `removerBatida(id)`
Corrigem a hora/tipo ou removem a batida em transação atômica, reclassificam o
dia, reescrevem o log do fiscal e recalculam os avisos de TAC (marcando
correção ou reincidência). Exigem data permitida e ciclo aberto.

#### `jornadaDoDia(pessoaId, tipoPessoa, data)`
Lê as batidas do dia, resolve feriado e regras do contrato, e delega o cálculo
ao domínio puro (`calcularJornadaDia`). Devolve a jornada serializável + batidas
com o tipo canônico.

#### `buscarPessoas(busca?)`
Junta fiscais (tabela `Fiscal` com ficha canônica ativa) e colaboradores
não-fiscais ativos, com busca por nome sem acento; devolve até 20 pessoas.

#### `avisarAlertaTacSeNecessario(...)` / `historicoTac(...)`
Avisa a supervisão/gerência nas etapas 1h30/1h40/TAC (no máximo uma vez por
pessoa/dia, com reserva atômica em `AlertaTacEnviado`). O verificador (a cada
minuto) agrupa as batidas pelo **dia civil de Brasília** (`diaCivilBrasilia`) —
antes usava o dia UTC (`inicioDoDia(new Date())`), que entre 21h e 23h59 locais
já aponta o dia seguinte e fazia o TAC deixar de ser avisado na sobra de jornada
noturna (turno de fechamento). Expõe também a trilha de
eventos do dia.

### `PontoOcrService`

#### `lerComprovante(dto)`
Interpreta o texto lido no aparelho (`interpretarComprovante`) e sugere os
colaboradores mais parecidos (similaridade + memória de aliases confirmados).

#### `aprenderAlias(nomeLido, alvo)`
Memoriza "nome lido → pessoa" ao registrar batida do leitor. Uma associação só
é trocada por outra pessoa após 2 confirmações repetidas (evita que um engano
isolado se propague).

### `PontoAlertasService.verificar()` (cron 1 min)
Recalcula a jornada de quem bateu ponto no dia e delega o aviso de TAC ao
`PontoService` (dedup persistente e compartilhada com a batida).

### `PontoDeteccaoAutomaticaService.verificar()` (cron 5 min)
Cruza a escala do dia com o Relógio Ponto: marca falta automática (2h após a
entrada sem batida) e registra não-retorno do intervalo. O não-retorno usa o
sinalizador `jornada.naoRetornoIntervalo` (calculado no domínio com o **máximo
do contrato da pessoa**; 3h no 6x1): saiu para o intervalo, não voltou e passou
do máximo — **inclusive quando o turno já foi dado por encerrado** por intervalo
obrigatório excedido. Antes, a checagem exigia o status `EM_INTERVALO` e nunca
disparava nesses contratos (o turno virava `ENCERRADO` antes). Best-effort e
defensivo por pessoa.

**Auto-cura do não-retorno.** Quando já existe um não-retorno do dia mas a
pessoa fechou o intervalo (voltou — jornada fora do estado de não-retorno e com
uma batida `RETORNO_INTERVALO`), o cron **remove** o não-retorno AUTO-detectado
(`IncidenciasService.removerNaoRetornoAutomatico`, só `origem = DETECTADO_PONTO`;
os manuais do gestor não são tocados). Isso apaga o falso positivo que ficou
quando o retorno entrou **depois** do ciclo que o marcou (retorno anotado em
atraso, corrigido à mão ou reenviado) — cobrindo qualquer via de registro, além
da remoção imediata que o `PontoService` já faz na batida normal.

> **Eficiência (uma carga por ciclo).** As faltas do dia e os não-retornos já
> registrados são carregados **uma única vez** no início do ciclo (antes era um
> `findFirst` por escalado — N consultas a cada 5 min); as checagens "já tem
> falta?" e "já registrado?" são feitas em memória. No não-retorno, o "já
> registrado?" é conferido **antes** de recalcular a jornada, evitando o cômputo
> caro de quem já tem a incidência do dia. Os registros continuam idempotentes
> (a duplicidade é silenciosa), então a checagem em memória é só um atalho.

> **Falta automática × ausência a prazo (chave dupla).** Antes de marcar, o cron
> verifica se já existe ausência no dia. Essa checagem casa **as duas chaves**
> — `pessoaId` (Fiscal.id p/ fiscais, Colaborador.id p/ operadores) **e**
> `colaboradorId` (a ficha) — porque a ausência a prazo de um FISCAL é gravada
> pela ficha (`Colaborador.id`), enquanto o escalado é identificado pelo
> `Fiscal.id`. Checar só `pessoaId` (comportamento antigo) não encontrava a a
> prazo e o cron remarcava uma **falta automática duplicada** por cima dela —
> mesmo padrão de chave dupla já usado em `equipeDoDia` e na remoção da falta ao
> bater ponto. Quem está de **férias** nem chega aqui: já foi excluído de
> `escaladosDoDia`.

## 6. Lógica de domínio (funções puras)
- `classificarBatidas(batidas, maxSemIntervaloMs, intervaloObrigatorio)` →
  ordena por hora e atribui o tipo pela ordem; duas batidas próximas encerram
  jornada sem intervalo apenas quando o contrato não o exige.
- `calcularJornadaDia(batidas, agora, diaSemana, ehFeriado, diaEncerrado, regras)`
  → tempo trabalhado (intervalo não conta), intervalo, extras 50/100, status,
  alerta iminente, TAC e motivos, o que falta para o dia e o sinalizador
  `naoRetornoIntervalo` (saiu para o intervalo e não voltou dentro do máximo).
- `batidaDuplicada(horaMs, existentes, minimo)` → detecta batidas próximas demais.
- `etapaAlertaTac(extrasMs, tac)` → devolve só a etapa mais grave (`RISCO_1H30`,
  `RISCO_1H40`, `TAC`).
- `tipoPorOrdem(indice)`, `statusFiscalDeTipoBatida(tipo)`,
  `statusFiscalDeJornada(status)` → mapeamentos determinísticos.
- OCR (`ponto-ocr.parser.ts`): `interpretarComprovante`, `extrairNomeDetalhe`,
  `extrairDataDetalhe`, `extrairHoraDetalhe`, `normalizarTexto` — tolerantes a
  erros do OCR (letras trocadas por dígitos) e ancorados nos rótulos.
- Nomes (`ponto-nome-match.ts`): `distanciaLevenshtein`, `similaridadePalavra`,
  `scoreNome` (média ponderada por token, mais peso aos sobrenomes).
- Detecção (`deteccao-automatica.domain.ts`): `minutosAposEntrada`,
  `estadoSemBatida` (`AGUARDANDO`/`ALERTA`/`FALTA`).

## 7. Estados e enums
- `TipoBatida`: `ENTRADA` · `SAIDA_INTERVALO` · `RETORNO_INTERVALO` ·
  `ENCERRAMENTO` · `EXTRA`.
- `StatusJornadaPonto`: `SEM_REGISTRO` · `TRABALHANDO` · `EM_INTERVALO` ·
  `ENCERRADO` · `INCOMPLETO`.
- `EtapaAlertaTac`: `RISCO_1H30` → `RISCO_1H40` → `TAC` (escalada monotônica).
- `EstadoSemBatida`: `AGUARDANDO` · `ALERTA` (1h) · `FALTA` (2h).
- `RegrasContrato`: parâmetros de jornada por contrato (o padrão é o 6x1–2x1).

## 8. Dados que o módulo toca
- **Escreve:** `BatidaPonto`, `AlertaTacEnviado`, `EventoAlertaTac`,
  `AliasLeituraPonto`, `RegistroPontoFiscal` (via `FiscaisService`; a ponte
  batidas → status agora repassa o `colaboradorId` da batida para gravar o
  vínculo com a ficha canônica — Fase 4), `Ausencia` (falta automática,
  remoção), `IncidenciaEscala` (não-retorno: registro pela detecção e **remoção
  do auto-detectado** ao registrar um retorno de intervalo válido).
- **Lê:** `Fiscal`, `Usuario`, `Colaborador`, `Ausencia`, `CicloFolha`,
  `TipoContratoJornada` (via serviços).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `ValidacaoDataService`, e (opcionais)
  `FiscaisService`, `PontoOcrService`, `NotificacoesService`, `FeriadosService`,
  `EscalaDomingoService`, `CicloFolhaService`, `TiposContratoService`;
  `OperadoresService` e `IncidenciasService` (detecção automática).
- **É usado por:** [`central-jornada`](central-jornada.md) (reaproveita
  `calcularJornadaDia`), a detecção automática e o app (telas de ponto/jornada).

## 10. Regras de negócio-chave
1. **A hora que vale é a do comprovante** (hora de parede de Brasília), nunca a
   de carregamento; o "agora" é deslocado para Brasília (UTC−3 fixo).
2. **Máximo de 4 batidas por dia** e **anti-duplicidade** (< 2 min entre batidas).
3. **Idempotência por `clienteId`**: reenvios da fila offline não duplicam.
4. **O intervalo não conta como jornada**; TAC quando extras > 1h50, intervalo
   < 1h ou > 3h.
5. **Retorno após o intervalo máximo é recusado** — o dia vira "não retorno".
6. **Não bate ponto em dia de folga** (folga fixa ou domingo de folga do rodízio).
7. **Ciclo de folha fechado bloqueia** registrar/corrigir/excluir batida.
8. **Bater ponto remove a falta automática** do dia (faltas manuais permanecem).
9. **Registrar o retorno do intervalo remove o não-retorno AUTOMÁTICO** do dia:
   quando a pessoa fecha o intervalo dentro do limite (retorno válido), um
   não-retorno auto-detectado (`origem = DETECTADO_PONTO`) — falso positivo do
   verificador que rodou antes do retorno ser registrado (ex.: ficha lançada em
   atraso) — é apagado. Os não-retornos **manuais** do gestor permanecem.
10. **Cada etapa de TAC é avisada uma vez** (dedup persistente que sobrevive a
   reinícios e coordena instâncias).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ponto.domain.spec.ts` | Classificação e cálculo da jornada/TAC (funções puras) | 38 |
| `ponto.service.spec.ts` | Alertas de TAC, validações de pessoa/data/hora, transação e ponte de fiscal | 41 |
| `ponto-ocr.parser.spec.ts` | Extração de nome/data/hora do comprovante | 17 |
| `ponto-ocr.service.spec.ts` | Só pessoas ativas nas sugestões e memória de aliases | 7 |
| `ponto-nome-match.spec.ts` | Similaridade de nomes tolerante ao OCR | 6 |
| `deteccao-automatica.domain.spec.ts` | Estado do escalado sem batida (alerta/falta) | 8 |
| `deteccao-falta-a-prazo.spec.ts` | Ausência a prazo (chave dupla) não vira falta automática duplicada | 3 |
| `ponto-alertas.service.spec.ts` | Cron periódico de riscos de TAC | 1 |
| `contrato-6x1-congelado.spec.ts` | Congela as cargas e os limites de TAC do 6x1 (regra não muda sem intenção) | 6 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `ponto.service.ts` (1352 linhas) concentra persistência, classificação,
  avisos de TAC e pontes (fiscal/ausência). Candidato a extrair sub-serviços.
- ⚠️ O deslocamento de Brasília é fixo (UTC−3): correto enquanto o país não
  tiver horário de verão; uma eventual volta exigiria revisão.
- 🔧 A memória de aliases (`AliasLeituraPonto`) guarda cópia de nome/ficha usada
  só como fallback; a fonte de verdade continua sendo o cadastro atual.
