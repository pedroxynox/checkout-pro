> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** `mobile/src/navigation/`

# Navegação

## 1. Propósito
Descreve como o app se organiza em telas: o **navegador raiz** (login vs. app
autenticado), a **barra de abas** inferior, a **pilha** de telas de módulo e
como cada **área** é liberada conforme o perfil/permissão do usuário. Usa o
`@react-navigation` (native-stack + bottom-tabs).

## 2. Inventário
| Arquivo | Símbolo | O que faz | Linhas |
|---|---|---|---|
| `RootNavigator.tsx` | `RootNavigator` | Decide entre login e app conforme o `AuthContext`; monta `NavigationContainer`, tema, `linking` (URLs na web) e os provedores de Notificações/Assistente. | 107 |
| `MainTabs.tsx` | `MainTabs` | Barra de abas inferior (Início, Tarefas, Ponto central, Notificações, Perfil), com selos de pendências/não lidas. | 206 |
| `AppNavigator.tsx` | `AppNavigator` | Pilha de telas de módulo; cada rota só entra na pilha se `podeAcessar(funcionalidade)`. | 414 |
| `areas.ts` | `AREAS`, `Area` | Catálogo das áreas funcionais (rota, ícone, título, `funcionalidade` exigida, marca `emBreve`) usado pela Home e pelo menu. | 191 |
| `types.ts` | `RootStackParamList`, `MainTabParamList`, `RotaApp`, `PropsTela`, `PropsTabInicio` | Tipagem de todas as rotas e seus parâmetros. | 94 |

## 3. Fluxo de login → app
1. `App.tsx` monta os provedores globais (`AuthProvider`,
   `ConfigSistemaProvider`, `OfflineProvider`) e o `RootNavigator`.
2. `RootNavigator` lê o `AuthContext`:
   - **Restaurando a sessão** (`carregando`): mostra `Carregando`.
   - **Não autenticado**: renderiza a `LoginScreen`.
   - **Autenticado**: envolve o app em `NotificacoesProvider` +
     `AssistenteProvider` e renderiza o `AppNavigator`, com o `ToastNotificacao`
     por cima.
