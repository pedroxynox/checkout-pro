> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/acessos/`

# Módulo: `acessos`

## 1. Propósito
Porta de entrada do sistema: **autentica** cada pessoa pelo seu login individual
e senha (emitindo um token JWT) e **autoriza** o acesso às funcionalidades
conforme o perfil, aplicando os ajustes por perfil e por login.

## 2. Responsabilidades e limites
- **Faz:** login individual e exclusivo (Req 7.1); emissão/assinatura do token
  JWT; verificação de senha (bcrypt) e geração de hash; decisão de autorização
  por perfil (Req 7.2), considerando os ajustes por perfil e por login; cálculo
  das permissões **efetivas** que o app recebe; consulta da identidade do
  usuário autenticado (`/acessos/eu`). É a **fonte única de verdade** do
  catálogo de funcionalidades e das regras de cada perfil.
- **Não faz:** o CRUD das contas de acesso (fica em [`usuarios`](usuarios.md));
  os ajustes de permissão por login/perfil e sua auditoria (fica em
  [`permissoes`](permissoes.md)); a criação de contas a partir do cadastro
  unificado (fica em [`colaboradores`](colaboradores.md)); a proteção efetiva
  das rotas (guards ficam em `common`, consumindo este serviço).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `acessos.controller.ts` | Rotas HTTP: login (público) e identidade | 53 |
| `acessos.service.ts` | Efeitos colaterais: Prisma, bcrypt e JWT | 197 |
| `acessos.domain.ts` | Regras puras: catálogo, perfis e decisão de acesso | 527 |
| `acessos.errors.ts` | Erros de domínio (mapeados para HTTP) | 43 |
| `acessos.module.ts` | Ligações (DI) e configuração do JWT | 38 |
| `dto/login.dto.ts` | Validação de entrada do login | 12 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `acessos`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /acessos/login` | — (público) | Autentica por login e senha; devolve token JWT, perfil e as permissões efetivas. Limite estrito de 8 tentativas/min por IP (antiforça-bruta). |
| `GET /acessos/eu` | — (autenticado) | Retorna a identidade do usuário logado (perfil, login, nome atual e permissões efetivas). |

## 5. Serviços e funções

### `AcessosService`

#### `autenticar(login, senha)`
- **Recebe:** o login individual e a senha em texto.
- **Devolve:** `ResultadoLogin` (token, perfil e permissões efetivas).
- **Efeitos:** busca o `Usuario` pelo login; compara a senha com o hash
  (bcrypt); assina o JWT com `sub`, `login`, `nome`, `perfil` e `tokenVersion`;
  carrega os ajustes de perfil (`PerfilPermissao`) e os ajustes por login para
  calcular as permissões efetivas.
- **Erros:** `CredenciaisInvalidasError` (login inexistente ou senha incorreta).

#### `autorizar(perfil, funcionalidade)` / `exigirAutorizacao(...)`
Decidem o acesso por perfil (delegando a `decidirAutorizacao`). `autorizar`
retorna booleano; `exigirAutorizacao` lança `PermissaoInsuficienteError` quando
negado (usado pelos guards).

#### `exigirAlgumaAutorizacao(perfil, funcionalidades)`
Autoriza se **pelo menos uma** das funcionalidades for permitida (semântica OR),
para endpoints compartilhados entre fluxos (ex.: status do dia visível na
Importação ou no Fechamento). Lança `PermissaoInsuficienteError` se nenhuma.

#### `exigirAlgumaAutorizacaoDoUsuario(usuario, funcionalidades)`
Igual ao anterior, mas considerando os ajustes por perfil e por login carregados
em `request.usuario` (`decidirAutorizacaoComOverrides`). É a autorização que vale
de verdade nos endpoints (usada pelo `PerfilGuard`).

#### `loginDisponivel(login)`
Verifica se o login ainda está livre (unicidade/exclusividade — Req 7.1.4/7.1.6),
apoiando-se na restrição de unicidade de `Usuario.login`.

#### `gerarHashSenha(senha)`
Gera o hash bcrypt (10 rounds) para persistência de credenciais, centralizando o
custo do algoritmo.

#### `identidade(usuario)`
Recompõe a identidade do usuário autenticado, buscando o `nome` atual no banco
(mesmo que o token seja antigo) e recalculando as permissões efetivas.

## 6. Lógica de domínio (funções puras)
- `decidirAutorizacao(perfil, funcionalidade)` → acesso por perfil:
  `ADMINISTRADOR` sempre autorizado (inclusive funcionalidades futuras);
  `GERENTE`/`SUPERVISOR`/`FISCAL`/`IMPORTADOR` conforme o conjunto do perfil.
