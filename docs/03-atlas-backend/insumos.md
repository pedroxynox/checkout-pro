> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/insumos/`

# Módulo: `insumos`

## 1. Propósito
Almoxarifado da operação: controla o estoque de insumos (sacolas por fardo,
bobinas por PDV, panos e outros) com saldo em tempo real, alerta de estoque
baixo, painel proativo (previsão de ruptura, nível e sugestão de reposição) e
pedidos recorrentes inteligentes — tudo por **aviso**, sem criar dados sem a
aprovação do gestor.

## 2. Responsabilidades e limites
- **Faz:** cadastro de insumos com limite mínimo; retirada de fardo pelo código
  de barras; consumo de bobinas/insumos/embalagens; entrada de estoque (controle
  de requisição); saldo em tempo real (soma dos movimentos); alerta de estoque
  baixo; análise de utilização vs. vendas; painel proativo (predição por dia da
  semana, nível, sugestão); pedidos recorrentes (sugestões semanais/quinzenais);
  crons de **alerta** (estoque crítico, ruptura iminente, relatório semanal).
- **Não faz** (fica em outro módulo): aprovação de pedidos de fiscal para gestor
  (fica em [`requisicoes`](requisicoes.md)); envio efetivo das notificações
  (fica em `notificacoes`); limpeza geral de movimentos no reinício do sistema
  (fica em [`reset-operacional`](reset-operacional.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `insumos.controller.ts` | Rotas HTTP do almoxarifado | 212 |
| `insumos.service.ts` | Regras de aplicação: saldo, movimentos, análise, painel | 506 |
| `insumos.domain.ts` | Regras puras: saldo, fardo, estoque baixo, proativo | 351 |
| `insumos.errors.ts` | Erros de domínio (fardo, quantidade, estoque insuficiente) | 65 |
| `insumos.module.ts` | Ligações (DI) do módulo | 24 |
| `insumos-proativo.service.ts` | Crons de alerta (crítico, ruptura, relatório) | 106 |
| `pedidos-recorrentes.controller.ts` | Rotas HTTP dos pedidos recorrentes | 80 |
| `pedidos-recorrentes.service.ts` | Sugestões semanais/quinzenais + confirmação | 280 |
| `dto/insumos.dto.ts` | Validação de entrada das rotas | 104 |
| `dto/pedidos-recorrentes.dto.ts` | Validação de entrada dos pedidos recorrentes | 52 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `insumos`](../05-referencia-dados/api-http.md#insumos). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /insumos` | `INSUMOS` | Lista insumos ativos com o resumo de estoque (saldo, consumo/entrada da semana, semanas restantes). |
| `GET /insumos/proativo` | `INSUMOS` | Painel proativo: nível, dias até ruptura e sugestão de reposição. |
| `POST /insumos/consumo-embalagem` | `INSUMOS` | Registra consumo em embalagens inteiras (converte para unidade base). |
| `GET /insumos/:id/analise` | `INSUMOS` | Consumo por dia (últimos ~30 dias) vs. venda diária + resumo semana/mês. |
| `GET /insumos/entradas` | `INSUMOS` | Entradas recentes de estoque (controle de requisição). |
| `POST /insumos/:id/entrada` | `INSUMOS_GERENCIAR` | Registra uma entrada (delta positivo) no estoque. |
| `POST /insumos` | `INSUMOS` | Cadastra um insumo com limite mínimo (e saldo inicial opcional). |
| `GET /insumos/:id/saldo` | `INSUMOS` | Saldo em tempo real (soma dos deltas dos movimentos). |
| `POST /insumos/fardos/retirada` | `INSUMOS` | Retira um fardo de sacolas pelo código de barras. |
| `POST /insumos/bobinas/consumo` | `INSUMOS` | Registra o consumo de bobinas de um PDV. |
| `POST /insumos/consumo` | `INSUMOS` | Registra o consumo genérico de um insumo. |
| `GET /insumos/:id/estoque-baixo` | `INSUMOS` | Indica se o saldo está no/abaixo do limite mínimo. |
| `GET /insumos/:id/historico` | `INSUMOS` | Histórico de movimentos (mais recente primeiro). |
| `DELETE /insumos/movimentos` | `ADMIN_DADOS` | Zera o estoque de **todos** os insumos (remove todos os movimentos). |
| `DELETE /insumos/:id/movimentos` | `ADMIN_DADOS` | Zera o estoque de **um** insumo (remove só os movimentos dele). |
| `GET /insumos/pedidos-recorrentes/sugestoes` | `INSUMOS` | Sugestões pendentes (card "Pedido da semana"). |
| `GET /insumos/pedidos-recorrentes/proximo-quinzenal` | `INSUMOS` | Dias que faltam para o próximo pedido quinzenal (sacolas). |
| `GET /insumos/pedidos-recorrentes` | `INSUMOS` | Lista os pedidos recorrentes configurados. |
| `POST /insumos/pedidos-recorrentes/confirmar` | `INSUMOS_GERENCIAR` | Confirma sugestões (dá entrada no estoque). |
| `POST /insumos/pedidos-recorrentes/ignorar` | `INSUMOS_GERENCIAR` | Descarta sugestões sem dar entrada. |
| `POST /insumos/pedidos-recorrentes/configurar` | `INSUMOS_GERENCIAR` | Cria/atualiza um pedido recorrente. |

