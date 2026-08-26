> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** `backend/src/notificacoes/`

# Módulo: `notificacoes`

## 1. Propósito
Serviço **transversal** de notificações: entrega avisos do sistema em **duplo
canal** (push + in-app), resolve os destinatários conforme a permissão de cada
funcionalidade e mantém o histórico por usuário — numa **janela de 200 avisos
por pessoa** —, com entrega **em tempo real** via WebSocket.

## 2. Responsabilidades e limites
- **Faz:** registra cada entrega (push + in-app) por destinatário; resolve os
  alvos por **funcionalidade** (respeitando a Central de Permissões) ou pelos
  perfis operacionais; publica no barramento para entrega em tempo real
  (Socket.IO, por usuário); envia push via Expo (best-effort); gerencia os
  tokens de push; expõe o histórico do usuário; **mantém cada caixa no limite de
  200** (ao entrar um aviso novo, o mais antigo sai) e permite ao usuário
  **limpar a própria caixa**.
- **Não faz:** não decide **quando** avisar (isso é de quem chama, ex.:
  [`alertas`](alertas.md), `insumos`, [`checklist`](checklist.md)); não calcula
  permissões — apenas reusa o domínio de [`acessos`](acessos.md); não faz a
  entrega push real na infraestrutura do dispositivo (delega ao Expo Push).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `notificacoes.service.ts` | Regras de aplicação: envio, alvos, push tokens, histórico, janela de 200 e limpeza | 368 |
| `notificacoes.domain.ts` | Regras puras: destinatários, montagem das entregas e o limite por usuário | 84 |
| `notificacoes.gateway.ts` | Gateway WebSocket (Socket.IO), entrega por usuário | 86 |
| `notificacoes.eventos.ts` | Barramento (RxJS) que desacopla serviço e gateway | 34 |
| `notificacoes.controller.ts` | Rotas HTTP: histórico, limpar e push tokens | 74 |
| `notificacoes.module.ts` | Ligações (DI) do módulo | 22 |
| `dto/notificacoes.dto.ts` | Validação do registro/remoção de push token | 27 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `notificacoes`](../05-referencia-dados/api-http.md#notificacoes).

O controller inteiro exige a funcionalidade `NOTIFICACOES`
(`@Funcionalidade('NOTIFICACOES')`), que por padrão pertence a todos os perfis
operacionais.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /notificacoes/historico` | `NOTIFICACOES` | Histórico do usuário autenticado (mais recentes primeiro, no máximo 200). |
| `DELETE /notificacoes` | `NOTIFICACOES` | Limpa a caixa do usuário autenticado; devolve `{ removidas }`. |
| `POST /notificacoes/push-token` | `NOTIFICACOES` | Registra/atualiza o token de push (Expo) do aparelho (204). |
| `POST /notificacoes/push-token/remover` | `NOTIFICACOES` | Remove o token de push do aparelho no logout (204). |

> Todas as rotas operam sobre o **usuário do token** (`usuario.sub`), nunca sobre
> um id do corpo/da URL: ninguém alcança nem limpa a caixa de outra pessoa.

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
  barramento (tempo real), **apara a caixa de cada destinatário** para caber na
  janela de 200 (best-effort) e dispara o **push Expo** (best-effort).

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
Lista as notificações do usuário, mais recentes primeiro, com
`take: LIMITE_NOTIFICACOES_POR_USUARIO`. O `take` é **rede de segurança**: a
aparagem no envio já mantém o tamanho, mas ela é best-effort e as caixas que
existiam antes deste limite podem estar maiores — assim a tela nunca recebe uma
lista gigante.

#### `limparHistorico(usuarioId)`
Apaga **apenas** as notificações do usuário informado e devolve
`{ removidas: number }`. O `usuarioId` vem do token; é o que sustenta o botão
discreto de limpar no app. Idempotente (limpar uma caixa vazia devolve 0).

#### `apararCaixas(usuarioIds)` / `apararCaixa(usuarioId)` (privados)
Mantêm a janela de 200 por pessoa. O corte é feito **pelo banco** (`skip` sobre
a ordem decrescente), então só o excedente viaja para a aplicação — importante na
primeira aparagem de uma caixa que já acumulou milhares de linhas. A ordenação
desempata por `id` porque um aviso "para todos" cria várias linhas no **mesmo
milissegundo**: sem isso a ordem entre elas seria indefinida. **Best-effort:**
aparar é higiene, não a razão do envio — uma falha aqui é engolida (o aviso já
foi criado e entregue) e a próxima notificação tenta de novo.

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
- `LIMITE_NOTIFICACOES_POR_USUARIO = 200` → o tamanho da janela. É constante de
  domínio (não variável de ambiente): mudá-la é uma decisão de produto, de uma
  linha só.

## 7. Estados e enums
- `Perfil`: `FISCAL` · `SUPERVISOR` · `GERENTE` · `ADMINISTRADOR` (gerente
  desenvolvedor) · `IMPORTADOR`. Recebem avisos: os quatro primeiros.
- Plataforma do push token: `android` · `ios` · `web` (validada no DTO).
- Evento WebSocket: `notificacao` (constante `EVENTO_NOTIFICACAO`).

## 8. Dados que o módulo toca
- **Escreve:** `Notificacao` (cada entrega), `PushToken` (upsert/delete).
- **Apaga:** `Notificacao` — o excedente da janela (por usuário, a cada envio) e
  tudo do usuário na limpeza manual.
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
7. **Janela de 200 por pessoa.** Cada caixa guarda no máximo 200 avisos: ao
   entrar um novo, o **mais antigo** sai. O histórico não podia crescer para
   sempre — a tela carrega tudo de uma vez e um aviso "para todos" cria uma linha
   por pessoa. O limite é **por pessoa**, não da loja.
8. **Limpar é sempre a própria caixa.** O `usuarioId` vem do token; limpar não
   afeta ninguém mais. É irreversível (o app confirma antes).
9. **Aparar nunca atrapalha o aviso.** A aparagem acontece depois de criar e
   entregar, e é best-effort: se falhar, o aviso continua valendo.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `notificacoes.service.spec.ts` | Envio em duplo canal, alvos operacionais, histórico ordenado, janela de 200 (por pessoa, tolerante a falha) e limpeza da própria caixa | 10 |
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
- ℹ️ **A aparagem roda no envio, não num cron.** É onde a caixa cresce, então
  basta. Uma caixa que parou de receber avisos e ficou acima de 200 só é aparada
  no próximo aviso — mas o `take` do histórico já a mostra no tamanho certo.
- 🔧 **O borrado não é avisado por WebSocket.** O gateway só emite criação; como
  limpar é ação do próprio usuário na própria sessão, hoje não faz falta. Se
  algum dia a limpeza puder vir de outro lugar, faltará o evento.
