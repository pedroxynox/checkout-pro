> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/insumos/`

# Área: `insumos`

## 1. Propósito
Almoxarifado do setor: acompanhar o **estoque** de insumos (sacolas, bobinas,
panos, álcool), registrar **saídas** e **entradas**, confirmar o **pedido da
semana** (sugestões automáticas) e gerir **requisições** (solicitar → aprovar/negar).

## 2. Quem usa (perfis)
- **Todo perfil com acesso a Insumos** (`INSUMOS`): vê o painel, registra saída
  rápida e solicita requisições.
- **Gestão** (`INSUMOS_GERENCIAR`): registra entrada de mercadoria, confirma o
  pedido da semana e aprova/nega requisições.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `InsumosScreen.tsx` | Painel do almoxarifado (estoque, ações rápidas, gestão) | 939 |
| `InsumoDetalheScreen.tsx` | Detalhe de um insumo (saldo, uso×vendas, movimentos) | 399 |
| `RequisicoesScreen.tsx` | Solicitar/aprovar/negar requisições | 381 |
| `InsumosScreen.test.tsx` | Teste de componente do painel | 121 |

## 4. Fluxo do usuário
1. **Painel** (`InsumosScreen`): abre e carrega em paralelo o estoque proativo,
   a contagem de requisições pendentes, as sugestões pendentes e o próximo
   pedido quinzenal. Se o painel proativo falhar, cai no fallback `listar()`.
2. **Pedido da semana:** quando há sugestões, um cartão listado no topo permite
   **Confirmar** (dá entrada no estoque) ou **Ignorar**.
3. **Estoque:** cada insumo vira um cartão com borda/semáforo por nível
   (`OK` / `ATENCAO` / `CRITICO`), dias até acabar, consumo/entrada por semana e
   sugestão de reposição. Tocar abre o detalhe.
4. **Ações rápidas:** botão por insumo abre um card flutuante (modal) para
   registrar saída, com stepper de quantidade limitado ao saldo disponível.
5. **Gestão:** atalho para **Requisições** (com badge de pendentes) e, para
   gestores, o formulário de **registrar entrada** (por embalagem).
6. **Detalhe** (`InsumoDetalheScreen`): saldo atual na unidade da embalagem,
   gráfico "uso vs. vendas" (14 dias), histórico de movimentos por dia (30 dias)
   e resumo de consumo (semana/mês).
7. **Requisições** (`RequisicoesScreen`): solicita insumo + quantidade +
   observação; o gestor aprova (soma ao estoque) ou nega.
Cada tela trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Painel proativo | `insumosService.listarProativo()` | `GET /insumos/proativo` |
| Lista simples (fallback/requisição) | `insumosService.listar()` | `GET /insumos` |
| Registrar saída | `insumosService.consumirEmbalagem(id, qtd)` | `POST /insumos/consumo-embalagem` |
| Registrar entrada | `insumosService.registrarEntrada(id, base, 'ENTRADA')` | `POST /insumos/:id/entrada` |
| Sugestões pendentes | `insumosService.sugestoesPendentes()` | `GET /insumos/pedidos-recorrentes/sugestoes` |
| Próximo quinzenal | `insumosService.proximoQuinzenal()` | `GET /insumos/pedidos-recorrentes/proximo-quinzenal` |
| Confirmar pedido | `insumosService.confirmarSugestoes(ids)` | `POST /insumos/pedidos-recorrentes/confirmar` |
| Ignorar pedido | `insumosService.ignorarSugestoes(ids)` | `POST /insumos/pedidos-recorrentes/ignorar` |
| Histórico | `insumosService.historico(id)` | `GET /insumos/:id/historico` |
| Análise (uso×vendas) | `insumosService.analise(id)` | `GET /insumos/:id/analise` |
| Requisições pendentes (badge) | `requisicoesService.pendentes()` | `GET /requisicoes/pendentes/contagem` |
| Listar requisições | `requisicoesService.listar()` | `GET /requisicoes` |
| Criar requisição | `requisicoesService.criar(id, qtd, obs)` | `POST /requisicoes` |
| Aprovar | `requisicoesService.aprovar(id)` | `POST /requisicoes/:id/aprovar` |
| Negar | `requisicoesService.negar(id)` | `POST /requisicoes/:id/negar` |

Módulos do backend relacionados: [`insumos`](../03-atlas-backend/insumos.md) e
[`requisicoes`](../03-atlas-backend/requisicoes.md).

## 6. Estado local e regras de UI
- O painel guarda em memória a lista de insumos, contagem de pendentes,
  sugestões, dias até o próximo quinzenal e os flags de carregamento/erro.
- **Saída:** o card flutuante começa em 1 e o stepper fica entre 1 e
  `maxSaida = floor(saldo / fatorEmbalagem)`, para não deixar o estoque negativo.
  Se não há embalagem inteira em estoque, o botão de saída fica desabilitado.
- **Entrada (gestores):** a quantidade é informada em **embalagens** e
  convertida para a unidade base (`embalagens * fatorEmbalagem`) antes de enviar;
  valida número inteiro positivo.
- **Detalhe:** saldo e movimentos são exibidos na **unidade do produto**
  (embalagem: fardo, caixa, galão…), com a unidade base apenas como referência;
  movimentos ficam agrupados por dia e limitados aos últimos 30 dias.
- A primeira entrada na tela usa `carregar()`; retornos de foco usam `buscar()`
  silencioso (`useFocusEffect`).

## 7. Lógica pura / utilidades
- `corNivel` / `fundoNivel` / `iconeNivel` / `rotuloNivel`: semáforo por nível.
- `iconeCategoria`: ícone conforme a categoria do insumo.
- `pluralEmbalagem`: plural pt-BR da embalagem (galão→galões, caixa→caixas).
- `capitalizar`: primeira letra maiúscula.
- No detalhe: `agruparPorDia`, `movimentosRecentes`, `formatarEmbalagens`,
  `seloNivel`, `primeiroNome`.
- Nas requisições: `comUnidade`, `comEmbalagem` (formatam quantidade/embalagem).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) no detalhe — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Botao`, `CampoTexto`, `Carregando`, `MensagemErro`,
  `EstadoVazio`, `Selo`, `GraficoBarrasVerticais`, `ApiError`, `confirmar`,
  `notificar`, `formatarNumero`/`formatarData` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `InsumosScreen.test.tsx` | Exibição dos insumos com saldo e selo de nível; estado vazio | 2 |

## 10. Riscos, dívidas e pendências
- 🔧 `InsumosScreen.tsx` é grande (>900 linhas); candidato a quebrar em
  componentes menores (cartão de insumo, ações rápidas, modal de saída).
- ⚠️ O painel proativo tem fallback para `listar()`; se o endpoint proativo
  falhar, métricas como "dias até acabar" e sugestões podem não aparecer.
