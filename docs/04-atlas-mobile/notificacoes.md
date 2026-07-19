> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/notificacoes/`

# Área: `notificacoes`

## 1. Propósito
**Central de Notificações** in-app: lista as notificações do usuário como
cartões compactos, agrupados por dia (Hoje/Ontem/data), com filtros (todas/não
lidas/lidas e por módulo) e um botão de ação que leva **direto** ao módulo
correspondente.

## 2. Quem usa (perfis)
- Qualquer perfil com a funcionalidade `NOTIFICACOES` (recebe avisos e vê o
  centro de notificações). A aba é montada em `MainTabs`.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `NotificacoesScreen.tsx` | Lista/central de notificações | 496 |
| `classificarNotificacao.ts` | Classifica a notificação por palavras‑chave (rota/módulo/ícone/ação) | 170 |
| `NotificacoesScreen.test.tsx` | Testes de agrupamento, título e navegação | 64 |

## 4. Fluxo do usuário
1. Ao focar a tela, zera o badge da aba e recarrega o histórico do backend.
2. Cada notificação é **enriquecida**: categoria (via `classificarNotificacao`),
   título sem emoji (`limparTitulo`) e estado "não lida" (persistido no
   aparelho).
3. O usuário filtra por leitura (todas/não lidas/lidas) e por módulo (chips), e
   pode "Marcar todas como lidas".
4. Tocar no **botão de ação** do cartão marca como lida e navega ao módulo; o
   cartão em si nunca navega.
5. Novas notificações em tempo real (via `NotificacoesContext`) recarregam a
   lista com a tela aberta.
Estados: carregando, erro (com "tentar novamente"), vazio (sem notificações) e
vazio por filtro ("Nada por aqui").

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Histórico | `notificacoesService.historico()` | `GET /notificacoes/historico` |

- O estado **lida/não lida** é guardado **apenas no aparelho** (`utils/notificacoesLidas`),
  porque o backend não expõe esse endpoint.
- Registro/remoção de push token existe no serviço, mas é usado fora desta tela.

Módulo do backend relacionado: [`notificacoes`](../03-atlas-backend/notificacoes.md).
As rotas de destino dos botões apontam para diversos módulos (Insumos,
Checklist, Vendas, Colaboradores, etc.).

## 6. Estado local e regras de UI
- Guarda: conjunto de IDs lidos, filtro de leitura, filtro de módulo e se o
  painel de chips está visível.
- Agrupamento por **dia-calendário de Brasília** (UTC−3); rótulos Hoje/Ontem/dd
  /mm/aaaa.
- A ordem vem do backend (mais novo → mais antigo) e é preservada no agrupamento.
- Cor de destaque por módulo (`COR_MODULO`) para o círculo do ícone e o botão.

## 7. Lógica pura / utilidades
- `classificarNotificacao(titulo, mensagem)`: infere módulo/rota/ícone/ação por
  palavras‑chave normalizadas (sem acento), com regra de ordem (primeira que
  casa vence) e fallback "Geral".
- `limparTitulo(titulo)`: remove emojis/símbolos do início do título.
- `diaChave`, `rotuloDia`, `corDe`: agrupamento e apresentação.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useNotificacoes` (`NotificacoesContext`), `Segmentado`, `Tela`, `Carregando`,
  `EstadoVazio`, `MensagemErro`, `formatarHora`, `isoParaDataBR`,
  `carregarLidas`/`salvarLidas` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `NotificacoesScreen.test.tsx` | Título sem emoji + agrupamento em "Hoje"; botão navega direto ao módulo; filtro "Lidas" vazio quando nada foi lido | 3 |

## 10. Riscos, dívidas e pendências
- ⚠️ O estado "lida" é **local ao aparelho**: trocar de dispositivo ou limpar o
  storage reinicia a leitura. Depende de o backend um dia expor esse endpoint.
- 🔧 A classificação por palavras‑chave é frágil a mudanças de texto das
  notificações; `classificarNotificacao` é puro e testável, mas convém cobrir
  mais casos e manter as regras em sincronia com os títulos gerados no backend.
