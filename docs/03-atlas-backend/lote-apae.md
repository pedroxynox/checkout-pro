> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/lote-apae/`

# Módulo: `lote-apae`

## 1. Propósito
Ciclo de doações/arrecadação da APAE (Req 2.6): controla o lote de sacolas
recebido, a venda (queda de saldo) que reverte em arrecadação, o histórico de
lotes encerrados e um painel inteligente (meta do mês, velocidade de venda,
previsão de fim do lote e tendência).

## 2. Responsabilidades e limites
- **Faz:** registro do lote inicial; atualização do saldo com cálculo de
  vendida/percentual; encerramento automático ao zerar o saldo; reinício do
  ciclo preservando o histórico; histórico de lotes encerrados; configuração
  *singleton* (preço da sacola + meta mensal); painel de análises (arrecadação
  do mês/anterior, variação, total histórico, velocidade, previsão, tendência);
  registro de movimentos de venda; notificações (meta atingida, lote acabando).
- **Não faz** (fica em outro módulo): a arrecadação geral por operador (fica em
  `arrecadacao`); o envio efetivo das notificações (fica em `notificacoes`);
  a limpeza de lotes/movimentos no reinício do sistema (fica em
  [`reset-operacional`](reset-operacional.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `lote-apae.controller.ts` | Rotas HTTP do ciclo de sacolas APAE | 120 |
| `lote-apae.service.ts` | Regras de aplicação: lote, saldo, painel, config | 488 |
| `lote-apae.domain.ts` | Regras puras: vendida, percentual, reinício, valor | 165 |
| `lote-apae.errors.ts` | Erros de domínio (saldo/quantidade inválidos) | 46 |
| `lote-apae.module.ts` | Ligações (DI) do módulo | 21 |
| `dto/lote-apae.dto.ts` | Validação de entrada das rotas | 43 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `lote-apae`](../05-referencia-dados/api-http.md#lote-apae). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /lote-apae` | `LOTE_APAE_GERENCIAR` | Registra um novo lote inicial (apenas gerente). |
| `PUT /lote-apae/:id/saldo` | `LOTE_APAE` | Atualiza o saldo restante; ao zerar, encerra o lote. |
| `POST /lote-apae/:id/reiniciar` | `LOTE_APAE_GERENCIAR` | Encerra o lote atual e abre um novo (apenas gerente). |
| `GET /lote-apae/historico` | `LOTE_APAE` | Histórico de lotes encerrados. |
| `DELETE /lote-apae/historico` | `LOTE_APAE_GERENCIAR` | Remove os lotes encerrados (não afeta o ativo). |
| `GET /lote-apae/ativo` | `LOTE_APAE` | Lote em andamento (ABERTO) ou `null`. |
| `GET /lote-apae/config` | `LOTE_APAE` | Preço da sacola + meta mensal (leitura). |
| `PUT /lote-apae/config` | `LOTE_APAE_GERENCIAR` | Atualiza preço e/ou meta mensal (apenas gerente). |
| `GET /lote-apae/painel` | `LOTE_APAE` | Painel inteligente (arrecadação, meta, tendência, previsão). |

> A classe `LoteApaeController` exige `LOTE_APAE` por padrão (fiscal: ver e
> atualizar saldo); registrar, reiniciar, limpar histórico e editar a config
> sobrepõem para `LOTE_APAE_GERENCIAR` (exclusiva do gerente).

## 5. Serviços e funções

### `LoteApaeService`

#### `registrarLoteInicial(quantidadeInicial)`
Cria um lote `ABERTO` com saldo igual à quantidade e nada vendido (delega o
estado a `criarLote`). Rejeita quantidade inválida com
`QuantidadeInicialInvalidaError`.

#### `atualizarSaldo(loteId, saldoAtual, responsavelId?)`
- **Efeitos:** valida a atualização (`atualizacaoSaldoValida`: novo saldo entre 0
  e o saldo anterior); recalcula a quantidade vendida; numa **transação**,
  atualiza o lote, registra `MovimentoLoteApae` quando houve venda e, se o saldo
  chegar a 0, encerra o lote automaticamente (status `ENCERRADO` + data). Após,
  dispara (best-effort) o aviso de meta atingida / lote acabando.
- **Erros:** `NotFoundException`, `SaldoInvalidoError` (saldo maior que o
  anterior — lote inalterado).

#### `reiniciarLote(loteId, novaQuantidadeInicial)`
Numa transação, encerra o lote atual (congelando a vendida e a data) e abre um
novo `ABERTO`. Rejeita quantidade inválida.

