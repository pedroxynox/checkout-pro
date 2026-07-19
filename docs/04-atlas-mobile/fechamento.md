> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/fechamento/`

# Área: `fechamento`

## 1. Propósito
Tela de **Fechamento** (resumo inteligente do dia, somente leitura): para o dia
selecionado mostra quanto já foi concluído, alertas de consistência e o estado
de cada item — as 5 arrecadações, as Vendas por hora e os 2 checklists.

## 2. Quem usa (perfis)
- **Somente leitura** para supervisor, gerente e gerente desenvolvedor.
- A **carga** dos arquivos em si é feita em Importações; aqui só se consulta.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `FechamentoScreen.tsx` | Resumo do dia (titular, alertas e itens) | 196 |
| `FechamentoScreen.test.tsx` | Testes de render do resumo | 66 |

## 4. Fluxo do usuário
1. **Escolher o dia:** `SeletorData` no topo (padrão: hoje).
2. **Carregar:** busca `fechamentoService.resumo(data)`; estados
   **carregando / erro**.
3. **Titular do dia:** "Tudo pronto!" (quando `tudoPronto`) ou "X de N
   concluídos" com barra de progresso e a lista do que ainda falta.
4. **Alertas inteligentes:** cada alerta de consistência vira um `Aviso`
   (ex.: vendas entraram mas faltam devoluções).
5. **Itens do dia:** um por linha, com ícone e um selo de status
   (Enviado/Feito, Sem movimento, Não enviado, Pendente).

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Resumo do dia | `fechamentoService.resumo(data?)` | `GET /fechamento/resumo` (query `data` opcional; padrão hoje) |

Módulo do backend relacionado: [`fechamento`](../03-atlas-backend/fechamento.md)
(consolida [`arrecadacao`](../03-atlas-backend/arrecadacao.md),
[`vendas`](../03-atlas-backend/vendas.md) e
[`checklist`](../03-atlas-backend/checklist.md)).

## 6. Estado local e regras de UI
- Estado local: apenas `data` (dia de referência); o resumo vem do
  `useRequisicao`.
- **Progresso:** largura da barra = `round(concluidos / totalItens * 100)%`.
- **Selo por status:** `OK` → "Feito" (checklist) ou "Enviado" (demais);
  `SEM_MOVIMENTO` → "Sem movimento"; `NAO_ENVIADO` → "Não enviado"; senão
  "Pendente" — cada um com sua cor.
- **Ícone do item:** por categoria (`VENDAS`→dinheiro, `CHECKLIST`→prancheta) e,
  nas arrecadações, o ícone definido em `ARRECADACAO` (fallback genérico).
- Tela **read-only**: não há ações de escrita.

## 7. Lógica pura / utilidades
- `iconeItem(item)`: escolhe o ícone conforme categoria/id.
- `seloDoItem(item)`: texto/cor/fundo do selo conforme o status.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `SeletorData`, `Aviso`, `Selo`, `Carregando`,
  `MensagemErro`, utilidade `hojeISO` e rótulos `ARRECADACAO` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `FechamentoScreen.test.tsx` | Titular "X de N concluídos", itens, "Faltam:" e alerta de consistência; "Tudo pronto!" quando o dia está completo | 2 |

## 10. Riscos, dívidas e pendências
- 🔧 A composição do resumo (itens, pendentes, alertas) mora no backend; a tela
  só apresenta — mudanças de regra dependem do módulo `fechamento`.
- ⚠️ O progresso divide por `totalItens`; um `totalItens = 0` inesperado do
  backend geraria `NaN%` na barra (defensivamente, o backend sempre envia > 0).
