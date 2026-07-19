> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/mensagens/`

# Área: `mensagens`

## 1. Propósito
Aba **"Mensagens"** — o chat com a **Cluby**, a assistente de IA do app. O
usuário conversa em texto (histórico das últimas 24h, efeito de digitação,
limpar conversa) e recebe respostas — inclusive procedimentos passo a passo.

## 2. Quem usa (perfis)
- Disponível como aba para os perfis que têm o chat da Cluby liberado (a aba é
  montada em `MainTabs`). O isolamento da conversa é por login.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `MensagensScreen.tsx` | Chat da Cluby (`ClubyChat`) | 525 |

## 4. Fluxo do usuário
1. Ao montar, carrega em paralelo o **status** do assistente (se está
   configurado no servidor) e a **conversa** das últimas 24h.
2. Se veio um **briefing** de outra tela (via `AssistenteContext`), a pergunta é
   enviada automaticamente após carregar a conversa.
3. O usuário digita e envia; a mensagem entra na lista, aparece "Cluby está
   digitando…" e a resposta chega com **efeito de digitação** (exceto quando é
   um procedimento, renderizado por `ProcedimentoView`).
4. "Limpar conversa" pede confirmação e apaga o histórico (local + servidor).
Estados: carregando (spinner), vazio (mensagem de boas-vindas) e aviso quando o
assistente ainda não está configurado; erros de envio viram uma bolha de texto.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Status do assistente | `assistenteService.status()` | `GET /assistente/status` |
| Carregar conversa | `assistenteService.conversa()` | `GET /assistente/conversa` |
| Enviar mensagem | `assistenteService.enviar(texto)` | `POST /assistente/mensagem` |
| Limpar conversa | `assistenteService.limpar()` | `DELETE /assistente/conversa` |

Módulo do backend relacionado: [`assistente`](../03-atlas-backend/assistente.md).

## 6. Estado local e regras de UI
- Guarda em memória: lista de mensagens, texto da entrada, estados
  `carregando`/`enviando`, `configurado` e a animação de digitação.
- IDs locais (`idLocal`) para mensagens do usuário antes da resposta.
- Envio bloqueado enquanto `enviando` ou com texto vazio.
- A resposta só anima se **não** for procedimento; procedimentos usam
  `ProcedimentoView`.
- Briefing de outra tela guardado em `ref` até a conversa carregar, para não
  sobrescrever histórico.
- `ClubyChat` aceita `onFechar` (usado quando aberto como janela flutuante,
  exibindo um "X").

## 7. Lógica pura / utilidades
- `idLocal()`: gera identificadores locais únicos para mensagens otimistas.
- `animarResposta()`: controla o efeito de digitação por `setInterval`.

## 8. Componentes e hooks compartilhados usados
- `useAssistente` (`AssistenteContext`) para briefings vindos de outras telas.
- `MarkdownTexto`, `ProcedimentoView`, `confirmar`, `ApiError` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🔧 `MensagensScreen.tsx` concentra chat, animação e integração num só arquivo
  (525 linhas); candidato a extrair a lógica de animação/estado para um hook.
- ⚠️ O status "configurado = false" depende de o servidor ter a chave da IA;
  sem ela, o usuário só vê o aviso e as tentativas de envio falham.
- 📝 O histórico é efêmero (24h no backend) — comportamento intencional, mas vale
  documentar para o usuário final.
