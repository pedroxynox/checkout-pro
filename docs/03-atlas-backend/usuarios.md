> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/usuarios/`

# Módulo: `usuarios`

## 1. Propósito
Gestão administrativa das **contas de acesso** ao app: cadastrar pessoas (login
por matrícula), listar, redefinir senha e remover — revogando o acesso quando
preciso.

## 2. Responsabilidades e limites
- **Faz:** CRUD das contas de acesso (`Usuario`), com login igual à matrícula;
  garante a unicidade da matrícula; gera o hash da senha (via
  [`acessos`](acessos.md)); redefine senha invalidando as sessões antigas;
  remove a conta limpando o vínculo "fantasma" na ficha do colaborador; impede a
  auto-exclusão.
- **Não faz:** autenticar ou decidir autorização (fica em
  [`acessos`](acessos.md)); ajustar permissões por login/perfil (fica em
  [`permissoes`](permissoes.md)); o cadastro unificado de pessoas e a criação
  automática de conta na promoção (fica em [`colaboradores`](colaboradores.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `usuarios.controller.ts` | Rotas HTTP de gestão de contas | 61 |
| `usuarios.service.ts` | Regras de aplicação: CRUD, hash, remoção | 144 |
| `usuarios.errors.ts` | Erros de domínio (mapeados para HTTP) | 42 |
| `usuarios.module.ts` | Ligações (DI); importa `AcessosModule` | 19 |
| `dto/usuarios.dto.ts` | Validação de cadastro e redefinição de senha | 37 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `usuarios`](../05-referencia-dados/api-http.md).
> Toda a área exige `USUARIOS_CRUD` (não pertence ao fiscal; na prática, só o
> administrador — funcionalidade protegida).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /usuarios` | `USUARIOS_CRUD` | Lista as contas (sem expor o hash), ordenadas por perfil e nome. |
| `POST /usuarios` | `USUARIOS_CRUD` | Cadastra uma pessoa (login = matrícula); rejeita matrícula duplicada. |
| `PATCH /usuarios/:id/senha` | `USUARIOS_CRUD` | Redefine a senha e invalida as sessões antigas. |
| `DELETE /usuarios/:id` | `USUARIOS_CRUD` | Remove a conta (revoga o acesso); não permite excluir a própria. |

## 5. Serviços e funções

### `UsuariosService`

#### `listar()`
- **Devolve:** lista de `UsuarioResumo` (id, matrícula, nome, perfil, criadoEm),
  **sem** o hash de senha, ordenada por perfil e nome.

#### `cadastrar({ matricula, nome, perfil, senha })`
- **Devolve:** o `UsuarioResumo` criado.
- **Efeitos:** verifica a disponibilidade do login (matrícula); gera o hash da
  senha; cria o `Usuario` com `login = matricula`.
- **Erros:** `MatriculaDuplicadaError` (login já em uso).

#### `redefinirSenha(id, senha)`
- **Efeitos:** gera o novo hash e **incrementa o `tokenVersion`**, invalidando
  imediatamente os JWTs emitidos antes da troca (o guard compara a versão).
- **Erros:** `UsuarioNaoEncontradoError`.

#### `remover(id, solicitanteId)`
- **Efeitos:** numa transação, limpa o vínculo `Colaborador.usuarioId` (escalar
  sem FK, para não deixar "vínculo fantasma"), apaga as notificações (relação
  obrigatória) e remove o `Usuario`. As demais relações com FK opcional (Fiscal,
  importações, movimentos) ficam com referência nula, e o registro de `Fiscal` é
  preservado (histórico de escala/jornada).
- **Regra:** impede a **auto-exclusão** (o solicitante não remove a si mesmo).
- **Erros:** `OperacaoInvalidaError` (auto-exclusão), `UsuarioNaoEncontradoError`.

## 6. Lógica de domínio (funções puras)
Não se aplica: o módulo não tem `*.domain.ts`. As decisões puras de unicidade de
login e o hash de senha vivem em [`acessos`](acessos.md) (`loginDisponivel`,
`gerarHashSenha`), reutilizadas por este serviço.

## 7. Estados e enums
- `perfil` da conta: `GERENTE` · `ADMINISTRADOR` · `SUPERVISOR` · `FISCAL` ·
  `IMPORTADOR` (validado no DTO; ver [`acessos`](acessos.md)).

## 8. Dados que o módulo toca
- **Escreve:** `Usuario` (cria/atualiza/remove), `Colaborador.usuarioId`
  (limpeza do vínculo na remoção), `Notificacao` (apaga na remoção),
  `Usuario.tokenVersion` (invalidação na troca de senha).
- **Lê:** `Usuario` (listagem/verificações).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` e `AcessosService` (hash de senha e
  disponibilidade de login).
- **É usado por:** o app (tela de gestão de pessoas/acessos, no Centro de
  Controle).

## 10. Regras de negócio-chave
1. **Login = matrícula**, único no sistema (rejeita duplicidade).
2. **Senha com no mínimo 6 caracteres** (validação no DTO), sempre armazenada
   como hash bcrypt.
3. **Trocar a senha invalida as sessões antigas** (bump de `tokenVersion`).
4. **Ninguém exclui a si mesmo** (evita o admin se auto-bloquear por engano).
5. **Remover limpa o vínculo na ficha** do colaborador (escalar sem FK), mas
   **preserva o registro de Fiscal** (histórico).

## 11. Testes
Não possui arquivos `*.spec.ts` próprios. As regras de unicidade de login e o
hash de senha reutilizados aqui são cobertos pelos testes de
[`acessos`](acessos.md).

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Vínculo escalar sem FK:** `Colaborador.usuarioId` não tem chave
  estrangeira; a limpeza na remoção é manual. Qualquer novo caminho que apague
  `Usuario` precisa repetir essa limpeza para não criar "vínculo fantasma".
- 🔧 **Sem testes dedicados:** o CRUD (em especial a transação de remoção) não
  tem specs próprias. Candidato a cobertura de serviço.
- 🔧 **Sobreposição com `colaboradores`:** contas também são criadas pelo
  cadastro unificado; manter claro qual fluxo é a fonte para cada caso durante a
  transição.