> A classe `InsumosController` e a `PedidosRecorrentesController` exigem
> `INSUMOS` por padrão; as rotas de escrita/gestão sobrepõem para
> `INSUMOS_GERENCIAR` e as administrativas para `ADMIN_DADOS`.

## 5. Serviços e funções

### `InsumosService`

#### `listarInsumos()`
- **Devolve:** insumos ativos com `ResumoEstoque` (saldo, estoque baixo, consumo
  e entrada da semana, semanas restantes).
- **Efeitos:** busca os movimentos de todos os insumos em **uma** consulta
  (`movimentosPorInsumo`, evita N+1) e delega o cálculo a `resumoEstoque`.

#### `listarProativo()` · `insumosParaRepor()`
Versão evoluída do painel: por insumo, calcula `resumoProativo` (predição de
ruptura por dia da semana, nível `CRITICO/ATENCAO/OK` e sugestão de reposição).
`insumosParaRepor` filtra os que precisam repor (`CRITICO`/`ATENCAO` com
sugestão > 0), alimentando o cron de alerta.

#### `cadastrarInsumo(nome, categoria, limiteMinimo, saldoInicial?)`
Cria o insumo com `saldo` 0 e, se `saldoInicial > 0`, registra um movimento de
entrada — mantendo o saldo igual à soma dos movimentos.

#### `saldo(insumoId)`
Soma agregada (`_sum.delta`) de todos os movimentos do insumo — o saldo em tempo
real.

#### `registrarRetiradaFardo(entrada)`
- **Efeitos:** resolve o fardo pelo código de barras; se não existir, lança
  `FardoNaoReconhecidoError` (saldo inalterado); garante saldo suficiente e grava
  um movimento negativo pela quantidade de sacolas do fardo.
- **Erros:** `FardoNaoReconhecidoError`, `EstoqueInsuficienteError`.

#### `registrarConsumoBobina(insumoId, pdvId, quantidade)` · `registrarConsumoInsumo(insumoId, quantidade)` · `registrarConsumoEmbalagem(insumoId, embalagens, ...)`
Validam a quantidade (inteiro > 0) e o saldo antes de gravar a saída; nunca
deixam o saldo negativo. `registrarConsumoEmbalagem` converte embalagens →
unidade base pelo `fatorEmbalagem`. **Nenhuma reposição automática** é criada.

#### `registrarEntrada(insumoId, quantidade, origem, responsavelId?, data?, responsavelNome?, requisitanteNome?)`
Grava um movimento positivo (entrada) com origem (ex.: `ENTRADA`, `REQUISICAO`,
`PEDIDO_RECORRENTE`), guardando quem requisitou e quem aprovou. Rejeita
quantidade inválida com `QuantidadeInvalidaError`.

#### `verificarEstoqueBaixo(insumoId)`
Verdadeiro se o saldo ≤ limite mínimo (delega a `estoqueBaixo`).

#### `analiseInsumo(insumoId, dias = 30)`
Cruza o consumo por dia (série alinhada dia a dia) com a venda diária, mais o
consumo da semana e do mês corrente (por `aggregate`).

#### `historicoConsumo(insumoId)` · `listarEntradas(limite = 50)`
Histórico de movimentos de um insumo; e as entradas recentes de todos os insumos
(com nome/unidade/embalagem) para o "controle de requisição".

#### `zerarEstoque()` / `zerarEstoqueInsumo(insumoId)`
Removem todos os movimentos (globais ou de um insumo) — o saldo volta a 0.
Operação administrativa; retorna a contagem removida.

### `InsumosProativoService` (crons — só alertas)
- `autoReposicao()` (07:00): avisa os gestores dos insumos em nível `CRITICO`.
- `alertaRupturaIminente()` (12:00): avisa insumos com ruptura em ≤ 3 dias.
- `relatorioSemanal()` (segunda 08:00): resumo de consumo/entrada/saldo.

> Estes crons **nunca criam** requisições/estoque; apenas notificam. Fuso
> `America/Sao_Paulo`.

### `PedidosRecorrentesService`
- `gerarSugestoes()` (cron domingo 20:00): gera `SugestaoPedido` por lote
  (idempotente por lote), com ajuste inteligente pelo saldo/consumo; quinzenais
  só a cada `frequenciaDias`.
