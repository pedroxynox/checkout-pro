> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/requisicoes/`

# Módulo: `requisicoes`

## 1. Propósito
Fluxo de requisição de insumos entre a operação e a gestão: o fiscal solicita um
insumo, e o gerente ou supervisor aprova (gerando entrada no estoque) ou nega,
com notificações em cada etapa.

## 2. Responsabilidades e limites
- **Faz:** criação de requisição (em embalagens inteiras); listagem com filtro
  por status; contagem de pendentes (badge); aprovação (que dá **entrada no
  estoque** convertendo embalagens → unidade base) e negação (com motivo);
  notificação dos gestores na criação e do solicitante na decisão; limpeza
  administrativa de todas as requisições.
- **Não faz** (fica em outro módulo): o estoque/saldo em si e o registro de
  entrada (fica em [`insumos`](insumos.md)); o envio das notificações (fica em
  `notificacoes`); as sugestões automáticas de compra (pedidos recorrentes, em
  [`insumos`](insumos.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `requisicoes.controller.ts` | Rotas HTTP das requisições | 88 |
| `requisicoes.service.ts` | Regras de aplicação: criar, listar, decidir | 240 |
| `requisicoes.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/requisicoes.dto.ts` | Validação de entrada (criar, negar) | 25 |

> Não há `*.domain.ts` nem `*.errors.ts` próprios: as validações usam as
> exceções padrão do Nest (`BadRequestException`, `NotFoundException`).

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `requisicoes`](../05-referencia-dados/api-http.md#requisicoes). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /requisicoes` | `INSUMOS` | Cria uma requisição PENDENTE (fiscal) e avisa os gestores. |
| `GET /requisicoes` | `INSUMOS` | Lista requisições (opcionalmente por `?status=`), mais recentes primeiro. |
| `GET /requisicoes/pendentes/contagem` | `INSUMOS` | Quantidade de requisições pendentes (badge). |
| `DELETE /requisicoes` | `ADMIN_DADOS` | Remove **todas** as requisições (administrativo). |
| `POST /requisicoes/:id/aprovar` | `INSUMOS_GERENCIAR` | Aprova: dá entrada no estoque e avisa o solicitante. |
| `POST /requisicoes/:id/negar` | `INSUMOS_GERENCIAR` | Nega (motivo opcional) e avisa o solicitante. |

> A classe `RequisicoesController` exige `INSUMOS` por padrão (criar/listar,
> liberado ao fiscal); aprovar/negar sobrepõem para `INSUMOS_GERENCIAR` e a
> limpeza para `ADMIN_DADOS`.

## 5. Serviços e funções

### `RequisicoesService`

#### `criar(insumoId, quantidade, observacao?, solicitanteId?)`
- **Recebe:** insumo, quantidade em **embalagens inteiras** e observação.
- **Devolve:** `RequisicaoResumo` (com nome do insumo, unidade, embalagem).
- **Efeitos:** valida quantidade (inteiro > 0) e existência do insumo; resolve o
  nome do solicitante; cria a requisição `PENDENTE`; notifica os gestores
  (`INSUMOS_GERENCIAR`).
- **Erros:** `BadRequestException` (quantidade inválida), `NotFoundException`
  (insumo inexistente).

#### `listar(status?)` · `contarPendentes()`
Lista requisições (filtro opcional por `StatusRequisicao`), mais recentes
primeiro; e a contagem de pendentes para o badge.

#### `aprovar(id, decisorId?)`
- **Efeitos:** exige requisição `PENDENTE`; converte embalagens → unidade base
  pelo `fatorEmbalagem` do insumo; **registra a entrada no estoque** (via
  `InsumosService.registrarEntrada`, origem `REQUISICAO`, guardando quem
  requisitou e quem aprovou); marca `APROVADA`; notifica o solicitante.
- **Erros:** `NotFoundException` (não existe), `BadRequestException` (já
  decidida).

#### `negar(id, motivo?, decisorId?)`
Exige requisição `PENDENTE`; marca `NEGADA` com o motivo; notifica o
solicitante. Mesmos erros de `aprovar`.

#### `limparTodas()`
Remove todas as requisições (operação administrativa); retorna a contagem.

#### Funções privadas
- `mapResumo(r)` → converte a entidade + insumo em `RequisicaoResumo`.
- `nomeDe(usuarioId?)` → resolve nome/login do usuário (ou `null`).
- `pluralEmbalagem(embalagem, qtd)` → plural pt-BR ("caixa/caixas", "galão/galões")
  para a mensagem da notificação.

## 6. Lógica de domínio (funções puras)
Não há um `*.domain.ts` dedicado. A única regra pura local é a auxiliar
`pluralEmbalagem` (pluralização pt-BR da embalagem conforme a quantidade),
usada apenas na formatação das notificações.

## 7. Estados e enums
- `StatusRequisicao`: `PENDENTE` → `APROVADA` **ou** `NEGADA`. A transição só
  ocorre uma vez (requisição já decidida é rejeitada).

## 8. Dados que o módulo toca
- **Escreve:** `Requisicao`. Indiretamente `MovimentoEstoque` (entrada ao
  aprovar, via `InsumosService`).
- **Lê:** `Requisicao`, `Insumo`, `Usuario` (nome do solicitante/decisor).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `InsumosService` (entrada no estoque ao
  aprovar), `NotificacoesService` (avisos a gestores/solicitante).
- **É usado por:** o app (tela de requisições do fiscal e a fila de decisão do
  gestor).

## 10. Regras de negócio-chave
1. **Quantidade em embalagens inteiras** (inteiro > 0); a conversão para unidade
   base acontece só na aprovação (`quantidade × fatorEmbalagem`).
2. **Aprovar gera entrada no estoque** com origem `REQUISICAO`, preservando quem
   requisitou e quem aprovou no histórico de movimentos.
3. **Requisição só é decidida uma vez**: aprovar/negar exigem status `PENDENTE`.
4. **Notifica nas duas pontas**: gestores na criação; solicitante na decisão.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `requisicoes.service.spec.ts` | Criação+notificação, aprovação (entrada no estoque), bloqueio de já decidida | 3 |
| `requisicoes.controller.spec.ts` | Delegação das rotas (criar, aprovar, negar, limpar) | 4 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Sem verificação de estoque na aprovação da origem**: a aprovação apenas
  **adiciona** ao estoque (entrada), então não há risco de saldo negativo aqui;
  mas também não há checagem de duplicidade se o gestor aprovar duas requisições
  iguais em sequência.
- 🔧 Validações usam exceções genéricas do Nest em vez de erros de domínio
  tipados (padrão adotado em `insumos`/`lote-apae`); padronizar se o módulo
  crescer.