- `decidirAutorizacaoComOverrides(...)` → aplica as três camadas: base de código
  → ajustes de perfil → ajustes por login (precedência: login vence perfil, que
  vence o código); protegidas nunca são ajustadas; `ADMINISTRADOR` é imutável.
- `conjuntoBaseDoPerfil` / `conjuntoEfetivoDoPerfil` / `permissoesEfetivas` →
  montam os conjuntos de funcionalidades em cada camada, sempre na ordem do
  catálogo.
- `podeSerAjustada(f)` → funcionalidade existe no catálogo e não é protegida.
- `decidirAutenticacao(...)` → decisão pura de acesso: concede sse existir
  usuário com aquele login e senha correspondente.
- `loginDisponivelEntre(...)` / `loginsSaoUnicos(...)` → invariantes de
  unicidade/exclusividade de login.

## 7. Estados e enums
- `Perfil`: `ADMINISTRADOR` · `GERENTE` · `SUPERVISOR` · `FISCAL` · `IMPORTADOR`.
- `TODAS_FUNCIONALIDADES`: catálogo completo (fonte única de verdade); espelhado
  no app em `mobile/src/auth/funcionalidades.ts`.
- Conjuntos por perfil: `FUNCIONALIDADES_FISCAL`, `FUNCIONALIDADES_SUPERVISOR`
  (fiscal + fechamento/edição/central de jornada), `FUNCIONALIDADES_GERENTE`,
  `FUNCIONALIDADES_IMPORTADOR` (só `IMPORTACOES`).
- `FUNCIONALIDADES_PROTEGIDAS`: exclusivas do administrador e não ajustáveis
  (`USUARIOS_CRUD`, `ADMIN_DADOS`, `ESCALA_DOMINGO_CONFIG`, `IMPORTACOES`,
  `PERMISSOES_GERENCIAR`, `CARGA_STATUS_VISUALIZAR`).

## 8. Dados que o módulo toca
- **Lê:** `Usuario` (login, senhaHash, perfil, nome, tokenVersion, permissões),
  `PerfilPermissao` (ajustes de perfil), `UsuarioPermissao` (ajustes por login).
- **Escreve:** nada diretamente (a criação/edição de contas fica em `usuarios` e
  `colaboradores`).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `JwtService` (`@nestjs/jwt`), `bcrypt`,
  `resolverSegredoJwt` (config do segredo).
- **É usado por:** os guards da camada de API (autenticação/autorização),
  [`usuarios`](usuarios.md), [`colaboradores`](colaboradores.md) (hash/login) e
  [`permissoes`](permissoes.md) (reutiliza o domínio de permissões).

## 10. Regras de negócio-chave
1. **Login individual e exclusivo:** cada pessoa autentica só com o seu login;
   logins são únicos (garantido pelo banco).
2. **Credenciais inválidas não distinguem** login inexistente de senha errada.
3. **Perfil define o acesso;** `ADMINISTRADOR` enxerga tudo (inclusive
   funcionalidades novas), sem depender de lista.
4. **Precedência de permissões:** ajuste por login > ajuste por perfil > padrão
   de código.
5. **Funcionalidades protegidas** nunca são concedidas por ajuste (barra
   escalada de privilégios).
6. **Sessão de 30 dias** por padrão (`JWT_EXPIRES_IN` configurável); o segredo é
   obrigatório em produção.
7. **Antiforça-bruta:** o login aceita no máximo 8 tentativas por minuto por IP.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `acessos.service.spec.ts` | Autenticação, autorização por perfil e disponibilidade de login | 9 |
| `acessos.controller.spec.ts` | Login (sucesso/erro) e identidade em `/eu` | 3 |
| `acessos.permissoes.spec.ts` | Invariantes da fonte única (admin vê tudo; sem permissão fantasma) | 3 |
| `acessos.properties.spec.ts` | Propriedades de autenticação/autorização e unicidade de login (property-based) | 3 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Espelho manual no app:** `mobile/src/auth/funcionalidades.ts` precisa
  refletir qualquer mudança no catálogo/perfis; os pacotes não compartilham
  código. A autorização que vale é sempre a do backend.
- 🔧 `acessos.domain.ts` (527 linhas) concentra catálogo e regras dos perfis;
  cresce a cada nova funcionalidade — manter a ordem do catálogo e os testes-
  guarda evita "permissão fantasma".
- ⛔ **Segredo do JWT em produção:** se `resolverSegredoJwt` não encontrar o
  segredo, a API falha rápido (comportamento intencional) — cuidar da variável
  de ambiente no deploy.
