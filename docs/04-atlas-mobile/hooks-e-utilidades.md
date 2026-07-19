> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/hooks/`, `mobile/src/utils/`, `mobile/src/api/`, `mobile/src/auth/`, `mobile/src/theme/`, `mobile/src/offline/`, `mobile/src/push/`

# Hooks e utilidades

## 1. Propósito
Descreve a **base transversal** consumida por todas as telas do app: os hooks de
carregamento e autenticação, o cliente de API, o subsistema offline, o push, o
tema visual e as utilidades de formatação, diálogos e impressão. É o "sistema
nervoso" compartilhado — as telas concentram-se na experiência, delegando aqui
o acesso a dados, permissões, persistência e formatação em pt-BR.

## 2. Inventário
| Arquivo | Símbolo(s) | O que faz |
|---|---|---|
| `hooks/useRequisicao.ts` | `useRequisicao` | Carregamento assíncrono genérico com estados. |
| `auth/AuthContext.tsx` | `AuthProvider`, `useAuth` | Sessão, login/logout, `podeAcessar`. |
| `auth/funcionalidades.ts` | `podeAcessar`, catálogos de perfil | Espelho local das permissões por perfil. |
| `auth/biometria.ts` | `biometriaSuportada`, `ativarBiometria`, `autenticarComBiometria`, ... | Login por Face ID / digital. |
| `api/client.ts` | `apiClient`, `ApiError`, `registrarAoExpirarSessao` | Cliente HTTP com token, timeout e erros tipados. |
| `api/config.ts` | `API_BASE_URL`, `TIMEOUT_REQUISICAO_MS`, namespaces WS | Configuração de ambiente. |
| `api/tokenStorage.ts` | `tokenStorage` | Guarda o token (SecureStore no nativo, AsyncStorage na web). |
| `api/socket.ts` | `conectarPainelFiscais`, `conectarNotificacoes` | WebSocket (Socket.IO) de fiscais e notificações. |
| `api/services/*` | `*Service` (via `services/index.ts`) | Serviços por módulo sobre o `apiClient`. |
| `screens/centroDeMando/usePulsoDoDia.ts` | `usePulsoDoDia` | Contagem de pendências por módulo (Home/Tarefas). |
| `offline/*` | `OfflineProvider`, `useOfflineContexto`, `OfflineStore`, fila, sincronização | Cache de leitura + fila de ações offline. |
| `push/push.ts` | `registrarPush`, `removerPushRegistrado` | Registro de token de push (Expo). |
| `theme/index.ts` | `cores`, `espacamento`, `tipografia`, `raio`, `sombra`, `coresParaStatus`, ... | Tema visual centralizado. |
| `utils/formato.ts` | `formatarMoeda`, `formatarData`, `hojeISO`, `mascaraDataBR`, ... | Formatação e datas em pt-BR. |
| `utils/rotulos.ts` | `ROTULO_TIPO_ARRECADACAO`, `ARRECADACAO`, `ROTULO_STATUS_FISCAL` | Rótulos legíveis de enums do domínio. |
| `utils/dialogos.ts` | `confirmar`, `notificar`, `registrarOuvinteDialogo` | API de diálogos consumida pelo `DialogHost`. |
| `utils/impressao.ts` | `imprimirRelatorio` | Impressão/PDF (web via iframe, nativo via `expo-print`). |
| `utils/relatorioPerfil.ts` | `htmlRelatorio`, `htmlPaginaOperador`, `svgBarras`, `htmlPizza`, ... | Geração pura do relatório de perfil em HTML/SVG. |
| `utils/notificacoesLidas.ts` | `carregarLidas`, `salvarLidas` | Estado "lida" das notificações no cliente. |
| `utils/protecaoTela.ts` | `useProtecaoTela` | Proteção contra captura de tela. |
| `utils/som.ts` | `tocarSomNotificacao`, `tocarSomAlerta` | Beeps de notificação (Web Audio). |

## 3. Hooks

### 3.1 `useRequisicao`
Hook genérico para consumir os serviços de API. Expõe:
`{ dados, carregando, atualizando, erro, recarregar, definir }`.
- `carregando` para a primeira carga; `atualizando` para o "pull-to-refresh".
- `erro` já vem como mensagem pronta (usa `ApiError.message`, com fallback
  genérico em pt-BR).
- `recarregar()` refaz a busca (marcando `atualizando`).
- `definir(atualizador)` faz **atualização otimista** local, sem ir ao servidor.
- Refaz a busca quando as `dependencias` mudam.

Casa diretamente com o componente [`Tela`](componentes-compartilhados.md#2-inventário)
(`aoAtualizar`/`atualizando`) e com o trio `Carregando`/`MensagemErro`/`EstadoVazio`.

### 3.2 `useAuth` / AuthContext
Provê o estado de sessão a todo o app:
`{ carregando, usuario, perfil, autenticado, entrar, entrarComToken, sair, podeAcessar }`.
- **Restauração:** ao iniciar, lê o token do armazenamento seguro e busca o
  usuário (`acessosService.eu`); token inválido é limpo silenciosamente.
- **`entrar(login, senha)`:** autentica, salva o token e carrega a identidade;
  guarda o nome para a saudação do próximo login. `entrarComToken` cobre o
  login por biometria.
- **Expiração (401):** `registrarAoExpirarSessao` encerra a sessão
  automaticamente quando o `apiClient` recebe 401.
- **`podeAcessar(funcionalidade)`:** usa as **permissões efetivas** do backend;
  se ausentes, cai no espelho local `auth/funcionalidades.ts`. É a base da
  [navegação por perfil](navegacao.md#5-áreas-liberadas-por-perfilpermissão).
- **Push:** com sessão ativa, registra o aparelho (best-effort).

### 3.3 `usePulsoDoDia`
Calcula, **por regras** (sem IA) e de forma defensiva, quantas pendências cada
módulo tem hoje (importações, insumos críticos, checklist, indicadores fora da
meta, faltas, queda de vendas). Só busca dados das funcionalidades que o usuário
pode acessar, e cada chamada tem `catch` próprio (um serviço que falha não
derruba os demais). Alimenta a ordenação da Home e o selo da aba **Tarefas**.

## 4. Utilidades

### 4.1 Formatação e datas (`formato.ts`)
Formatação pt-BR: `formatarMoeda`, `formatarNumero`, `formatarPercentual`,
`formatarData`, `formatarDataHora`, `formatarHora`, `formatarDuracao`. Datas de
"hoje"/dia da semana usam **fuso fixo de Brasília (UTC−3)** (`hojeISO`,
`diaSemanaHoje`) para não "virar o dia" em servidores UTC. Também traz máscaras
enquanto se digita (`mascaraDataBR`, `mascaraMilhar`) e conversões
(`dataBRParaISO`, `isoParaDataBR`, `parseNumeroBR`), além de `DIAS_SEMANA`.

### 4.2 Diálogos (`dialogos.ts`)
Substitui `Alert`/`window.confirm` por uma API baseada em Promise:
`confirmar(titulo, mensagem, textoConfirmar?)` e `notificar(titulo, mensagem)`.
Publica um "pedido" para o [`DialogHost`](componentes-compartilhados.md#2-inventário)
(único, montado no `App.tsx`), que os exibe um de cada vez (fila). O tom
(sucesso/erro) do `notificar` é inferido do título.

### 4.3 Impressão e relatório (`impressao.ts`, `relatorioPerfil.ts`)
`imprimirRelatorio(html)` abre a folha de impressão/PDF — na web via `iframe`
oculto (aguardando o `load` para não sair em branco), no nativo via
`expo-print`. `relatorioPerfil.ts` é **puro**: monta o HTML/SVG do perfil do
colaborador (A4, um por página, com barras e pizza espelhando a tela), portanto
é totalmente testável.

### 4.4 Demais utilidades
- `rotulos.ts`: rótulos legíveis de enums (`ROTULO_TIPO_ARRECADACAO`,
  `ROTULO_STATUS_FISCAL`) e as definições dos indicadores de arrecadação
  (`ARRECADACAO`), espelhando o backend.
- `notificacoesLidas.ts`: guarda no cliente (AsyncStorage) os IDs de
  notificações já lidas — o backend não tem endpoint de "marcar como lida".
- `protecaoTela.ts` (`useProtecaoTela`): bloqueia/dissuade captura de tela
  (FLAG_SECURE no nativo; `@media print` + limpeza de clipboard na web).
- `som.ts`: beeps sutis de notificação/alerta via Web Audio.

## 5. Tema visual
`theme/index.ts` centraliza `cores` (identidade SaaS azul + semânticas de
status), `gradientes`, `coresModulos`, `espacamento`, `raio`, `tipografia`
(fonte Inter) e `sombra`. `coresParaStatus(StatusCor)` mapeia a classificação do
backend (VERDE/AMARELO/VERMELHO) para cores + rótulo. Convenção: **nenhuma cor
literal nas telas** — sempre via tema.

## 6. Cliente de API
### 6.1 `apiClient` e `ApiError`
`client.ts` encapsula o `fetch` adicionando: `API_BASE_URL`, cabeçalho
`Authorization: Bearer <token>` (lido do `tokenStorage`), serialização de JSON,
upload `multipart/form-data`, timeout (`TIMEOUT_REQUISICAO_MS` = 60s, para
tolerar cold start) e o mapeamento de erros para `ApiError`. O `ApiError` expõe
`status`, `corpo` e `naoAutorizado` (401), e sua `message` já vem na **mensagem
em pt-BR devolvida pela API** (aceita `{ mensagem }` e `{ message }`). Métodos:
`get/post/put/patch/delete/upload`.

### 6.2 Base URL e token
`API_BASE_URL` vem de `EXPO_PUBLIC_API_URL` (sem barra final), com padrão de dev
`http://localhost:3000`. O token é guardado por `tokenStorage` no
`expo-secure-store` (Keychain/Keystore) no nativo e no `AsyncStorage` na web,
com interface assíncrona idêntica.

### 6.3 Serviços e WebSocket
`api/services/index.ts` reexporta um `*Service` por módulo (arrecadação, vendas,
checklist, operadores, colaboradores, ponto, insumos, permissões, notificações,
etc.), todos sobre o `apiClient`. `api/socket.ts` abre conexões Socket.IO para o
painel de fiscais (`/fiscais`, evento `fiscal:status`) e para as notificações em
tempo real (`/notificacoes`, evento `notificacao`), enviando o token no
handshake.

## 7. Fila offline e sincronização
Subsistema em `offline/` (Req 3.1.1, 4.1.1, 4.1.2), disponibilizado a todo o app
pelo `OfflineProvider` (montado no `App.tsx`) e acessado por `useOfflineContexto`.
- **Cache de leitura + fila de ações** persistidos em SQLite, com **fallback em
  memória** quando o SQLite nativo não está disponível.
- `OfflineStore` é a fachada: `lerComCache` (tenta online, atualiza cache, cai no
  cache em falha) e `enfileirar` de ações (`RETIRADA_FARDO`,
  `ALTERACAO_STATUS_FISCAL`, `REGISTRO_BATIDA`).
- `fila.ts` é **lógica pura**: ordena por criação e resolve conflito de status
  do fiscal por **última alteração vence** (last-write-wins).
- `sincronizacao.ts` drena a fila ao reconectar: resolve conflitos, envia em
  ordem, remove os enviados e **descarta batidas com rejeição definitiva** (4xx
  de validação/negócio) para não travar a fila; falhas transitórias são
  preservadas. As batidas usam `clienteId` como **chave de idempotência** (o
  reenvio não duplica).
- `useOffline` expõe `{ online, pendentes, definirOnline, enfileirar,
  sincronizarAgora }` e sincroniza automaticamente na transição offline→online.

## 8. Push (`push/push.ts`)
Registra o token de push do Expo no backend após o login e configura a exibição
com o app aberto. Tudo é **best-effort**: em web/emulador, sem permissão ou sem
credencial, o app segue normal (o aviso ainda chega in-app/WebSocket).
`removerPushRegistrado` limpa o token no logout.

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `utils/formato.test.ts` | Formatação/máscaras/conversões pt-BR | 7 |
| `utils/relatorioPerfil.test.ts` | HTML/SVG do relatório de perfil | 12 |
| `offline/fila.test.ts` | Ordenação e last-write-wins | 6 |
| `offline/sincronizacao.test.tsx` | Drenagem da fila, conflitos e rejeições | 7 |

Total: **32 casos** em 4 arquivos. Os hooks (`useRequisicao`, `useAuth`,
`usePulsoDoDia`) e o `apiClient` não têm teste unitário dedicado — são exercidos
indiretamente pelos testes de tela e pela lógica pura acima.

## 10. Riscos e dívidas
- ⚠️ `auth/funcionalidades.ts` é um **espelho manual** do backend
  (`acessos.domain.ts`). Mudou uma permissão? Atualize os dois lados — a fonte
  de verdade continua sendo o backend.
- 🔧 `api/types.ts` (~1810 linhas) concentra todos os tipos da API; grande e
  candidato a ser fatiado por módulo.
- ⚠️ A conectividade do `useOffline` é informada por `definirOnline` (não há um
  monitor de rede acoplado por padrão) — quem integra precisa alimentar o estado
  online/offline.
- ⚠️ `notificacoesLidas` vive só no cliente (limite de ~800 IDs); o backend não
  persiste o "lida", então o estado não sincroniza entre aparelhos.
