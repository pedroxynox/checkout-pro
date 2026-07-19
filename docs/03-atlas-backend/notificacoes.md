> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/notificacoes/`

# Módulo: `notificacoes`

## 1. Propósito
Serviço **transversal** de notificações: entrega avisos do sistema em **duplo
canal** (push + in-app), resolve os destinatários conforme a permissão de cada
funcionalidade e mantém o histórico por usuário, com entrega **em tempo real**
via WebSocket.

## 2. Responsabilidades e limites
- **Faz:** registra cada entrega (push + in-app) por destinatário; resolve os
  alvos por **funcionalidade** (respeitando a Central de Permissões) ou pelos
  perfis operacionais; publica no barramento para entrega em tempo real
  (Socket.IO, por usuário); envia push via Expo (best-effort); gerencia os
  tokens de push; expõe o histórico do usuário.
- **Não faz:** não decide **quando** avisar (isso é de quem chama, ex.:
  [`alertas`](alertas.md), `insumos`, [`checklist`](checklist.md)); não calcula
  permissões — apenas reusa o domínio de [`acessos`](acessos.md); não faz a
  entrega push real na infraestrutura do dispositivo (delega ao Expo Push).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `notificacoes.service.ts` | Regras de aplicação: envio, alvos, push tokens, histórico | 298 |
| `notificacoes.domain.ts` | Regras puras: destinatários e montagem das entregas | 71 |
| `notificacoes.gateway.ts` | Gateway WebSocket (Socket.IO), entrega por usuário | 86 |
| `notificacoes.eventos.ts` | Barramento (RxJS) que desacopla serviço e gateway | 34 |
| `notificacoes.controller.ts` | Rotas HTTP: histórico e push tokens | 59 |
| `notificacoes.module.ts` | Ligações (DI) do módulo | 22 |
| `dto/notificacoes.dto.ts` | Validação do registro/remoção de push token | 27 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `notificacoes`](../05-referencia-dados/api-http.md#notificacoes).

O controller inteiro exige a funcionalidade `NOTIFICACOES`
(`@Funcionalidade('NOTIFICACOES')`), que por padrão pertence a todos os perfis
operacionais.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /notificacoes/historico` | `NOTIFICACOES` | Histórico do usuário autenticado (mais recentes primeiro). |
| `POST /notificacoes/push-token` | `NOTIFICACOES` | Registra/atualiza o token de push (Expo) do aparelho (204). |
| `POST /notificacoes/push-token/remover` | `NOTIFICACOES` | Remove o token de push do aparelho no logout (204). |

> Além do HTTP, o módulo expõe um **gateway WebSocket** no namespace
> `/notificacoes`: o cliente conecta com o token JWT no handshake e entra na
> sala `usuario:<id>`, recebendo cada aviso em tempo real (evento `notificacao`).

## 5. Serviços e funções

### `NotificacoesService`

#### `enviar(destinatarios, conteudo)`
- **Recebe:** lista de destinatários (`UsuarioRef`) e o conteúdo
  (`titulo`, `mensagem`).
- **Devolve:** as notificações criadas.
- **Efeitos:** monta as entregas (duplo canal), grava cada `Notificacao` (uma a
  uma, em paralelo, para preservar `id`/`criadaEm`), **publica** cada uma no
  barramento (tempo real) e dispara o **push Expo** (best-effort).

#### `destinatariosGerais()`
Todos os usuários dos perfis operacionais que recebem avisos —
**fonte única de verdade**: `FISCAL`, `SUPERVISOR`, `GERENTE`, `ADMINISTRADOR`
(o `IMPORTADOR` fica de fora de propósito).

#### `destinatariosComPermissao(funcionalidade)`
Retorna os usuários operacionais cuja permissão **efetiva** inclui a
funcionalidade, aplicando as três camadas de [`acessos`](acessos.md) — padrão do
perfil ± ajustes de perfil ± ajustes por login — via
`decidirAutorizacaoComOverrides`. É assim que os avisos passam a respeitar o
painel de permissões.

#### `notificarComPermissao(...)` · `notificarAlertaChecklist(...)` · `notificarSupervisaoEGerencia(...)` · `notificarTodos(...)`
Atalhos que resolvem os alvos por funcionalidade (`NOTIFICACOES`, `CHECKLIST`,
`CENTRAL_JORNADA`, etc.) e chamam `enviar`. Sem destinatários, não fazem nada.