- `listarPendentes()` / `proximoPedidoQuinzenal()` / `listarPedidosRecorrentes()`:
  consultas para o app.
- `confirmarSugestoes(ids, ajustes?, confirmadoPor?)`: para cada sugestão
  pendente, dá **entrada no estoque** (via `InsumosService.registrarEntrada`,
  origem `PEDIDO_RECORRENTE`) e marca como `CONFIRMADA`.
- `ignorarSugestoes(ids)`: marca as pendentes como `IGNORADA`.
- `configurar(insumoId, quantidade, frequenciaDias, diaSugestao?)`: cria ou
  atualiza o pedido recorrente do insumo.

## 6. Lógica de domínio (funções puras)
- `calcularSaldo(saldoInicial, movimentos)` → soma dos deltas.
- `resolverFardo(fardos, codigoBarras)` → fardo ou `null`.
- `deltaRetiradaFardo(qtd)` / `deltaConsumo(qtd)` → delta negativo; lançam
  `QuantidadeInvalidaError` para quantidade não inteira ou ≤ 0.
- `resolverDeltaFardo(fardos, codigoBarras)` → resolve + delta; lança
  `FardoNaoReconhecidoError` se não achar.
- `estoqueBaixo(saldo, limiteMinimo)` → `saldo <= limiteMinimo`.
- `saldoSuficiente` / `garantirSaldoSuficiente` → não deixam o saldo negativo
  (consumir exatamente o saldo, deixando 0, é permitido).
- `resumoEstoque(...)` → saldo, estoque baixo, consumo/entrada de 7 dias,
  semanas restantes (`saldo ÷ consumo semanal`, `null` sem consumo).
- Sistema proativo: `consumoPorDiaSemana` (média por dia, últimos 28 dias),
  `predicaoRuptura` (dias até saldo 0 pela média por dia da semana),
  `quantidadeReposicao` (cobrir N semanas, arredondado em embalagens),
  `nivelEstoque` (`CRITICO`/`ATENCAO`/`OK`) e `resumoProativo` (junta tudo).

## 7. Estados e enums
- `CategoriaInsumo`: `SACOLA` · `BOBINA` · `PANO` · `OUTRO`.
- `NivelEstoque` (derivado): `CRITICO` (saldo ≤ limite) · `ATENCAO`
  (saldo ≤ 2× limite) · `OK`.
- `StatusRequisicao`/pedidos: `SugestaoPedido` tem `PENDENTE` → `CONFIRMADA` ou
  `IGNORADA`.

## 8. Dados que o módulo toca
- **Escreve:** `Insumo` (cadastro e `saldo`), `MovimentoEstoque`,
  `PedidoRecorrente`, `SugestaoPedido`.
- **Lê:** `Insumo`, `MovimentoEstoque`, `Fardo`, `VendaDiaria` (análise vs.
  vendas).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (crons de alerta e do
  pedido da semana), funções de `common/datas` e `common/numeros`.
- **É usado por:** [`requisicoes`](requisicoes.md) (dá entrada no estoque ao
  aprovar) e o app (painel do almoxarifado, análise, pedidos recorrentes).

## 10. Regras de negócio-chave
1. **Saldo = soma dos movimentos** (fonte única, em tempo real).
2. **Estoque nunca fica negativo**: consumo/retirada > saldo é rejeitado;
   consumir exatamente o saldo (deixando 0) é permitido.
3. **Fardo desconhecido não altera o saldo** (rejeita com 404 de domínio).
4. **Alerta de estoque baixo** ⇔ `saldo ≤ limite mínimo`.
5. **Nada entra no estoque sem aprovação do gestor**: crons só **avisam**; a
   entrada vem de `registrarEntrada`, requisição aprovada ou sugestão confirmada.
6. **Geração de sugestões é idempotente por lote** (não duplica no mesmo dia).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `insumos.service.spec.ts` | Cadastro, fardo, consumo, estoque insuficiente, alerta, N+1 | 12 |
| `insumos.controller.spec.ts` | Delegação das rotas (fardo, cadastro, zerar) | 5 |
| `insumos.properties.spec.ts` | Propriedades: saldo, fardo, alerta, saldo não-negativo | 5 |
| `insumos.resumo.spec.ts` | `resumoEstoque` (consumo/entrada de 7 dias, fronteira) | 2 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `insumos.service.ts` (506 linhas) concentra saldo, movimentos, análise e
  painel proativo; candidato a extrair um serviço de análise/painel conforme
  crescer.
- ⚠️ Comentários e nomes com termos em espanhol (`predicción`) no domínio
  proativo — apenas ruído de comentário; padronizar para pt-BR.
- ⚠️ A predição de ruptura (`predicaoRuptura`) tem limite de 365 dias; insumos de
  baixíssimo consumo saem com previsão saturada nesse teto.
