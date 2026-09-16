> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-16 · **Cobre:** `backend/src/arrecadacao/`

# Módulo: `arrecadacao`

## 1. Propósito
Importa os arquivos de **arrecadação por operador** (troco solidário, recargas de
celular, cancelamentos e devoluções), calcula os totais e o ranking dos
indicadores e oferece a camada de **inteligência** (tendência, comparativo,
projeção, destaques do mês, anomalias e painel de atenção) e o **Histórico de
Indicadores**: uma janela móvel de 24 meses com a evolução de um mês para o
outro.

Hospeda também o indicador **calculado** `CANCELAMENTOS_TOTAIS` (itens + cupom
sobre as vendas, com teto próprio por mês e um **diagnóstico** do que está
impactando e do que fazer) — que não tem arquivo de importação e por isso **não**
entra em `TIPOS_ARRECADACAO`. Ver
[ADR 0025](../02-arquitetura/decisoes/0025-cancelamentos-totais-indicador-calculado.md).

## 2. Responsabilidades e limites
- **Faz:** lê o arquivo `.txt` de cada tipo e substitui os lançamentos do dia;
  marca/desmarca "sem movimento"; calcula totais (dia/semana/mês) e percentuais
  sobre vendas; monta ranking e detalhe por operador; resolve/lista as metas dos
  indicadores; gera a inteligência (série temporal, comparativo, projeção de
  fechamento, destaques do mês, anomalias e painel "Precisa de atenção"); e envia
  o resumo diário automático aos gestores; mantém o **Histórico de Indicadores**
  (foto mensal de cada indicador, evolução mês a mês e limpeza automática do que
  sai da janela de retenção); e calcula o indicador **Cancelamentos Totais** (soma
  das duas metades de cancelamento sobre as vendas) com o seu diagnóstico.
- **Não faz:** gerência das metas mensais em si (delega ao módulo
  [`metas`](metas.md)); conclusão/aviso do fechamento do dia (delega ao módulo
  [`fechamento`](fechamento.md)); cadastro/vínculo de colaboradores (usa o
  vínculo de [`colaboradores`](colaboradores.md)); as vendas propriamente ditas
  (ficam em [`vendas`](vendas.md), das quais só lê os totais para os percentuais).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `arrecadacao.controller.ts` | Rotas HTTP (upload, resumo, ranking, inteligência, histórico) | 253 |
