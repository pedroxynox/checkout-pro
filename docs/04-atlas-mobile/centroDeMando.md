> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `mobile/src/screens/centroDeMando/`

# Área: `centroDeMando`

## 1. Propósito
O **"pulso do dia"** da Home: um resumo inteligente que aparece no topo da tela
inicial com a **saúde do negócio** (nota 0–100), as **vendas**, a **cobertura**
e os **pontos de atenção** priorizados por perfil — além de alimentar os
**selos de pendência** por módulo no menu.

> **Nota:** o cartão narrativo **"Resumo de hoje"** (briefing por regras) foi
> **removido** do topo. Os demais blocos (saúde do negócio, vendas, cobertura e
> pontos de atenção) permanecem.

## 2. Quem usa (perfis)
- Perfis de gestão e operação com pessoas (gerente, gerente desenvolvedor,
  supervisor, fiscal) veem o resumo completo (mesma nota de saúde para todos).
- **Importador** vê apenas a carga de arquivos do dia.
- Cada bloco/atalho respeita `podeAcessar(funcionalidade)`.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ResumoDoDia.tsx` | Bloco "Hoje" no topo da Home (saúde, vendas, cobertura, atenção) | 748 |
| `dadosDoDia.ts` | Fonte ÚNICA e compartilhada dos sinais do dia: busca deduplicada (cache com TTL), carga progressiva por campo (`useDadosDaHome`) e contagem de pendências (`calcularPendencias`) | 475 |
| `usePulsoDoDia.ts` | Hook que conta pendências por módulo (selos do menu), lendo de `dadosDoDia` | 111 |

> Observação: esta área não registra uma rota própria. `ResumoDoDia` é embutido
> na Home e `usePulsoDoDia` é consumido pela navegação (`MainTabs`) e pela aba
> Tarefas. Todos leem da mesma fonte compartilhada (`dadosDoDia`), então os
> pedidos são deduplicados entre eles.

## 4. Fluxo do usuário
1. Ao abrir a Home, o hook `useDadosDaHome` (em `dadosDoDia`) busca, **de forma
   defensiva** e só o que o perfil precisa, os sinais do dia (arrecadação,
   vendas, insumos, indicadores, checklist, operadores). As buscas são
   **compartilhadas e deduplicadas** (cache com TTL): a Home, a barra de abas e
   a aba Tarefas reaproveitam os mesmos pedidos, sem chamadas repetidas.
2. A carga é **progressiva**: cada campo tem seu próprio estado de carregando,
   então cada cartão do `ResumoDoDia` aparece assim que os SEUS dados chegam, em
   vez de esperar todos. Enquanto isso, mostra **esqueletos** (`Skeleton`) no
   lugar — a tela nunca fica em branco.
3. Calcula por **regras (sem IA)** a nota de saúde (0–100) com penalidades por
   categoria e teto por categoria, e o "porquê" da nota.
4. Mostra vendas do dia de referência (hoje se o arquivo já foi carregado;
   senão, ontem), a cobertura do turno e os 3 pontos de atenção prioritários,
   cada um com um botão **"Resolver"** que navega para o módulo.
5. As contagens de pendências por módulo (via `calcularPendencias`) alimentam os
   **selos** do menu, a aba Tarefas e o selo da barra de abas.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
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
- `temasDoPerfil(perfil)`: define quais temas (checklist, insumos, indicadores,
  faltas, cobertura, carga, vendas, meta) o perfil enxerga; o **importador** só
  vê `carga`.
- A carga de arquivos é verificada no **dia anterior** (os arquivos do dia só
  chegam à noite), evitando falso alarme durante o dia.
- Vendas: usa "hoje" se o arquivo do dia já foi carregado; senão, "ontem".
- Nota de saúde por regras, com penalidades limitadas por categoria (teto), para
  não "despencar" a 0 por acúmulo de pequenas pendências.
- `useDadosDaHome`/`usePulsoDoDia` só chamam os serviços que o perfil precisa ou
  que o usuário pode acessar (evita 403); as pendências só contam módulos com
  acesso.
- **Fonte única compartilhada** (`dadosDoDia`): `buscaCompartilhada` reaproveita
  a mesma Promise por chave (TTL curto), eliminando pedidos duplicados entre a
  Home, a barra de abas e a aba Tarefas.
- **Vendas via caminho rápido**: a Home usa `painelResumo` (leve), sem varrer os
  ~90 dias dos perfis típicos do painel completo.

## 7. Lógica pura / utilidades
- Em `dadosDoDia`: `temasDoPerfil`, `ontemISO`, `calcularPendencias` (contagem
  por módulo), `buscaCompartilhada` (dedup com TTL) e os buscadores por chave.
- Em `ResumoDoDia`: `classificar` (faixa da nota → cor/rótulo), `MedidorCircular`
  (anel SVG) e o cálculo do "ritmo da meta".
- `QUEDA_VENDAS_RELEVANTE` (10%): limite para considerar queda de vendas.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useAuth` (`podeAcessar`, `perfil`), `Cartao`, `Skeleton` (placeholder de
  carregamento), ícones `lucide-react-native`, `react-native-svg`,
  `formatarMoeda`, `hojeISO`, `ROTULO_TIPO_ARRECADACAO` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🔧 `ResumoDoDia.tsx` ainda é grande (748 linhas), concentrando regras de
  negócio, cálculo da nota e UI; forte candidato a extrair regras puras
  (testáveis) e subcomponentes. A busca de dados já saiu para `dadosDoDia`.
- ✅ A busca de dados de `ResumoDoDia` e `usePulsoDoDia` foi **unificada** em
  `dadosDoDia` (fonte única, deduplicada), eliminando os pedidos repetidos.
- 📝 Sem testes automatizados apesar do peso das regras da nota de saúde e da
  priorização — bom alvo para testes de lógica pura (`calcularPendencias` e a
  nota já estão em funções isoláveis).
