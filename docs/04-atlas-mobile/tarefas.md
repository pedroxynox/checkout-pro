> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/tarefas/`

# Área: `tarefas`

## 1. Propósito
Aba **"Tarefas"**: lista as **pendências do dia** (o que precisa de atenção
agora) agregadas por módulo; cada item leva direto ao módulo correspondente.
Sem pendências, mostra "Tudo em ordem".

## 2. Quem usa (perfis)
- **Qualquer usuário autenticado**, mas o conteúdo respeita as permissões: só
  são buscadas as pendências das funcionalidades que o usuário pode acessar
  (evita chamadas desnecessárias/403).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `TarefasScreen.tsx` | Lista de pendências por módulo (ou estado vazio) | 178 |

> A lógica de contagem é compartilhada com a Home: vem do hook
> `usePulsoDoDia` (em `screens/centroDeMando/`), reaproveitado aqui.

## 4. Fluxo do usuário
1. **Carregar:** `usePulsoDoDia(perfil, podeAcessar)` busca, em paralelo e de
   forma defensiva, os sinais de cada módulo permitido.
2. **Montar lista:** filtra os módulos conhecidos (`ITENS_INFO`), monta
   `{ rota, count }` e ordena por contagem (maior primeiro).
3. **Vazio:** sem pendências, exibe "Tudo em ordem 🎉".
4. **Agir:** cada linha mostra ícone, rótulo, quantidade e um badge; tocar
   navega para a rota do módulo.

## 5. Dados e integração com o backend
A tela não chama serviços diretamente: delega ao hook `usePulsoDoDia`, que
consulta vários módulos (só os permitidos) e devolve `pendenciasPorModulo`.

| Pendência (módulo → rota) | Chamada no hook | Endpoint | Backend |
|---|---|---|---|
| Importações (arrecadação pendente) | `arrecadacaoService.status(hoje)` | `GET /arrecadacao/status` | [`arrecadacao`](../03-atlas-backend/arrecadacao.md) |
| Importações (vendas por hora) | `vendasService.status(hoje)` | `GET /vendas/status` | [`vendas`](../03-atlas-backend/vendas.md) |
| Insumos (críticos) | `insumosService.listarProativo()` | `GET /insumos/proativo` | [`insumos`](../03-atlas-backend/insumos.md) |
| Checklist (não feito na janela) | `checklistService.status('ABERTURA'/'FECHAMENTO', hoje)` | `GET /checklist/:tipo/status` | [`checklist`](../03-atlas-backend/checklist.md) |
| Indicadores (fora da meta) | `arrecadacaoService.painelAtencao(hoje)` | `GET /arrecadacao/painel-atencao` | [`arrecadacao`](../03-atlas-backend/arrecadacao.md) |
| Escalas (faltas do dia) | `operadoresService.dia(hoje)` | `GET /quadro-operadores/dia` | [`operadores`](../03-atlas-backend/operadores.md) |
| Painel de Vendas (queda/projeção) | `vendasService.painel(ontem)` | `GET /vendas/painel` | [`vendas`](../03-atlas-backend/vendas.md) |

## 6. Estado local e regras de UI
- A tela não guarda estado próprio; deriva a lista de `pendenciasPorModulo`.
- **Mapa `ITENS_INFO`:** rótulo + ícone por rota (Importações, Insumos,
  Checklist, Indicadores, Escalas=Operadores, Painel de Vendas); rotas fora do
  mapa são ignoradas.
- **Ordenação:** módulos com mais pendências aparecem primeiro.
- Cor do ícone vem de `coresModulos` (fallback: cor primária).
- Estado vazio exibido quando não há nenhum item.

## 7. Lógica pura / utilidades
- A regra de negócio das contagens fica no hook `usePulsoDoDia` (defensiva, por
  regras, sem IA): arrecadações pendentes + vendas não enviadas → Importações;
  insumos `CRITICO` → Insumos; checklist `PENDENTE` dentro da janela de horário
  → Checklist; indicadores críticos/em atenção → Indicadores; faltas → Escalas;
  queda relevante (≥ 10%) e/ou projeção abaixo da meta → Painel de Vendas.
- A tela em si só ordena e apresenta.

## 8. Componentes e hooks compartilhados usados
- `usePulsoDoDia` (contagens por módulo) e `useAuth` (`perfil`, `podeAcessar`) —
  ver [Hooks e utilidades](hooks-e-utilidades.md).
- Ícones `lucide-react-native`, `useNavigation` e tema (`coresModulos`, `cores`,
  `raio`, `sombra`, `tipografia`) — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (não há arquivo de teste nesta área). A lógica de contagem é
exercitada indiretamente pelos testes da Home que cobrem `usePulsoDoDia`.

## 10. Riscos, dívidas e pendências
- 🔧 A tela depende de um hook focado em contagens; o próprio hook prevê uma
  futura unificação com o painel `ResumoDoDia` para compartilhar uma única
  busca.
- ⚠️ Cada chamada do hook tem `catch` individual: se um serviço falhar, o
  módulo apenas não recebe contagem (a pendência pode não aparecer, sem erro
  visível na tela).
