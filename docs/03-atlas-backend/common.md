> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/common/`

# Módulo: `common`

## 1. Propósito
Infraestrutura **compartilhada** por todo o backend: segurança (autenticação e
autorização), tratamento uniforme de erros de domínio, observabilidade
(correlação e log de requisições), utilidades puras (datas, números,
justificativas), CORS e opções de upload.

## 2. Responsabilidades e limites
- **Faz:** guards de autenticação (JWT) e autorização (perfil/funcionalidade);
  decorators (`@Publico`, `@Funcionalidade`, `@UsuarioAtual`); filtro global que
  traduz erros de domínio em HTTP; middleware de correlação e interceptor de
  log; helpers **puros** de datas (UTC / ciclo de folha / Brasília), números,
  justificativas e CORS; relógio injetável; contratos e limites de upload;
  resolução do segredo JWT; o `SegurancaModule` (global) que liga tudo isso.
- **Não faz:** regras de negócio de qualquer domínio específico; a definição de
  quais funcionalidades o fiscal acessa e o hash de senha ficam em
  [`acessos`](acessos.md); a persistência fica em [`prisma`](prisma.md).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `seguranca.module.ts` | Módulo global: registra `JwtAuthGuard` e `PerfilGuard` | 43 |
| `guards/jwt-auth.guard.ts` | Autenticação por JWT; anexa `request.usuario`; checa revogação | 110 |
| `guards/perfil.guard.ts` | Autorização por funcionalidade (semântica OR) | 60 |
| `decorators/funcionalidade.decorator.ts` | `@Funcionalidade(...)` (metadado do guard) | 23 |
| `decorators/publico.decorator.ts` | `@Publico()` (dispensa autenticação) | 11 |
| `decorators/usuario-atual.decorator.ts` | `@UsuarioAtual()` e tipo `UsuarioAutenticado` | 36 |
| `filters/dominio-exception.filter.ts` | Filtro global de exceções → HTTP em PT | 76 |
| `errors/erro-dominio.ts` | Base `ErroDominio` com `statusHttp` próprio | 15 |
| `datas.ts` | Utilidades puras de período (UTC, folha 26→25, Brasília) | 159 |
| `numeros.ts` | `arredondar` e `parseValor` (monetário) | 37 |
| `justificativas.ts` | Peso das ocorrências por justificativa (ADR 0009) | 91 |
| `relogio.ts` | Relógio injetável (`RELOGIO`, `RelogioSistema`) | 21 |
| `cors.ts` | Origens de CORS a partir do ambiente | 15 |
| `config/jwt-secret.ts` | Resolve o segredo JWT (exige em produção) | 40 |
| `correlation-id.middleware.ts` | Id de correlação por requisição (`x-request-id`) | 43 |
| `logging.interceptor.ts` | Uma linha de log por requisição HTTP | 71 |
| `arquivo-upload.ts` | Tipo `ArquivoUpload` (espelho do multer) | 19 |
| `upload-options.ts` | Limites de upload (texto/imagem) | 21 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** É infraestrutura consumida por todos os módulos. O que
fornece:
- **Guards globais** (`JwtAuthGuard` + `PerfilGuard`) registrados via `APP_GUARD`
  no `SegurancaModule`, aplicados a **todas** as rotas por padrão.
- **Decorators** para os controllers (`@Publico`, `@Funcionalidade`,
  `@UsuarioAtual`).
- **Filtro global de exceções** (aplicado no bootstrap) e **interceptor de log**.
- **Funções puras** (datas, números, justificativas, CORS) e o **relógio
  injetável**.

## 5. Serviços e funções

### Segurança (guards)
- **`JwtAuthGuard.canActivate`** — libera rotas `@Publico()`; senão exige
  `Authorization: Bearer <token>`, valida a assinatura e **revogação** (compara
  `tokenVersion` do token com o do usuário; token de usuário removido ou versão
  antiga → *"Sessão expirada"*). Anexa `request.usuario` já com os **overrides**
  de permissão por login e por perfil (uma leitura por PK + a tabela de padrões,
  em paralelo). Mensagens em PT.
- **`PerfilGuard.canActivate`** — lê `@Funcionalidade(...)`; sem funcionalidade,
  basta estar autenticado; com uma ou mais, autoriza se o usuário tiver acesso a
  **qualquer** delas (OR), via `AcessosService.exigirAlgumaAutorizacaoDoUsuario`.

### Tratamento de erros
- **`DominioExceptionFilter.catch`** — repassa `HttpException` do Nest como
  está; traduz `ErroDominio` usando o `statusHttp` que cada erro declara; e
  mapeia qualquer outro erro para **500** sem vazar detalhes (com log).
- **`ErroDominio`** — base abstrata; default `statusHttp = 400` como fallback
  seguro (um erro novo nunca cai em 500 por esquecimento).

### Observabilidade
- **`CorrelationIdMiddleware.use`** — reaproveita `x-request-id` ou gera um novo
  (`randomUUID`); anexa em `req.correlationId` e devolve no header.
- **`LoggingInterceptor.intercept`** — registra
  `METHOD URL STATUS DURATIONms [correlationId]` ao concluir; não loga corpos;
  não-lançante.

### Configuração/segredos
- **`resolverSegredoJwt(config)`** — usa `JWT_SECRET` quando definido; em
  produção **exige** (falha rápida); em dev/teste gera um segredo efêmero
  **memoizado** por processo (compartilhado entre os `JwtModule`).
- **`origensCorsDoAmbiente()`** — lista de `CORS_ORIGINS` (vírgula) ou `true`
  (reflete a origem) quando ausente.

## 6. Lógica de domínio (funções puras)
- **Datas (`datas.ts`):** `inicioDoDia` / `inicioDoProximoDia`,
  `inicioDaSemana` / `inicioDaProximaSemana`, `inicioDoMes` /
  `inicioDoProximoMes` / `fimDoMes`; **ciclo de folha 26→25** (`periodoFolha`,
  `periodoFolhaDeslocado`, `rotuloPeriodoFolha`); **Brasília** (`diaCivilBrasilia`,
  `agoraNaBrasilia`, `diaEncerradoEmBrasilia`, `fimDoDiaBrasiliaEmUtc`,
  `OFFSET_BRASILIA_MS`). Fonte única — antes duplicadas em vários domínios.
- **Números (`numeros.ts`):** `arredondar(n)` (2 casas) e `parseValor(bruto)`
  (aceita "1.234,56" e "1234.56"; `NaN` quando não interpretável).
- **Justificativas (`justificativas.ts`):** `pesoOcorrencia(status, motivo)`
  (∈ {1, 0.02, 0.10}), `somaPonderada(...)`, `motivoObrigatorio(status)`,
  além dos enums `StatusJustificativa`/`MotivoJustificativa` e das constantes de
  peso (ver ADR 0009).

## 7. Estados e enums
- `StatusJustificativa`: `PENDENTE` · `JUSTIFICADA` · `INJUSTIFICADA`.
- `MotivoJustificativa`: `ATESTADO_MEDICO` · `ABONADA` · `LICENCA` ·
  `ATRASO_JUSTIFICADO` · `OUTRO`.
- `UsuarioAutenticado`: identidade anexada pelo `JwtAuthGuard` (`sub`, `login`,
  `nome`, `perfil`, `permissoesOverrides`, `perfilOverrides`).

## 8. Dados que o módulo toca
- **Lê:** `Usuario` (+ `permissoes`) e `PerfilPermissao` (no `JwtAuthGuard`,
  para revogação e overrides).
- **Escreve:** nada. As funções de datas/números/justificativas são puras.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `@nestjs/jwt`, `@nestjs/config`, [`acessos`](acessos.md)
  (`AcessosService`/domínio) e [`prisma`](prisma.md) (no `JwtAuthGuard`).
- **É usado por:** **todos** os módulos do backend (guards e decorators globais,
  filtro, utilidades). O `SegurancaModule` é `@Global`.

## 10. Regras de negócio-chave
1. **Autenticação por padrão:** toda rota exige JWT válido, salvo `@Publico()`.
2. **Revogação de token** por `tokenVersion` (após trocar senha/permissões).
3. **Autorização OR** por funcionalidade; sem funcionalidade, só autenticação.
4. **Erros de domínio se auto-classificam** (cada um traz seu `statusHttp`).
5. **Segredo JWT obrigatório em produção** (falha rápida; nunca segredo fixo
   versionado).
6. **Datas em meia-noite UTC** como fonte única; conversões de Brasília
   explícitas.
7. **Observabilidade nunca derruba a requisição** (log e correlação
   não-lançantes).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `guards/jwt-auth.guard.spec.ts` | Rotas públicas, tokenVersion, revogação e token ausente/inválido | 7 |
| `guards/perfil.guard.spec.ts` | Autorização por funcionalidade (gerente/fiscal) | 5 |
| `filters/dominio-exception.filter.spec.ts` | Tradução de erros de domínio/HTTP/desconhecido | 3 |
| `datas.spec.ts` | Ciclo de folha 26→25 e fim do dia em Brasília | 8 |
| `justificativas.spec.ts` | Propriedades (fast-check) do peso e soma ponderada | 4 |
| `cors.spec.ts` | Resolução de `CORS_ORIGINS` | 5 |
| `config/jwt-secret.spec.ts` | Segredo configurado/obrigatório/efêmero | 4 |
| `correlation-id.middleware.spec.ts` | Geração/reaproveitamento do `x-request-id` | 3 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Consulta por requisição no `JwtAuthGuard`** (usuário + padrões de perfil):
  necessária para revogação/overrides, mas adiciona latência a **toda** rota;
  monitorar caso o volume cresça.
- 🔧 **Offset fixo de Brasília (UTC−3)** em `datas.ts`: correto sem horário de
  verão, mas quebraria se ele voltasse; considerar biblioteca de fuso se preciso.
- 🔧 `numeros.ts` e `justificativas.ts` misturam utilidades genéricas com regra
  de negócio (peso/ADR 0009) sob "common"; aceitável, mas vigiar o escopo.
