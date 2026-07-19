> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/permissoes/`

# Módulo: `permissoes`

## 1. Propósito
Central de Permissões (Centro de Controle, uso exclusivo do ADMINISTRADOR):
ajusta as permissões **por login** e **por perfil** como desvios do padrão de
código, com trilha de auditoria e invalidação de sessão dos afetados.

## 2. Responsabilidades e limites
- **Faz:** lista o catálogo ajustável; consulta e define os ajustes por login e
  por perfil (persistindo **apenas os desvios** em relação ao padrão);
  restaura ao padrão; registra cada mudança na trilha de auditoria; invalida a
  sessão dos afetados (bump de `tokenVersion`) para reentrarem com as novas
  permissões; expõe o histórico das últimas mudanças.
- **Não faz:** definir o catálogo, os perfis e as regras de decisão de acesso
  (isso é a fonte única de verdade em [`acessos`](acessos.md)); autenticar; o
  CRUD das contas (fica em [`usuarios`](usuarios.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `permissoes.controller.ts` | Rotas HTTP da Central de Permissões | 110 |
| `permissoes.service.ts` | Regras de aplicação: ajustes, auditoria, sessão | 424 |
| `permissoes.errors.ts` | Erros de domínio (mapeados para HTTP) | 50 |
| `permissoes.module.ts` | Ligações (DI) do módulo | 14 |
| `dto/permissoes.dto.ts` | Validação da lista de funcionalidades ligadas | 13 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `permissoes`](../05-referencia-dados/api-http.md).
> Toda a área exige `PERMISSOES_GERENCIAR` (só o ADMINISTRADOR a possui).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /permissoes/catalogo` | `PERMISSOES_GERENCIAR` | Lista as funcionalidades ajustáveis (ordem do catálogo). |
| `GET /permissoes/usuario/:id` | `PERMISSOES_GERENCIAR` | Permissões de um usuário: efetiva, padrão do perfil e se é personalizada. |
| `PUT /permissoes/usuario/:id` | `PERMISSOES_GERENCIAR` | Define as funcionalidades LIGADAS do usuário (salva só os desvios). |
| `POST /permissoes/usuario/:id/restaurar` | `PERMISSOES_GERENCIAR` | Remove os ajustes individuais (volta ao padrão do perfil). |
| `GET /permissoes/perfis` | `PERMISSOES_GERENCIAR` | Resumo dos perfis ajustáveis com contagem de itens personalizados. |
| `GET /permissoes/perfil/:perfil` | `PERMISSOES_GERENCIAR` | Padrão de um perfil: ligada, padrão de código e se é personalizada. |
| `PUT /permissoes/perfil/:perfil` | `PERMISSOES_GERENCIAR` | Define o padrão do perfil (afeta todos os usuários dele). |
| `POST /permissoes/perfil/:perfil/restaurar` | `PERMISSOES_GERENCIAR` | Remove os ajustes de perfil (volta ao padrão de código). |
| `GET /permissoes/historico` | `PERMISSOES_GERENCIAR` | Últimas mudanças (login e perfil), mais recentes primeiro. |

## 5. Serviços e funções

### `PermissoesService`

#### `catalogoAjustavel()`
Devolve as funcionalidades que o painel pode ajustar (`FUNCIONALIDADES_AJUSTAVEIS`,
na ordem do catálogo).

#### `permissoesDoUsuario(usuarioId)`
- **Devolve:** `PermissoesDoUsuario` com, para cada funcionalidade ajustável, o
  valor **efetivo**, o **padrão do perfil** e se está **personalizada**.
- **Efeitos:** lê o `Usuario` e seus ajustes; carrega os ajustes de perfil.
- **Erros:** `UsuarioPermissaoNaoEncontradoError`.
- **Observação:** para o ADMINISTRADOR, `acessoTotal = true` (tudo ligado, sem
  ajustes).

#### `definirPermissoes(usuarioId, ligadas, definidoPor?)`
- **Efeitos:** calcula os desvios em relação ao padrão **efetivo** do perfil e
  persiste apenas eles em `UsuarioPermissao`; grava a auditoria (`AJUSTE`);
  incrementa o `tokenVersion` do usuário (invalida a sessão). Idempotente.
- **Erros:** `UsuarioPermissaoNaoEncontradoError`, `UsuarioPermissaoAdminError`
  (não ajusta o administrador), `AjustePermissaoInvalidoError` (funcionalidade
  inexistente ou protegida).