#### `loteAtivo()` · `historicoLotes()` · `limparHistorico()`
Lote em andamento (mais recente se houver mais de um); histórico de encerrados
(por data de encerramento desc); e remoção dos encerrados (não afeta o ativo).

#### `percentualVendido(lote)` · `valorArrecadado(lote)`
Delegam às funções puras `calcularPercentualVendido` e `calcularValorArrecadado`.

#### `obterConfig()` · `precoSacola()` · `definirConfig(dados, atualizadoPor?)`
Config *singleton* (`ConfigApae`, id fixo `'apae'`): cria com padrões
(preço 0,49 / meta 500) na primeira leitura; `definirConfig` faz `upsert`
ignorando valores negativos/ausentes.

#### `painel()`
Consolida: preço/meta, arrecadação do mês e do mês anterior (com variação %),
total histórico, sacolas vendidas no mês, velocidade média/dia (janela de 14
dias), previsão de fim do lote ativo, progresso da meta e tendência dos últimos
30 dias.

#### Funções privadas
- `arrecadadoNoMes(data)` → soma das vendidas do mês × preço.
- `avisarMetaELote(...)` → notifica ao cruzar a meta e quando o lote cai a ≤ 10%.

## 6. Lógica de domínio (funções puras)
- `calcularQuantidadeVendida(inicial, saldoAtual)` = `inicial - saldoAtual`.
- `calcularPercentualVendido(inicial, vendida)` → em `[0, 1]` (0 se inicial ≤ 0).
- `atualizacaoSaldoValida(anterior, atual)` → `0 ≤ atual ≤ anterior`.
- `calcularValorArrecadado(vendida)` = `vendida × PRECO_SACOLA_APAE` (0,49);
  quantidades não-finitas/negativas → 0.
- `criarLote(inicial, dataInicio)` → estado `ABERTO` (lança se inválida).
- `atualizarSaldo(lote, novoSaldo)` → novo estado imutável com vendida
  recalculada (lança `SaldoInvalidoError`).
- `reiniciarLote(lote, dataEncerramento, novaInicial, dataInicioNovo)` → congela
  o encerrado e cria o novo.

## 7. Estados e enums
- `StatusLote`: `ABERTO` → `ENCERRADO`. Transições: `ABERTO → ENCERRADO` ao zerar
  o saldo (venda total) ou ao reiniciar o ciclo.
- Constante de domínio: `PRECO_SACOLA_APAE = 0.49` (preço padrão; o preço efetivo
  do painel vem da `ConfigApae`).

## 8. Dados que o módulo toca
- **Escreve:** `LoteApae`, `MovimentoLoteApae`, `ConfigApae`.
- **Lê:** `LoteApae`, `MovimentoLoteApae`, `ConfigApae`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (opcional — avisos de
  meta/lote acabando), `common/numeros` (`arredondar`).
- **É usado por:** o app (tela de Sacolas APAE, painel e histórico).

## 10. Regras de negócio-chave
1. **Saldo só diminui**: atualizar com saldo maior que o anterior é rejeitado
   (o lote permanece inalterado).
2. **Vendida = inicial − saldo**; percentual sempre em `[0, 1]`.
3. **Zerar o saldo encerra o lote** automaticamente (lote vendido no histórico).
4. **Reiniciar preserva o histórico** (inicial, vendida e datas do encerrado).
5. **Config é singleton** (`id = 'apae'`), com padrões preço 0,49 / meta 500.
6. **Notificações são best-effort**: nunca quebram a atualização de saldo.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `lote-apae.service.spec.ts` | Lote inicial, atualização, encerramento ao zerar, reinício, limpeza | 6 |
| `lote-apae.controller.spec.ts` | Delegação das rotas (registrar, saldo inválido, ativo, limpar) | 4 |
| `lote-apae.properties.spec.ts` | Propriedades: vendida/percentual, saldo inválido, reinício, valor | 4 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `lote-apae.service.ts` (488 linhas) acumula o ciclo do lote, a config e o
  painel de análises; o painel é candidato a um serviço próprio.
- ⚠️ Existe a constante `PRECO_SACOLA_APAE` (0,49) no domínio **e** o preço
  configurável em `ConfigApae`; `valorArrecadado`/`calcularValorArrecadado` usam
  a constante, enquanto o painel usa a config — pode divergir se a config mudar.
- ⚠️ `loteAtivo` tolera mais de um lote `ABERTO` (retorna o mais recente), o que
  mascara um estado inconsistente em vez de impedi-lo.