#### `registrarPushToken(usuarioId, token, plataforma?)` / `removerPushToken(token)`
Gerenciam os tokens de push (Expo). O registro é **idempotente por token**:
reaponta o token para o usuário atual (útil quando trocam de login no aparelho).

#### `historico(usuarioId)`
Lista as notificações do usuário, mais recentes primeiro.

#### `gestores()` · `loginGerencial()` · `destinatariosAlertaChecklist()`
Métodos de alvo que hoje delegam a `destinatariosGerais`/`destinatariosComPermissao`
(por decisão de negócio, os avisos vão a todos os perfis operacionais).

#### `enviarPush(...)` (privado)
Consulta os tokens no formato Expo, envia em lotes de 100 ao Expo Push Service.
**Best-effort:** qualquer falha é engolida — nunca derruba o aviso in-app.

### `NotificacaoEventos`
Barramento RxJS (`Subject`) que **desacopla** o serviço (produtor) do gateway
(consumidor), evitando dependência circular. `publicar(evento)` / `eventos$`.

### `NotificacoesGateway`
Assina o barramento e emite cada notificação **apenas** para a sala do
destinatário (`usuario:<id>`). Valida o JWT no handshake; token inválido/ausente
encerra a conexão. Cancela a assinatura em `onModuleDestroy`.

## 6. Lógica de domínio (funções puras)
Em `notificacoes.domain.ts`:
- `destinatariosAlertaChecklist(fiscaisOnline, gerenciais)` → união
  **deduplicada** (por id), com o gerencial **sempre presente** e preservando a
  ordem (fiscais online primeiro).
- `montarEntregas(destinatarios, conteudo)` → uma entrega por destinatário, com
  `canalPush` **e** `canalInApp` marcados (duplo canal).

## 7. Estados e enums
- `Perfil`: `FISCAL` · `SUPERVISOR` · `GERENTE` · `ADMINISTRADOR` (gerente
  desenvolvedor) · `IMPORTADOR`. Recebem avisos: os quatro primeiros.
- Plataforma do push token: `android` · `ios` · `web` (validada no DTO).
- Evento WebSocket: `notificacao` (constante `EVENTO_NOTIFICACAO`).

## 8. Dados que o módulo toca
- **Escreve:** `Notificacao` (cada entrega), `PushToken` (upsert/delete).
- **Lê:** `Usuario` (+ `permissoes`), `PerfilPermissao` (para resolver alvos).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` (global), domínio de [`acessos`](acessos.md)
  (`decidirAutorizacaoComOverrides`), `JwtService` (gateway),
  `origensCorsDoAmbiente` de [`common`](common.md), RxJS/Socket.IO.
- **É usado por:** [`alertas`](alertas.md), [`checklist`](checklist.md),
  `insumos`, [`central-jornada`](central-jornada.md) e demais fluxos que avisam a
  equipe. Exporta o `NotificacoesService`.

## 10. Regras de negócio-chave
1. **Duplo canal sempre:** cada entrega marca push **e** in-app.
2. **Alvos seguem o painel de permissões:** quem recebe é quem tem a
   funcionalidade relacionada (permissão efetiva das três camadas).
3. **Perfis operacionais recebem avisos**; `IMPORTADOR` fica de fora
   (ponto único a ajustar caso se volte a segmentar).
4. **Push é best-effort:** nunca derruba o aviso in-app.
5. **Token idempotente:** o mesmo aparelho reaponta o token ao novo usuário.
6. **Entrega em tempo real por usuário:** o gateway emite só para a sala do
   destinatário (diferente do broadcast do painel de fiscais).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `notificacoes.service.spec.ts` | Envio em duplo canal, alvos operacionais e histórico ordenado | 3 |
| `notificacoes.properties.spec.ts` | Propriedades (fast-check): destinatários e duplo canal | 2 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 **Métodos de alvo redundantes:** `gestores`, `loginGerencial` e
  `destinatariosAlertaChecklist` hoje convergem para os mesmos destinatários;
  mantidos por compatibilidade — candidatos a consolidar.
- ⚠️ **Push acoplado ao Expo** (URL fixa `exp.host`): trocar de provedor exige
  mudar o serviço; a persistência da notificação, porém, não depende disso.
- 🔧 **Uma `create` por destinatário** (em vez de `createMany`) para obter os
  ids; aceitável no volume atual, mas pode pesar em envios muito grandes.
