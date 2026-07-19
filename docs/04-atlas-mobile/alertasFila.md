> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/alertasFila/`

# Área: `alertasFila`

## 1. Propósito
Seção **"Alertas de Fila"** — avisos sobre filas/caixas que precisam de atenção.
Hoje é apenas um **espaço reservado (em construção)**: mostra uma tela de
placeholder e ainda não implementa nenhuma funcionalidade.

## 2. Quem usa (perfis)
- Área controlada pela funcionalidade `ALERTAS_FILA`, mas marcada como `emBreve`
  em `navigation/areas.ts` — por isso fica **oculta do menu** (Home) para todos
  os perfis, inclusive o gerente desenvolvedor.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `AlertasFilaScreen.tsx` | Placeholder "em desenvolvimento" | 15 |

## 4. Fluxo do usuário
Como a área está oculta no menu, o usuário normalmente não chega até ela. Se a
rota for aberta, a tela apenas renderiza o componente `EmDesenvolvimento` com
ícone, título ("Alertas de Fila") e uma mensagem informando que a seção será
desenvolvida em breve. Não há carregamento, ação nem estados de erro/vazio.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| — (nenhuma) | — | — |

Não há integração com o backend. Não existe módulo de backend correspondente.

## 6. Estado local e regras de UI
- Nenhum estado local; a tela é puramente estática.
- Regra de visibilidade: a marca `emBreve: true` em `navigation/areas.ts` remove
  a área do menu. Basta remover a marca para voltar a exibi-la.

## 7. Lógica pura / utilidades
Não se aplica.

## 8. Componentes e hooks compartilhados usados
- `EmDesenvolvimento` (placeholder padrão de áreas em construção) — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🚧 **Área incompleta/oculta.** É apenas um placeholder (`EmDesenvolvimento`),
  sem backend e escondida do menu (`emBreve: true`). A rota só é registrada em
  `AppNavigator` quando `podeAcessar('ALERTAS_FILA')`.
- 📝 Ao concluir a funcionalidade, remover `emBreve` em `navigation/areas.ts` e
  implementar a tela real + serviço.
