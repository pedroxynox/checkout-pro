> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `mobile/src/screens/centroDeMando/`

# Área: `centroDeMando`

## 1. Propósito
Fonte ÚNICA e compartilhada dos **sinais do dia** que viram as **contagens de
pendência por módulo** (os "selos" com número nos acessos da Home, na aba
Tarefas e na barra de abas). Calcula tudo por **regras (sem IA)** e de forma
**defensiva** (um erro num sinal nunca derruba os demais).

> **Nota:** o antigo bloco "Resumo do Dia" (briefing/nota de saúde no topo da
> Home) foi **removido**. Com ele saíram o componente `ResumoDoDia.tsx` e o hook
> `useDadosDaHome`, além das buscas exclusivas do briefing (arrecadação/vendas
> de ontem e painel de hoje). Esta área ficou só com a contagem de pendências.

## 2. Quem usa (perfis)
- Qualquer perfil vê os selos dos módulos aos quais tem acesso; cada sinal só é
  buscado se o usuário `podeAcessar(funcionalidade)` (evita chamadas/403).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `dadosDoDia.ts` | Fonte compartilhada: busca deduplicada (cache com TTL), buscadores por chave e contagem de pendências (`calcularPendencias`) | 219 |
| `usePulsoDoDia.ts` | Hook que conta as pendências por módulo (selos), lendo de `dadosDoDia` | 111 |

> Esta área não registra rota própria. `usePulsoDoDia` é consumido pela Home
> (selos dos acessos), pela navegação (`MainTabs`) e pela aba Tarefas — todos
> leem da mesma fonte (`dadosDoDia`), então os pedidos são deduplicados.

## 4. Fluxo
1. Ao abrir a Home (e na barra de abas / aba Tarefas), `usePulsoDoDia` busca —
   **de forma defensiva** e só o que o perfil pode acessar — os sinais do dia
   (arrecadação, vendas, insumos, indicadores, checklist, operadores).
2. As buscas são **compartilhadas e deduplicadas** (cache com TTL): Home, barra
   de abas e aba Tarefas reaproveitam os mesmos pedidos, sem chamadas repetidas.
3. `calcularPendencias` conta, por **regras**, quantas pendências cada módulo
   tem hoje; o resultado alimenta os **selos** e o total da aba Tarefas.

## 5. Dados e integração com o backend
| Ação | Chamada | Endpoint |
|---|---|---|
| Status de arrecadação | `arrecadacaoService.status(data)` | `GET /arrecadacao/status` |
| Painel de atenção | `arrecadacaoService.painelAtencao(data)` | `GET /arrecadacao/painel-atencao` |
| Status de vendas | `vendasService.status(data)` | `GET /vendas/status` |
| Resumo do painel de vendas | `vendasService.painelResumo(data)` | `GET /vendas/painel-resumo` |
| Insumos proativos | `insumosService.listarProativo()` | `GET /insumos/proativo` |
| Status de checklist | `checklistService.status(tipo, data)` | `GET /checklist/status` |
| Operadores do dia | `operadoresService.dia(data)` | `GET /operadores/dia` |

Módulos do backend relacionados:
[`arrecadacao`](../03-atlas-backend/arrecadacao.md),
[`vendas`](../03-atlas-backend/vendas.md),
[`insumos`](../03-atlas-backend/insumos.md),
[`checklist`](../03-atlas-backend/checklist.md) e
[`operadores`](../03-atlas-backend/operadores.md).

## 6. Estado local e regras de UI
- `usePulsoDoDia` só chama os serviços que o usuário pode acessar (evita 403); as
  pendências só contam módulos com acesso.
- **Fonte única compartilhada** (`dadosDoDia`): `buscaCompartilhada` reaproveita
  a mesma Promise por chave (TTL curto), eliminando pedidos duplicados entre a
  Home, a barra de abas e a aba Tarefas.
- **Vendas via caminho rápido**: usa `painelResumo` (leve), sem varrer os ~90
  dias dos perfis típicos do painel completo.
- Carga de arrecadação/vendas é verificada com as regras de cada módulo (ex.:
  checklist só conta como pendente dentro da janela de horário).

## 7. Lógica pura / utilidades
- Em `dadosDoDia`: `ontemISO`, `calcularPendencias` (contagem por módulo),
  `buscaCompartilhada` (dedup com TTL), `limparCacheDadosDoDia` e os buscadores
  por chave (`buscarArrecStatus`, `buscarVendaStatus`, `buscarPainelResumo`,
  `buscarInsumos`, `buscarAtencao`, `buscarChecklist`, `buscarOperadoresDia`).
- `QUEDA_VENDAS_RELEVANTE` (10%): limite para considerar queda de vendas.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `hojeISO` e os serviços de API (`arrecadacaoService`, `vendasService`,
  `insumosService`, `checklistService`, `operadoresService`) — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área). A contagem de pendências
(`calcularPendencias`) é uma função pura e isolável — bom alvo para testes.

## 10. Riscos, dívidas e pendências
- ✅ O "Resumo do Dia" foi removido da Home; a área ficou enxuta (só as
  contagens de pendência) e com menos chamadas de rede.
- 📝 `calcularPendencias` é pura e sem testes ainda — bom alvo para testes de
  lógica.
- 🔧 `limparCacheDadosDoDia` continua exportado como utilitário de cache, hoje
  sem chamador (a Home não recarrega o pulso manualmente).
