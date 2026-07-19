> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/assistente/`

# Módulo: `assistente`

## 1. Propósito
Assistente de IA da loja — a **"Cluby"** — um chat flutuante que ajuda a equipe
em gestão de supermercado (frente de caixa, estoque, indicadores, CDC, escala,
vendas), respondendo com base no conhecimento do modelo Google Gemini e em
contexto real da operação (escala, indicadores, APAE e vendas).

## 2. Responsabilidades e limites
- **Faz:** mantém a conversa de cada usuário isolada e **efêmera (24h)**; monta
  o histórico e chama o `GeminiClient` para gerar respostas; injeta no prompt o
  contexto real da loja (escala dos fiscais, indicadores de arrecadação, Sacolas
  APAE e vendas), lido direto via Prisma; persiste pergunta e resposta; limpa
  diariamente (cron) as mensagens com mais de 24h.
- **Não faz:** não é a fonte dos dados de escala/indicadores/vendas (apenas
  lê o que os módulos [`fiscais`](fiscais.md), [`arrecadacao`](arrecadacao.md),
  [`vendas`](vendas.md) e `lote-apae` gravam); não decide permissões (herda o
  `JwtAuthGuard` global); não faz entrega push/notificações
  (fica em [`notificacoes`](notificacoes.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `assistente.controller.ts` | Rotas HTTP do chat (status, conversa, mensagem, limpar) | 75 |
| `assistente.service.ts` | Regras de aplicação: conversa efêmera, contexto e chamada ao modelo | 663 |
| `assistente.prompt.ts` | Monta as instruções de sistema (papel da Cluby) e de procedimento | 159 |
| `gemini.client.ts` | Cliente da API Google Gemini (concorrência, timeout, reintento) | 259 |
| `procedimentos.service.ts` | Passo a passo ilustrado das normativas (hoje **desativado**) | 98 |
| `procedimentos/procedimentos.data.ts` | Catálogo de procedimentos gerado dos PDFs | 1159 |
| `procedimentos/procedimentos.types.ts` | Tipos dos procedimentos guiados (blocos texto/imagem) | 33 |
| `assistente.module.ts` | Ligações (DI) do módulo | 19 |
| `dto/assistente.dto.ts` | Validação da mensagem enviada | 11 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `assistente`](../05-referencia-dados/api-http.md#assistente).

O controller **não** usa `@Funcionalidade`, portanto as rotas ficam disponíveis
a **qualquer usuário autenticado** (herdam apenas o `JwtAuthGuard` global). Cada
usuário só acessa a **própria** conversa, isolada por `usuario.sub`.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /assistente/status` | `—` (autenticado) | Indica se o assistente está configurado (chave da API presente). |
| `GET /assistente/conversa` | `—` (autenticado) | Retorna a conversa atual do usuário (mensagens das últimas 24h). |
| `POST /assistente/mensagem` | `—` (autenticado) | Envia uma mensagem e recebe a resposta da Cluby. |
| `DELETE /assistente/conversa` | `—` (autenticado) | Limpa toda a conversa do usuário ("Limpar conversa"). |

> Quando o Gemini está indisponível ou não configurado
> (`GeminiIndisponivelError`/`GeminiNaoConfiguradoError`), o `POST /mensagem`
> responde **503 Service Unavailable** com mensagem amigável.

## 5. Serviços e funções

### `AssistenteService`

#### `estaConfigurado()`
- **Devolve:** `boolean` — se a chave `GEMINI_API_KEY` está presente.
- **Efeitos:** apenas delega ao `GeminiClient.estaConfigurado()`.

#### `obterConversa(usuarioId)`
- **Devolve:** as mensagens das últimas 24h (`MensagemConversa[]`), em ordem
  cronológica.
- **Efeitos:** lê `MensagemAssistente` filtrando por `criadaEm ≥` a data-limite
  de retenção.

#### `enviarMensagem(usuario, texto)`
- **Recebe:** identidade mínima do usuário (`id`, `nome`, `perfil`) e o texto.
- **Devolve:** a resposta gerada (`MensagemConversa`).
- **Efeitos:** se a pergunta corresponder a um procedimento (hoje desativado),
  delega a `responderProcedimento`; senão, monta o histórico recente
  (`MAX_HISTORICO = 20`), agrega **em paralelo** os contextos de escala,
  indicadores, APAE e vendas, monta a instrução de sistema, chama o Gemini e
  **persiste** pergunta e resposta.
- **Regras aplicadas:** só as últimas 20 mensagens vão ao modelo (controle de
  custo); contextos que falham ao montar retornam `undefined` e não quebram o
  chat.
- **Erros possíveis:** `GeminiNaoConfiguradoError`, `GeminiIndisponivelError`
  (propagados e traduzidos para 503 no controller).

#### `limparConversa(usuarioId)`
- **Devolve:** `{ removidas: number }`.
- **Efeitos:** apaga todas as mensagens do usuário (`deleteMany`).

#### `limparConversasAntigas()` (cron)
- **Efeitos:** remove as mensagens com mais de 24h. Dispara **diariamente às
  03:00** (horário de Brasília, `America/Sao_Paulo`).

#### Funções privadas relevantes (montagem de contexto)
- `montarContextoEscala()` — turno, horários e folgas de cada fiscal, lidos de
  `Fiscal` + `EscalaEntry`.