3. O login autentica no backend (`acessosService.login`), salva o token no
   armazenamento seguro e carrega a identidade (`acessosService.eu`). Ao expirar
   a sessão (401), o `AuthContext` encerra automaticamente. Ver
   [Hooks e utilidades §3.2](hooks-e-utilidades.md#32-useauth--authcontext).

## 4. Abas principais (`MainTabs`)
São cinco posições na barra inferior:

| Aba | Tela | Observações |
|---|---|---|
| **Início** | `HomeScreen` | Hub com as áreas permitidas ao perfil. |
| **Tarefas** | `TarefasScreen` | Selo com `totalPendencias` do [`usePulsoDoDia`](hooks-e-utilidades.md#33-usepulsododia). |
| **Ponto** (central) | — | **Não é uma aba**: é um botão elevado (degradê + ícone de câmera) que navega para `RegistroPonto` com `abrirScanner` (nonce), abrindo direto a câmera do leitor de ponto. |
| **Notificações** | `NotificacoesScreen` | Selo com `naoLidas` (exibe `99+` acima de 99). |
| **Perfil** | `PerfilScreen` | — |

As telas de módulo continuam na pilha (`AppNavigator`), empurradas por cima das
abas.

## 5. Áreas liberadas por perfil/permissão
O coração da navegação por perfil está em duas peças que se combinam:

### 5.1 `areas.ts` — catálogo de áreas
Cada `Area` aponta para uma `rota`, um `icone`, um `titulo`/`descricao` e a
`funcionalidade` exigida. A Home percorre `AREAS` e exibe **apenas** as áreas
cuja funcionalidade o usuário pode acessar. Duas marcas mudam **onde** (ou se) a
área aparece, sem tocar em permissão nem em rota:

- **`emBreve: true`** (Alertas de Fila, Normativas, Indicador de Quebra) — a área
  fica **oculta do menu** mesmo para quem tem permissão, até ser concluída.
- **`noCabecalho: true`** (hoje só o **Centro de Controle**) — a área sai dos
  "Acessos rápidos" **e** do menu lateral do desktop, e vira um **botão discreto
  no cabeçalho** da Home, ao lado da identidade do usuário. O rótulo do botão vem
  de `tituloCurto` (ex.: "Central"), mas o `titulo` completo continua sendo lido
  por leitores de tela. Remover a marca devolve a área à grade, sem mais nada a
  mudar.

A diferença entre as duas: `emBreve` esconde algo que **não existe ainda**;
`noCabecalho` apenas **muda de lugar** algo que existe e é alcançável.

### 5.2 `podeAcessar` — a regra de exibição
Vem do `AuthContext` (`podeAcessar(funcionalidade)`). A fonte de verdade são as
**permissões efetivas** enviadas pelo backend no login (padrão do perfil ±
ajustes por login da Central de Permissões); se ausentes, cai no espelho local
`auth/funcionalidades.ts`. Resumo dos perfis (ver
[Perfis e permissões](../01-produto/perfis-e-permissoes.md)):

- **ADMINISTRADOR** — vê tudo (acesso total).
- **GERENTE** — operação e gestão do dia a dia + Centro de Controle (cadastro,
  metas, relatórios), menos ferramentas exclusivas do admin.
- **SUPERVISOR** — tudo do fiscal + fechamento, edição de escala/batidas e
  Central de Jornada.
- **FISCAL** — conjunto operacional (checklist, insumos, escala, ponto,
  indicadores, check-outs etc.). **Não** inclui a seção Colaboradores nem a ficha
  individual: dados pessoais têm funcionalidade própria
  (`COLABORADORES_VISUALIZAR` / `COLABORADORES_PERFIL`).
- **IMPORTADOR** — apenas Importações.

O botão do cabeçalho segue a **mesma** funcionalidade da área (`OPERADORES_CRUD`
no caso da Central): quem não tem acesso não o vê em lugar nenhum.

### 5.3 Defesa em profundidade no `AppNavigator`
Além de a Home esconder o que o perfil não vê, o `AppNavigator` **só inclui a
rota na pilha** quando `podeAcessar(...)` é verdadeiro (ex.: `Operadores`,
`CentroControle`, `Permissoes`, `AdminDados`). Assim, um fiscal nem consegue
navegar para telas restritas. A **autorização definitiva permanece no backend**
— este filtro é apenas de UX/defesa extra.

`PerfilColaborador` é um caso especial: a rota exige `COLABORADORES_PERFIL` e é
alcançada de **quatro** telas diferentes (Colaboradores, Escalas, Contratos e
Jornada da equipe). Cada uma delas confere a mesma permissão antes de navegar,
então sem ela o toque no nome da pessoa simplesmente não faz nada.

## 6. Rotas e parâmetros (`types.ts`)
`RootStackParamList` tipa todas as telas da pilha; `MainTabParamList` tipa as
abas. Exemplos de rotas com parâmetros:
- `IndicadorDetalhe: { tipo, operadorNome?, alertaMensagem? }`
- `RegistroPonto: { abrirScanner?: number } | undefined` (nonce da câmera)
- `PerfilColaborador: { colaboradorId }`
- `DetalheJornada: { colaboradorId, ciclo, pessoa }`

`PropsTela<T>` e `PropsTabInicio` são os helpers de tipagem usados pelas telas.

## 7. URLs na web (`linking`)
Na web, o `RootNavigator` define `linking` para sincronizar a pilha com o
histórico do navegador: cada tela tem sua URL (ex.: `tarefas`, `importacoes`,
`indicadores/detalhe/:tipo`, `colaboradores/:colaboradorId`), e o botão/gesto
"voltar" retorna à tela anterior do app em vez de sair do site.

## 8. Testes
Não há teste dedicado aos arquivos de navegação, mas `AREAS` e as suas marcas são
exercitadas pela Home: `screens/HomeScreen.test.tsx` percorre o catálogo com a
regra real de `podeAcessar` e cobre as áreas visíveis por perfil, o botão
"Central" do cabeçalho (área `noCabecalho`) e a navegação ao tocar. A lógica de
permissão em si é testada em `auth`/backend (ver
[Hooks e utilidades §3.2](hooks-e-utilidades.md#32-useauth--authcontext)).

## 9. Riscos e dívidas
- 🔧 `AppNavigator.tsx` lista manualmente cada rota com seu `podeAcessar`; é
  longo e repetitivo — candidato a gerar as telas a partir de um mapa
  declarativo.
- ⚠️ O catálogo `AREAS` e a pilha do `AppNavigator` precisam ser mantidos em
  sincronia com `auth/funcionalidades.ts` **e** com o backend; divergências
  causam áreas "fantasma" (aparecem no menu mas retornam 403).
- ⚠️ A marca `emBreve` esconde áreas do menu, mas as rotas ainda existem na
  pilha — remover a marca é o único passo para publicá-las.