#### `restaurarPadrao(usuarioId, definidoPor?)`
Remove os ajustes individuais; se havia algum, registra `RESTAURACAO` e
incrementa o `tokenVersion`. Rejeita o administrador.

#### `listarPerfis()`
Resumo dos perfis ajustáveis (`FISCAL`, `SUPERVISOR`, `GERENTE`) com a contagem
de itens personalizados.

#### `permissoesDoPerfil(perfil)` / `definirPerfil(perfil, ligadas, ...)` / `restaurarPerfil(...)`
- **`permissoesDoPerfil`:** padrão do perfil (código ± ajustes), indicando o que
  é personalizado.
- **`definirPerfil`:** salva os desvios em relação ao **código** em
  `PerfilPermissao`, audita e incrementa o `tokenVersion` de **todos** os
  usuários do perfil.
- **`restaurarPerfil`:** remove os ajustes de perfil; se havia algum, audita e
  invalida a sessão de todos.
- **Erros:** `PerfilNaoAjustavelError` (perfil não editável ou inválido),
  `AjustePermissaoInvalidoError`.

#### `historico(limite = 100)`
Últimas entradas da trilha de auditoria (limitado entre 1 e 300), mais recentes
primeiro, classificando cada uma como alvo `USUARIO` ou `PERFIL`.

## 6. Lógica de domínio (funções puras)
Não define funções puras próprias: **reutiliza** o domínio de
[`acessos`](acessos.md) — `conjuntoBaseDoPerfil`, `conjuntoEfetivoDoPerfil`,
`permissoesEfetivas`, `podeSerAjustada`, `FUNCIONALIDADES_AJUSTAVEIS`,
`PERFIS_AJUSTAVEIS`. A regra de "guardar só o desvio" (comparar o desejado com o
padrão) é aplicada aqui, mas as invariantes de acesso vivem em `acessos.domain`.

## 7. Estados e enums
- `acao` da auditoria: `AJUSTE` (mudança de funcionalidades) e `RESTAURACAO`
  (volta ao padrão; grava `funcionalidade = '*'` e `concedida = null`).
- `tipoAlvo`: `USUARIO` ou `PERFIL` (derivado da presença de `perfilAlvo`).
- `PERFIS_AJUSTAVEIS`: `FISCAL`, `SUPERVISOR`, `GERENTE` (ADMINISTRADOR e
  IMPORTADOR não são ajustáveis — ver [`acessos`](acessos.md)).

## 8. Dados que o módulo toca
- **Escreve:** `UsuarioPermissao` (ajustes por login), `PerfilPermissao`
  (ajustes por perfil), `PermissaoAuditoria` (trilha), `Usuario.tokenVersion`
  (invalidação de sessão).
- **Lê:** `Usuario` (id, login, nome, perfil, ajustes).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` e o domínio de [`acessos`](acessos.md).
- **É usado por:** o app (tela da Central de Permissões no Centro de Controle).
  As permissões que ele grava são consumidas por `acessos` no login/autorização.

## 10. Regras de negócio-chave
1. **Só o ADMINISTRADOR** acessa a Central (`PERMISSOES_GERENCIAR`).
2. **Guarda apenas desvios:** nada é duplicado do padrão; a base fica no código.
3. **Modelo de três camadas:** código → ajuste de perfil → ajuste por login.
4. **O administrador é imutável:** tentar ajustá-lo falha com erro específico.
5. **Só ajusta o ajustável:** funcionalidades inexistentes/protegidas são
   rejeitadas (barra escalada de privilégios).
6. **Toda mudança é auditada** e **invalida a sessão** dos afetados (bump de
   `tokenVersion`), forçando reentrada para as permissões valerem.
7. **Alterar um perfil afeta todos** os seus usuários (invalidação em massa).

## 11. Testes
Não possui arquivos `*.spec.ts` próprios. As invariantes de permissão que este
módulo exercita são cobertas pelo domínio de [`acessos`](acessos.md)
(`acessos.permissoes.spec.ts` e `acessos.properties.spec.ts`).

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Sem testes dedicados:** a lógica de "guardar só o desvio", a auditoria e a
  invalidação de sessão não têm specs próprias no módulo. Candidato a cobertura
  de serviço.
- 🔧 A `RESTAURACAO` grava `funcionalidade = '*'` como sentinela; consumidores do
  histórico precisam tratar esse caso especial ao exibir.
- ⛔ **Invalidação em massa:** `definirPerfil`/`restaurarPerfil` deslogam todos os
  usuários do perfil — usar com consciência do impacto operacional.
