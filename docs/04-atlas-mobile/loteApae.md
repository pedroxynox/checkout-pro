> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/loteApae/`

# Área: `loteApae`

## 1. Propósito
Gestão das **sacolas APAE**: acompanhar o lote em andamento (vendidas × em
estoque), registrar novos lotes, atualizar o saldo restante, ver o painel
consolidado (arrecadação do mês, meta, ritmo de venda, previsão de fim e
tendência) e o histórico de lotes vendidos.

## 2. Quem usa (perfis)
- **Todo perfil com acesso** (`LOTE_APAE`): visualiza o painel e **atualiza o
  saldo** restante do lote ativo.
- **Gestão** (`LOTE_APAE_GERENCIAR`): adiciona lote, **substitui** o lote ativo
  e **limpa** o histórico. (O preço da sacola e a meta mensal são configurados
  em Centro de Controle ▸ Metas.)
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `LoteApaeScreen.tsx` | Painel único do lote APAE (ativo, painel, histórico) | 641 |

## 4. Fluxo do usuário
1. **Carregamento:** a tela busca o lote ativo (`ativo()`), o histórico e o
   painel consolidado; o preço da sacola vem do painel (com fallback `0,49`).
2. **Banner e painel:** total histórico arrecadado, cartão de **meta do mês**
   (progresso e comparativo com o mês anterior) e cartão de **ritmo de vendas**
   (média por dia, vendidas no mês, previsão de fim do lote e sparkline de 30 dias).
3. **Lote atual:** rosca de vendidas × em estoque, destaques (estoque e
   arrecadado no lote), barra de percentual vendido e dados do lote. Ao
   **atualizar o saldo**, o backend calcula quantas foram vendidas desde a
   última contagem; informar **0** encerra o lote e o salva no histórico.
4. **Gestão:** sem lote ativo, o gestor **adiciona** um lote (entra em estoque);
   com lote ativo, pode **substituir** por um novo (o anterior vai ao histórico).
5. **Histórico:** gráfico de arrecadação por lote e a lista dos lotes vendidos;
   o gestor pode **limpar o histórico** (confirmação obrigatória).
Cada bloco trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Lote ativo | `loteApaeService.ativo()` | `GET /lote-apae/ativo` |
| Painel consolidado | `loteApaeService.painel()` | `GET /lote-apae/painel` |
| Histórico | `loteApaeService.historico()` | `GET /lote-apae/historico` |
| Adicionar lote | `loteApaeService.registrarLote(qtd)` | `POST /lote-apae` |
| Atualizar saldo | `loteApaeService.atualizarSaldo(id, saldo)` | `PUT /lote-apae/:id/saldo` |
| Substituir lote | `loteApaeService.reiniciar(id, qtd)` | `POST /lote-apae/:id/reiniciar` |
| Limpar histórico | `loteApaeService.limparHistorico()` | `DELETE /lote-apae/historico` |

Módulo do backend relacionado: [`lote-apae`](../03-atlas-backend/lote-apae.md).

## 6. Estado local e regras de UI
- A tela guarda o lote ativo, os campos de quantidade inicial, novo saldo e
  quantidade de reinício, além do flag `ocupado` durante as gravações.
- **Validações:** quantidade inicial, saldo e reinício precisam ser inteiros
  ≥ 0; caso contrário, exibe aviso e não envia.
- **Encerramento automático:** quando `atualizarSaldo` retorna status
  `ENCERRADO`, o lote ativo é limpo da tela e é mostrada a mensagem de conclusão
  com o valor arrecadado.
- **Preço efetivo:** vem de `painel.precoSacola`; se o painel ainda não carregou,
  usa `PRECO_FALLBACK = 0,49`.
- A cor da meta muda por faixa: verde (≥100%), amarelo (≥60%), vermelho (abaixo).

## 7. Lógica pura / utilidades
- `percentualVendido(lote)`: percentual vendido do lote, limitado a [0, 100].
- `valorArrecadado(qtdVendida, preco)`: valor em R$ arrecadado.
- `BarraProgresso`: barra horizontal 0–100%.
- `Sparkline`: mini-gráfico de barras finas da tendência dos últimos dias.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (histórico e painel) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Botao`, `CampoTexto`, `Aviso`, `Carregando`,
  `MensagemErro`, `EstadoVazio`, `LinhaInfo`, `GraficoPizza`,
  `GraficoBarrasVerticais`, `ApiError`, `confirmar`, `notificar`,
  `formatarMoeda`/`formatarNumero`/`formatarData`/`formatarPercentual` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (sem arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- ⚠️ O preço da sacola usa fallback `0,49` até o painel carregar; valores
  exibidos antes do painel podem divergir do preço configurado.
- 🔧 Tela concentra painel, lote ativo, gestão e histórico em um único arquivo
  (>600 linhas); candidata a modularizar por seção.