- `montarContextoIndicadores()` — totais do mês por tipo de arrecadação, meta e
  semáforo (🟢/🟡/🔴), além dos destaques do mês (top por categoria, **excluindo
  fiscais**).
- `montarContextoApae()` — arrecadação das Sacolas APAE no mês, meta e total
  histórico.
- `montarContextoVendas()` — vendas de hoje/ontem, comparação com a semana
  anterior, faturamento do mês, projeção e hora de pico.
- `responderProcedimento(...)` / `montarBlocos(...)` — resumo do procedimento
  mantendo os marcadores `[FOTO:k]` e reconstrução dos blocos (texto + fotos).

### `GeminiClient.gerarResposta(instrucaoSistema, mensagens)`
Chama a API do Gemini com **concorrência limitada** (`MAX_CONCORRENCIA = 2`, via
semáforo), **timeout** de 20s por tentativa e **reintento com backoff** em
respostas 429 (limite) e 503 (sobrecarga), respeitando o `retryDelay` sugerido.
A chave vai no cabeçalho `x-goog-api-key` (não na URL). Modelo padrão:
`gemini-2.5-flash`, com `thinkingBudget: 0` para não truncar respostas longas.

### `ProcedimentosService.encontrar(pergunta)` / `montarDocumento(proc)`
Faz a correspondência da pergunta com um procedimento por palavras-chave/título
e monta o "documento" com marcadores de foto. **Atualmente desativado** — ver §7.

## 6. Lógica de domínio (funções puras)
- `montarInstrucaoSistema(opcoes)` (em `assistente.prompt.ts`) — monta o "papel"
  da Cluby em PT-BR e anexa, quando presentes, os blocos de documentos, escala e
  indicadores.
- `montarInstrucaoProcedimento(...)` — instrui a Cluby a **resumir** uma
  normativa preservando os marcadores `[FOTO:k]` na ordem.
- `semAcento(s)` (em `procedimentos.service.ts`) — normalização para a busca.

## 7. Estados e enums
- `PapelGemini`: `user` · `model` (convenção da API Gemini).
- **Procedimentos guiados desativados:** `PROCEDIMENTOS_ATIVOS = false` em
  `procedimentos.service.ts`. Enquanto `false`, `encontrar()` retorna sempre
  `undefined` e a Cluby responde apenas com o conhecimento geral + contexto da
  loja. Os dados permanecem em `procedimentos.data.ts` — basta voltar para
  `true` para reativar.
- **Assistente ativo condicional:** o chat só gera respostas quando
  `GEMINI_API_KEY` está definida (ver [`config`](config.md)); sem a chave, o
  `status` retorna `configurado: false` e o envio responde 503.

## 8. Dados que o módulo toca
- **Escreve:** `MensagemAssistente` (pergunta + resposta; efêmeras 24h).
- **Lê (apenas contexto):** `Fiscal`, `EscalaEntry`, `MetaIndicador`,
  `RegistroArrecadacao`, `VendaDiaria`, `VendaHora`, `ConfigApae`,
  `MovimentoLoteApae`, `LoteApae`, `ConfigVendas`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` (global), `GeminiClient`, `ProcedimentosService`,
  `ScheduleModule` (cron, registrado no `AppModule`), config pura de
  [`arrecadacao`](arrecadacao.md) (`CONFIG_ARRECADACAO`, `TIPOS_ARRECADACAO`) e
  `arredondar` de [`common`](common.md).
- **É usado por:** o app (chat flutuante). Exporta o `AssistenteService`.
- **Desacoplamento proposital:** lê o contexto **direto via Prisma** para evitar
  dependência circular com os módulos de fiscais/arrecadação/vendas.

## 10. Regras de negócio-chave
1. **Conversa efêmera (24h):** só as últimas 24h aparecem e são enviadas ao
   modelo; o cron das 03:00 apaga o resto.
2. **Isolamento por usuário:** cada um vê apenas a sua conversa (`usuario.sub`).
3. **Custo controlado:** no máximo 20 mensagens de histórico por chamada.
4. **Resiliência:** falha ao montar qualquer contexto não quebra o chat; falha
   do Gemini vira 503 amigável (nunca 500 cru).
5. **Fiscais fora dos rankings de destaque** de arrecadação (operam caixa
   raramente).
6. **Segurança da chave:** enviada no cabeçalho, nunca na URL.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `gemini.client.spec.ts` | Configuração pela chave, extração do texto e limite de 2 chamadas simultâneas | 3 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Dependência de serviço externo pago/gratuito** (Google Gemini): sujeito a
  limites de cota (429) e indisponibilidade (503); mitigado por reintento com
  backoff, mas ainda pode falhar em picos.
- 🔧 **Procedimentos guiados desativados** (`PROCEDIMENTOS_ATIVOS = false`):
  todo o catálogo (`procedimentos.data.ts`, ~1.159 linhas) e a lógica de
  correspondência permanecem no código sem uso ativo — decisão de produto
  pendente para reativar ou remover.
- 🔧 `assistente.service.ts` (663 linhas) concentra a montagem de quatro
  contextos distintos com consultas Prisma; candidato a extrair "provedores de
  contexto" conforme crescer.
- ⛔ **Sem cobertura automatizada** do `AssistenteService` (montagem de contexto
  e efêmeros); apenas o `GeminiClient` tem testes.
