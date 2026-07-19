> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/centroDeMando/`

# Área: `centroDeMando`

## 1. Propósito
O **"pulso do dia"** da Home: um resumo inteligente que aparece no topo da tela
inicial com a **saúde do negócio** (nota 0–100), o **briefing do dia**, as
**vendas** e os **pontos de atenção** priorizados por perfil — além de alimentar
os **selos de pendência** por módulo no menu.

## 2. Quem usa (perfis)
- Perfis de gestão e operação com pessoas (gerente, gerente desenvolvedor,
  supervisor, fiscal) veem o resumo completo (mesma nota de saúde para todos).
- **Importador** vê apenas a carga de arquivos do dia.
- Cada bloco/atalho respeita `podeAcessar(funcionalidade)`.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ResumoDoDia.tsx` | Bloco "Hoje" no topo da Home (saúde, vendas, atenção) | 892 |
| `usePulsoDoDia.ts` | Hook que conta pendências por módulo (selos do menu) | 155 |

> Observação: esta área não registra uma rota própria. `ResumoDoDia` é embutido
> na Home e `usePulsoDoDia` é consumido pela navegação (`MainTabs`).

## 4. Fluxo do usuário
1. Ao abrir a Home, `ResumoDoDia` busca, **de forma defensiva** e só o que o
   perfil precisa, os sinais do dia (arrecadação, vendas, insumos, indicadores,
   checklist, operadores) em paralelo — cada chamada tem `catch`.
2. Calcula por **regras (sem IA)** a nota de saúde (0–100) com penalidades por
   categoria e teto por categoria, o "porquê" da nota e um briefing narrativo.
3. Mostra vendas do dia de referência (hoje se o arquivo já foi carregado;
   senão, ontem), a cobertura do turno e os 3 pontos de atenção prioritários,
   cada um com um botão **"Resolver"** que navega para o módulo.
4. Em paralelo, `usePulsoDoDia` conta as pendências por módulo para exibir os
   **selos** e ordenar os módulos no menu.
Enquanto não há dados, `ResumoDoDia` não renderiza (retorna `null`).

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Status de arrecadação | `arrecadacaoService.status(data)` | `GET /arrecadacao/status` |
| Painel de atenção | `arrecadacaoService.painelAtencao(data)` | `GET /arrecadacao/painel-atencao` |
| Status de vendas | `vendasService.status(data)` | `GET /vendas/status` |
| Painel de vendas | `vendasService.painel(data)` | `GET /vendas/painel` |
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
- `usePulsoDoDia` só chama os serviços que o usuário pode acessar (evita 403).

## 7. Lógica pura / utilidades
- `ontemISO`, `classificar` (faixa da nota → cor/rótulo), `MedidorCircular`
  (anel SVG), `temasDoPerfil` e o cálculo do "ritmo da meta".
- `QUEDA_VENDAS_RELEVANTE` (10%): limite para considerar queda de vendas.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useAuth` (`podeAcessar`, `perfil`), `Cartao`, ícones `lucide-react-native`,
  `react-native-svg`, `formatarMoeda`, `hojeISO`, `ROTULO_TIPO_ARRECADACAO` —
  ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🔧 `ResumoDoDia.tsx` é muito grande (892 linhas), concentrando busca, regras de
  negócio, cálculo da nota e UI; forte candidato a extrair regras puras
  (testáveis) e subcomponentes.
- ⚠️ `ResumoDoDia` e `usePulsoDoDia` fazem buscas semelhantes de forma
  independente; o próprio código sugere uma futura unificação da busca.
- 📝 Sem testes automatizados apesar do peso das regras da nota de saúde e da
  priorização — bom alvo para testes de lógica pura.
