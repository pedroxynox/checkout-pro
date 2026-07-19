> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/quebra/`

# Área: `quebra`

## 1. Propósito
Seção **"Indicador de Quebra"** — acompanhamento de quebras/perdas da operação.
Hoje é apenas um **espaço reservado (em construção)**: mostra uma tela de
placeholder e ainda não implementa nenhuma funcionalidade.

## 2. Quem usa (perfis)
- Área controlada pela funcionalidade `INDICADOR_QUEBRA`, mas marcada como
  `emBreve` em `navigation/areas.ts` — por isso fica **oculta do menu** (Home)
  para todos os perfis.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `IndicadorQuebraScreen.tsx` | Placeholder "em desenvolvimento" | 15 |

## 4. Fluxo do usuário
A área está oculta no menu, então normalmente não é acessada. Se a rota for
aberta, a tela apenas renderiza o componente `EmDesenvolvimento` (ícone de
tendência de queda, título "Indicador de Quebra" e mensagem de "em breve"). Não
há carregamento, ação nem estados de erro/vazio.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| — (nenhuma) | — | — |

Não há integração com o backend. Não existe módulo de backend correspondente.

## 6. Estado local e regras de UI
- Nenhum estado local; a tela é puramente estática.
- Regra de visibilidade: a marca `emBreve: true` em `navigation/areas.ts`
  esconde a área do menu. Remover a marca volta a exibi-la.

## 7. Lógica pura / utilidades
Não se aplica.

## 8. Componentes e hooks compartilhados usados
- `EmDesenvolvimento` (placeholder padrão de áreas em construção) — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🚧 **Área incompleta/oculta.** Apenas um placeholder (`EmDesenvolvimento`),
  sem backend e escondida do menu (`emBreve: true`). A rota só é registrada em
  `AppNavigator` quando `podeAcessar('INDICADOR_QUEBRA')`. O rótulo da
  funcionalidade em `permissoes/rotulos.ts` já a marca como "Em construção".
- 📝 Ao concluir, remover `emBreve` em `navigation/areas.ts` e implementar a
  tela real + serviço de quebras/perdas.