| `arrecadacao.service.ts` | Regras de aplicação: importação, totais, ranking, metas | 563 |
| `indicadores-inteligente.service.ts` | Inteligência: tendência, projeção, destaques, anomalias | 766 |
| `indicadores-resumo.service.ts` | Resumo diário automático (cron 08:00) | 122 |
| `historico-indicadores.service.ts` | Histórico mensal: foto do mês, série de 24 meses e limpeza da janela (cron dia 1º) | 478 |
| `historico-indicadores.domain.ts` | Regras puras: aritmética de "AAAA-MM", semáforo do mês, variação e evolução por sentido | 211 |
| `cancelamentos-totais.service.ts` | Indicador calculado: mês, detalhe e histórico dos cancelamentos somados | 449 |
| `cancelamentos-totais.domain.ts` | Regras puras do indicador calculado: avaliação, composição, concentração, simulação, perfil e **diagnóstico** | 686 |
| `arrecadacao.parser.ts` | Lê o `.txt` por cabeçalho (nome/valor/qtd/motivo) | 152 |
| `arrecadacao.domain.ts` | Regras puras: tipos, config de indicadores, utilitários de período | 87 |
| `arrecadacao.module.ts` | Ligações (DI) do módulo | 45 |
| `dto/arrecadacao.dto.ts` | Validação de entrada das rotas | 140 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `arrecadacao`](../05-referencia-dados/api-http.md#arrecadacao).

O controller exige `INDICADORES_VISUALIZAR` por padrão; algumas rotas reforçam
uma permissão específica.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /arrecadacao/upload` | `IMPORTACOES` | Recebe o `.txt` de um tipo e importa as linhas do dia (substitui o dia). |
| `GET /arrecadacao/resumo` | `INDICADORES_VISUALIZAR` | Totais do dia/semana/mês (e % sobre vendas nos indicadores base VENDAS). |
| `GET /arrecadacao/status` | `FECHAMENTO`, `IMPORTACOES` ou `CARGA_STATUS_VISUALIZAR` | Estado (enviado / sem movimento / pendente) de cada tipo no dia. |
| `POST /arrecadacao/sem-movimento` | `IMPORTACOES` | Marca um tipo como "sem movimento" no dia. |
| `DELETE /arrecadacao/sem-movimento` | `IMPORTACOES` | Remove a marca de "sem movimento" (correção). |
| `GET /arrecadacao/ranking` | `INDICADORES_VISUALIZAR` | Ranking de operadores cadastrados por valor no intervalo. |
| `GET /arrecadacao/detalhes` | `INDICADORES_VISUALIZAR` | Detalhe por lançamento (operador, autorização, motivo, valor). |
| `GET /arrecadacao/nao-reconhecidos/resumo` | `INDICADORES_VISUALIZAR` | Agregado dos lançamentos sem cadastro (total + nº). |
| `GET /arrecadacao/nao-reconhecidos` | `OPERADORES_CRUD` | Fila de códigos soltos para associar/criar cadastro. |
| `GET /arrecadacao/metas` | `INDICADORES_VISUALIZAR` | Lista as metas configuradas (com fallback aos padrões). |
| `POST /arrecadacao/metas` | `ADMIN_DADOS` | Define (cria/atualiza) a meta de um indicador. |
| `GET /arrecadacao/historico` | `INDICADORES_VISUALIZAR` | Série **mensal** da janela de retenção (padrão 24 meses) com meta do mês, semáforo e evolução vs o mês anterior. |
| `GET /arrecadacao/tendencia` | `INDICADORES_VISUALIZAR` | Série temporal dos últimos N dias (padrão 30). |
| `GET /arrecadacao/comparativo` | `INDICADORES_VISUALIZAR` | Mês/semana atual vs período anterior. |
| `GET /arrecadacao/projecao` | `INDICADORES_VISUALIZAR` | Projeção de fechamento de mês + meta diária. |
| `GET /arrecadacao/destaques-mes` | `INDICADORES_VISUALIZAR` | Destaques do mês (só operadores concorrem). |
| `GET /arrecadacao/anomalias` | `INDICADORES_VISUALIZAR` | Operadores muito acima da média em cancelamentos/devoluções. |
| `GET /arrecadacao/painel-atencao` | `INDICADORES_VISUALIZAR` | Painel "Precisa de atenção" (metas em risco + operadores). |
| `GET /arrecadacao/cancelamentos-totais` | `INDICADORES_VISUALIZAR` | Indicador **Cancelamentos Totais** do mês (`anoMes`): total, %, teto em R$, excedente e semáforo. |
| `GET /arrecadacao/cancelamentos-totais/detalhe` | `INDICADORES_VISUALIZAR` | Detalhe do mês: composição, ofensores, concentração, simulação, motivos, autorizadores, perfil, **diagnóstico** e histórico mensal. |

> As duas rotas de Cancelamentos Totais recebem `anoMes` (`AAAA-MM`) e caem no mês
> corrente quando o parâmetro é inválido ou ausente — mesmo tratamento do
> indicador de Sacolas. **Não existe** upload nem "sem movimento" para elas: o
> indicador é calculado.

## 5. Serviços e funções

### `ArrecadacaoService`

#### `importar(tipo, data, linhas)`
- **Recebe:** o tipo de indicador, a data de referência e as linhas já lidas do
  arquivo.
- **Devolve:** `ResultadoUploadArrecadacao` (quantidade, total e se o envio
  concluiu o fechamento do dia).
- **Efeitos:** valida a data contra a Data Inicial do Sistema; numa transação,
  **apaga os lançamentos do tipo no dia** e recria com os do arquivo, e remove a
  eventual marca de "sem movimento"; por fim chama `fechamento.concluirSeCompletou`.
- **Regras aplicadas:** cada envio **substitui** o dia inteiro daquele tipo
  (reenvio corrige); movimento real desfaz o "sem movimento".

#### `status(data)`
Devolve, para cada tipo, `ENVIADO` (tem lançamento), `SEM_MOVIMENTO` (marcado) ou
`PENDENTE`.

#### `marcarSemMovimento(tipo, data, marcadoPor?)` / `removerSemMovimento(tipo, data)`
Marca/remove "sem movimento" (upsert idempotente por tipo+data). Marcar pode
concluir o fechamento do dia (retorna `fechamentoConcluido`).

#### `metaDe(tipo, data)` · `listarMetas()` · `definirMeta(tipo, meta, atualizadoPor?)`
Resolve a meta do indicador: para os tipos geridos por mês (recargas,
cancelamentos, devoluções) usa `MetasService.resolver`; `TROCO_SOLIDARIO` segue a
meta global de `MetaIndicador`/CONFIG. `definirMeta` faz upsert em `MetaIndicador`.

#### `resumo(tipo, data)`
Totais do dia, da semana (seg–dom) e do mês, mais quantidades. Para indicadores
base `VENDAS`, calcula também vendas do período e o percentual (total ÷ vendas × 100).

#### `ranking(tipo, inicio, fim)` / `detalhes(tipo, inicio, fim)`
Somente colaboradores **cadastrados** (casados por matrícula/login via vínculo).
`ranking` agrega por operador ordenando por valor; `detalhes` lista até 300
lançamentos com autorização/motivo, ordenados por valor.

#### `naoReconhecidos(tipo, inicio, fim)` / `listarNaoReconhecidos(inicio, fim)`
`naoReconhecidos` soma a fatia de lançamentos **sem cadastro** (linha "Não
reconhecidos"). `listarNaoReconhecidos` agrupa os códigos soltos por matrícula
(somando todos os indicadores), ignorando lançamentos sem código.

### `IndicadoresInteligenteService`
- `tendencia(tipo, dataFim, dias=30)` — série temporal diária (com % nas bases VENDAS).
- `comparativo(tipo, data)` — mês vs mês anterior e semana vs semana anterior.
- `projecaoMes(tipo, data)` — projeção ao ritmo atual, meta diária derivada e se
  vai cumprir a meta.
- `destaquesMes(data)` — top operador em troco, recargas, cancelamento de itens e
  o "menos cancelou" (premiação). **Só operadores concorrem.**
- `anomalias(data)` — operadores cadastrados com cancelamentos/devoluções ≥ 2× a
  média da equipe (mínimo 3 pessoas).
- `painelAtencao(data)` — metas em risco (com gap, tendência e projeção) e
  operadores acima da média, ordenados por severidade.

### `HistoricoIndicadoresService`
- `historico(tipo, meses?, hoje?)` — série mensal da janela: um ponto por mês, do
  mais antigo ao mais recente, com `total`/`percentual`, a meta que valia naquele
  mês, o semáforo, a variação vs o mês anterior e a `evolucao` já interpretada
  pelo sentido. O **mês corrente** vem ao vivo (`parcial: true`); os **fechados**
  vêm da foto. `meses` é limitado pela retenção (não há dado além dela).
- `congelarMes(anoMes)` — apura o mês e grava/reescreve a foto de cada
  indicador. Idempotente; meses inteiramente vazios não geram foto.
- `congelarMesesFechados(hoje?)` — congela os meses fechados da janela que ainda
  não têm foto. É o que preenche o histórico dos meses já existentes.
- `purgarForaDaJanela(hoje?)` — apaga, numa transação, os lançamentos, as marcas
  de "sem movimento", as vendas (dia e hora) e as fotos **anteriores** ao mês
  limite. Devolve a contagem por entidade.
- `rotinaMensal()` — cron do dia 1º às 01:00 (Brasília): congela primeiro, move a
  janela depois. Se o congelamento falhar, **nada é apagado**.
- `mesesRetencao()` — janela configurada (`RETENCAO_INDICADORES_MESES`, piso 1).

### `CancelamentosTotaisService`
O indicador **calculado** (ADR 0025). Não importa nada: soma o que os dois
arquivos de cancelamento já gravaram.

- `indicador(anoMes)` — a card do painel: total (itens + cupom), % sobre as
  vendas, meta do mês, semáforo, **desvio** até o teto, o teto traduzido em R$
  (`limiteReais`) e o **excedente** (quanto passou dele), mais a leitura de
  evolução vs o mês anterior.
- `detalhe(anoMes)` — acrescenta as leituras que explicam o número: `composicao`
  (qual metade manda), `ofensores` (ranking combinado, top 10), `concentracao`
  (gente × processo), `simulacao` (o mês sem os 3 maiores), `motivos` e
  `autorizadores` (**só do cupom**), `perfil` (forma do dano), o `diagnostico`
  (resumo + causas + ações) e o `historico` mensal.
- `historico(meses?, anoMesFinal?)` — série mensal apurada ao vivo dentro da
  janela de retenção; um mês fechado que já perdeu o dado cru cai na **soma das
  fotos dos dois tipos**. O indicador **não grava foto própria**.

Fontes: totais e vendas por Prisma; a meta por `MetasService.resolver`; o ranking
por `ArrecadacaoService.ranking` de cada tipo, fundido por nome canônico; a
retenção por `HistoricoIndicadoresService.mesesRetencao()`.

### `IndicadoresResumoService.resumoDiario()`
Cron diário às 08:00 (Brasília): monta o panorama do dia anterior (semáforo por
indicador, destaques e anomalias) e notifica quem tem `INDICADORES_VISUALIZAR`.

## 6. Lógica de domínio (funções puras)
- `TIPOS_ARRECADACAO` / `ehTipoArrecadacao(v)` — universo de tipos de indicador.
- `CONFIG_ARRECADACAO` — por tipo: título, base (`FIXA`/`VENDAS`), meta padrão e
  sentido (`MAIOR_MELHOR`/`MENOR_MELHOR`).
- `concorreAosDestaques(funcao)` — verdadeiro **apenas** para `OPERADOR` (barra
  fiscal/supervisor/gestor dos destaques).
- Utilitários de período em UTC reexportados de `common/datas`
  (`inicioDoDia`, `inicioDaSemana`, `inicioDoMes`, etc.).
- Histórico (`historico-indicadores.domain.ts`): aritmética de período mensal
  (`inicioDoAnoMes`, `fimDoAnoMes`, `anoMesDeslocado`, `janelaDeMeses`,
  `anoMesLimiteDaJanela`, `rotuloAnoMes`), `valorComparavel` (R$ ou % sobre
  vendas), `nivelDoMes` e `cumpriuMeta` (**fonte única** do semáforo mensal, que
  desde a ADR 0022 decidem pelo **sentido** e não pela base — ver a regra no §10),
  `variacaoMensal` e `evolucaoDoMes` — esta última traduz a variação em
  melhora/piora **respeitando o sentido** (cair é MELHORAR em cancelamentos e
  devoluções) — e `sequenciaCumprindo` (meses seguidos dentro da meta).
- Cancelamentos Totais (`cancelamentos-totais.domain.ts`), tudo puro e testado:
  - `TIPOS_DO_TOTAL` (os dois tipos somados), `SENTIDO_CANCELAMENTOS`
    (`MENOR_MELHOR`, tipado como literal para ninguém invertê-lo) e
    `META_PADRAO_CANCELAMENTOS_TOTAIS` (0,75).
  - `estadoDoIndicador` / `percentualSobreVendas` — **`null` em vez de 0** quando
    não há venda registrada; `avaliarMes` reaproveita `nivelDoMes` e
    `cumpriuMeta` (nenhum limiar novo) e devolve `desvio`, `limiteReais` e
    `excedente`.
  - `composicaoDe` (dominante a partir de `LIMIAR_DOMINANCIA_PCT` = 60),
    `fundirOfensores` (funde os dois rankings por nome canônico),
    `concentracaoDe` (espalhado abaixo de `LIMIAR_CONCENTRACAO_PCT` = 50),
    `simularSemMaiores` (o mês sem os N maiores), `perfilDoDano` (fatia dos 10%
    maiores → poucos grandes / muitos pequenos) e `agruparPorRotulo` (motivos e
    autorizadores, com "Não informado" preservado).
  - `diagnosticar` — monta resumo, causas e **ações deduzidas dos números**. O
    texto mora no domínio, e não na tela, para o app e um relatório futuro
    contarem a mesma história sobre o mesmo mês.
- Parser (`arrecadacao.parser.ts`): localiza colunas pelo cabeçalho (nome, valor,
  quantidade, autorizador, motivo), extrai "matrícula - nome" das devoluções e
  interpreta valor com vírgula decimal.

## 7. Estados e enums
- `TipoArrecadacao`: `TROCO_SOLIDARIO` · `RECARGAS_CELULAR` · `CANCELAMENTO_ITENS`
  · `CANCELAMENTO_CUPOM` · `DEVOLUCOES`. **`CANCELAMENTOS_TOTAIS` não está aqui**
  — é calculado (ver §10, regra 12).
- `EstadoCancelamentos` (Cancelamentos Totais): `OK` · `SEM_VENDA` ·
  `SEM_MOVIMENTO`; perfil do dano: `POUCOS_GRANDES` · `MUITOS_PEQUENOS` · `MISTO`;
  metade dominante: `ITENS` · `CUPOM` · `EQUILIBRADO`.
- `StatusArquivo`: `ENVIADO` · `SEM_MOVIMENTO` · `PENDENTE`.
- `Severidade`: `CRITICO` · `ATENCAO`; `TendenciaAlerta`: `PIORANDO` ·
  `MELHORANDO` · `ESTAVEL` (painel de atenção).
- Base do indicador: `FIXA` (alvo em R$) · `VENDAS` (% sobre vendas).
- Histórico: `NivelIndicador`: `OK` · `ATENCAO` · `FORA`; `EvolucaoMes`:
  `MELHOROU` · `PIOROU` · `ESTAVEL` (variação abaixo de 1 p.p. é ruído).

## 8. Dados que o módulo toca
- **Escreve:** `RegistroArrecadacao`, `ArrecadacaoSemMovimento`, `MetaIndicador`,
  `FotoMesIndicador` (foto mensal do histórico).
- **Apaga (janela móvel):** `RegistroArrecadacao`, `ArrecadacaoSemMovimento`,
  `VendaDiaria`, `VendaHora` e `FotoMesIndicador` anteriores à janela de
  retenção.
- **Lê:** `RegistroArrecadacao`, `VendaDiaria`, `Colaborador`,
  `ColaboradorIdentificador`, `Ausencia`, e as metas via `MetasService`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `FechamentoService`, `MetasService`,
  `ValidacaoDataService` (opcional), `NotificacoesService`, e o domínio de vínculo
  de `colaboradores` (`montarVinculo`).
- **É usado por:** o app (telas de indicadores/importação) e o
  `IndicadoresResumoService`; exporta `ArrecadacaoService` e
  `IndicadoresInteligenteService`.

## 10. Regras de negócio-chave
1. **O upload substitui o dia** do tipo (reenviar corrige); movimento real
   desfaz o "sem movimento".
2. **Ranking, detalhe, destaques e anomalias consideram só colaboradores
   cadastrados**; o restante vai para "não reconhecidos".
3. **Só operadores concorrem aos destaques** do mês.
4. O **"menos cancelou"** exige operador ativo, com contribuição no mês e
   assiduidade perfeita (sem faltas); é medido em % sobre as vendas da loja.
5. **Anomalias/ofensores** exigem ≥ 3 pessoas e valor ≥ 2× a média da equipe.
6. Indicadores base `VENDAS` são avaliados por % (menor é melhor); base `FIXA`
   por valor/ritmo (maior é melhor). **A base diz QUAL número se compara; o
   `sentido` diz se maior é melhor** — e é pelo `sentido` que `nivelDoMes` e
   `cumpriuMeta` decidem, desde a ADR 0022.

   Antes decidiam pela **base**, e funcionava por coincidência: os cinco
   indicadores daqui têm `FIXA ↔ MAIOR_MELHOR` e `VENDAS ↔ MENOR_MELHOR`,
   perfeitamente correlacionados. O indicador **Sacolas** (venda em R$ por sacola
   recebida, em [`insumos`](insumos.md)) quebrou a coincidência: é `MAIOR_MELHOR`
   com base que não é `FIXA`, então caía no ramo "menor é melhor" e o sistema
   pintaria de **verde justamente o mês de maior desperdício**. A troca **não
   alterou nenhum valor** dos cinco indicadores daqui e alinhou a regra com
   `IndicadoresResumoService.semaforo`, que já decidia pelo sentido — encerrando
   uma divergência entre duas das três cópias da mesma regra.
7. Datas anteriores à Data Inicial do Sistema são rejeitadas na importação e na
   marca de "sem movimento".
8. **Os indicadores não são reiniciados no dia 1º.** O que muda é o mês de
   referência; o histórico dos meses anteriores continua consultável.
9. **Cada mês é julgado pela meta que valia nele** (`MetaMensal` do próprio
   `anoMes`), nunca pela meta de hoje.
10. **Janela móvel de retenção** (`RETENCAO_INDICADORES_MESES`, padrão 24): todo
    dia 1º o mês que fechou é congelado e o que ficou fora da janela é apagado —
    entra um mês novo, sai o mais antigo. É **irreversível**.
11. **Um mês sem movimento não é um mês em zero:** vem marcado como `semDados` e
    não serve de base de comparação (evitaria variações de "+∞%").
12. **`CANCELAMENTOS_TOTAIS` é calculado e fica fora de `TIPOS_ARRECADACAO`.**
    Aquela lista é o contrato do fechamento do dia (`fechamento.service` exige que
    **todos** os tipos dela sejam resolvidos) e a sequência de Importações; um tipo
    novo ali exigiria para sempre um arquivo inexistente e o dia nunca fecharia.
    Ver [ADR 0025](../02-arquitetura/decisoes/0025-cancelamentos-totais-indicador-calculado.md).
13. **O teto do total é próprio, não a soma dos dois tetos** (padrão 0,75%, e não
    0,75 + 0,5 = 1,25%). É deliberadamente mais exigente, então as duas metades
    podem estar verdes com o total em amarelo — e isso fica **escrito na tela**.
14. **Sem venda registrada, Cancelamentos Totais não tem número nem cor**
    (`percentual: null`, `nivel: null`). Os outros cinco devolvem 0% nesse caso e
    pintam de verde um mês em que só falta importar o arquivo de vendas — este não
    repete o erro.
15. **Motivos e autorizadores só existem no cupom.** O arquivo de cancelamento de
    itens não traz essas colunas, e a tela declara isso para não induzir conclusão
    errada.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `arrecadacao.nao-reconhecidos.spec.ts` | Agregado e fila de códigos não reconhecidos | 2 |
| `destaque-menos-cancelou.spec.ts` | "Menos cancelou": exclui falta/inativo, premia por % sobre vendas | 1 |
| `indicadores-inteligente.destaques.spec.ts` | Destaques do mês só para operadores | 3 |
| `historico-indicadores.domain.spec.ts` | Aritmética de "AAAA-MM", semáforo do mês **por sentido** (incluindo a regressão de um `MAIOR_MELHOR` com base não-`FIXA`, que antes era julgado ao contrário), variação e evolução por sentido, sequência | 25 |
| `historico-indicadores.service.spec.ts` | Série (foto vs ao vivo), congelamento idempotente e limites da limpeza | 15 |
| `cancelamentos-totais.domain.spec.ts` | Cancelamentos Totais: percentual e estados (incluindo o mês sem venda, que **não** vira 0% verde), semáforo idêntico ao do Cancelamento de Itens, teto e excedente em R$, composição, fusão dos rankings, concentração, simulação, perfil do dano, motivos e as ramificações do diagnóstico | 31 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `indicadores-inteligente.service.ts` (766 linhas) concentra várias análises
  (destaques, anomalias, painel) e repete o carregamento do vínculo por consulta;
  candidato a cache/extração conforme crescer.
- ⚠️ O parser depende de reconhecer colunas pelo nome do cabeçalho; formatos de
  arquivo muito diferentes podem cair no layout padrão e mapear colunas erradas.
- 🔧 `metaDe` faz fallback silencioso ao padrão quando a tabela `MetaIndicador`
  ainda não migrou (try/catch), o que pode mascarar erros de banco.
- ⛔ A limpeza da janela é **destrutiva e irreversível**: passados os meses de
  retenção, os lançamentos crus daquele mês deixam de existir e só resta a foto
  (totais). Ranking e detalhe por operador **não** sobrevivem à saída da janela.
- ⚠️ `TROCO_SOLIDARIO` não tem meta mensal (usa a meta global de
  `MetaIndicador`), então no histórico todos os meses dele são comparados com a
  meta atual. Migrá-lo para `MetaMensal` deixaria o histórico coerente com os
  outros quatro indicadores.
- 🔧 A foto guarda os totais do mês, não o ranking. Um histórico de ranking por
  pessoa exigiria congelar também o agregado por colaborador.
- ⚠️ **Duas leituras diferentes do "mês sem vendas" convivem no módulo.**
  `CANCELAMENTOS_TOTAIS` devolve `null` (correto); os cinco tipos importados
  seguem devolvendo `0` em `resumo`/`valorComparavel`, o que pinta de verde um mês
  em que só falta o arquivo de vendas. Alinhar os cinco ao novo comportamento é o
  próximo passo natural — foi deixado fora deste conjunto de alterações para não
  mudar valores históricos junto com a entrega do indicador.
- 🔧 `CancelamentosTotaisService.historico` apura mês a mês (uma consulta de
  agregado por mês, mais a meta de cada um). Para 24 meses é aceitável, mas se a
  janela crescer vale trocar por um `groupBy` único sobre a janela inteira.
- ⚠️ O ranking combinado é fundido **por nome canônico** (os dois rankings já
  resolvem o nome pelo cadastro unificado). É correto hoje; se algum dia dois
  colaboradores distintos passarem a ter exatamente o mesmo nome resolvido, a
  fusão os somaria — a alternativa é expor o `colaboradorId` no ranking.
- ⚠️ O diagnóstico de motivos/autorizadores cobre **só a metade do cupom**, e o
  perfil do dano usa os lançamentos dos dois tipos (inclusive de quem não tem
  cadastro), enquanto os ofensores só incluem cadastrados. As três bases diferentes
  estão declaradas na tela, mas é uma assimetria a lembrar em qualquer evolução.
