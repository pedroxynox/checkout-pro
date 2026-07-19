> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/colaboradores/`

# Módulo: `colaboradores`

## 1. Propósito
Cadastro **unificado** de todas as pessoas da operação (operador, fiscal,
supervisor, gestor/gerente) num só lugar, com seus identificadores (matrícula e
login), turno, escala, contrato de jornada e conta de acesso ao app. É também a
base do **Perfil Inteligente** do colaborador (score, indicadores e insígnias).

## 2. Responsabilidades e limites
- **Faz:** CRUD de colaboradores; garante unicidade de matrícula/login; cria e
  vincula a **conta de acesso** (login do app) para quem tem função com acesso;
  mantém o registro de `Fiscal` e a **escala semanal** em sincronia com o
  cadastro; inativa/reativa preservando histórico; calcula o Perfil Inteligente;
  purga colaboradores inativos (retenção).
- **Não faz:** autenticação/permissões em si (fica em [`acessos`](acessos.md));
  cálculo de jornada/ponto (fica em [`ponto`](ponto.md) e
  [`central-jornada`](central-jornada.md)); geração da escala do dia
  (fica em [`fiscais`](fiscais.md)/[`escala-domingo`](escala-domingo.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `colaboradores.controller.ts` | Rotas HTTP do cadastro e do perfil | 222 |
| `colaboradores.service.ts` | Regras de aplicação: CRUD, conta de acesso, escala | 840 |
| `colaboradores.domain.ts` | Regras puras: normalização e turno obrigatório | 17 |
| `colaboradores.errors.ts` | Erros de domínio (mapeados para HTTP) | 111 |
| `colaboradores.module.ts` | Ligações (DI) do módulo | 39 |
| `perfil-colaborador.service.ts` | Monta o Perfil Inteligente (dados → indicadores) | 832 |
| `perfil-colaborador.domain.ts` | Regras puras: score, ranking, resumo, insígnias | 661 |
| `purga-inativos.service.ts` | Purga mensal de inativos (retenção) | 146 |
| `dto/colaboradores.dto.ts` | Validação de entrada das rotas | 241 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `colaboradores`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /colaboradores` | `OPERADORES_CRUD` | Cadastra um colaborador (operador por padrão). |
| `GET /colaboradores` | `OPERADORES_AUSENCIAS` | Lista com busca/filtros (função, turno, ativo). |
| `GET /colaboradores/logins` | `OPERADORES_CRUD` | Contas de acesso e a quem já estão vinculadas. |
| `GET /colaboradores/:id` | `OPERADORES_AUSENCIAS` | Detalhe de um colaborador (com identificadores). |
| `GET /colaboradores/:id/perfil` | `OPERADORES_AUSENCIAS` | Perfil Inteligente no período (score, indicadores, insígnias). |
| `PATCH /colaboradores/:id` | `OPERADORES_CRUD` | Edita; **cria o login na promoção** (ver §5). |
| `POST /colaboradores/:id/inativar` | `OPERADORES_CRUD` | Inativa preservando histórico. |
| `POST /colaboradores/:id/reativar` | `OPERADORES_CRUD` | Reativa e recria a escala. |
| `POST /colaboradores/:id/identificadores` | `OPERADORES_CRUD` | Associa um código "solto" (matrícula/login) do arquivo. |
| `POST /colaboradores/purga-inativos` | `ADMIN_DADOS` | Purga imediata dos inativos (exige `confirmacao: "PURGAR"`). |

## 5. Serviços e funções

### `ColaboradoresService`

#### `cadastrar(input, perfilSolicitante?)`
- **Recebe:** dados do colaborador (`ColaboradorInput`) e o perfil de quem pede.
- **Devolve:** o `Colaborador` criado.
- **Efeitos:** valida permissão de função e turno obrigatório; garante matrícula
  e login únicos; se a função dá acesso ao app, **cria a conta** (via
  `criarContaDeAcesso`) e, para fiscal, o registro de `Fiscal`; grava o
  colaborador e seus identificadores; sincroniza a escala.
- **Erros:** `MatriculaColaboradorDuplicadaError`, `LoginColaboradorDuplicadoError`,
  `SenhaAcessoObrigatoriaError`, `ContaAcessoExistenteError`,
  `PermissaoInsuficienteFuncaoError`, `TurnoObrigatorioError`.

#### `editar(id, input, perfilSolicitante?)`
- **Efeitos:** valida permissão e turno; **na promoção** (função passa a ter
  acesso e ainda não há conta — ex.: operador → fiscal), exige a senha e cria o
  login via `sincronizarContaDeAcesso`; quando já há conta, redefine
  senha/perfil/nome/login; mantém escala e vínculo em sincronia.
- **Regra-chave:** a senha é exigida **antes** de alterar o cadastro, para nunca
  deixar alguém "fiscal sem login" (ver ADR/《histórico》e §12).

#### `listar(filtro)` · `obter(id)` · `listarLogins()`
Consulta com busca/filtros; detalhe com identificadores; e a lista de contas de
acesso com a indicação de quais já estão vinculadas (alimenta o seletor no app).

#### `inativar(id)` / `reativar(id)`
Alternam `ativo`, marcam/limpam `desligadoEm` (base da retenção) e sincronizam a
escala (inativar remove do quadro; reativar recria a partir do cadastro).

#### `adicionarIdentificador(colaboradorId, valor)`
Associa um código bruto (matrícula/login que veio do arquivo e não casava) a um
colaborador, atribuindo retroativamente o histórico. Idempotente.

#### Funções privadas relevantes
- `criarContaDeAcesso(matricula, nome, senha, perfil)` — centraliza a criação do
  `Usuario` (login = matrícula; valida senha ≥ 6; garante login livre; gera hash).
- `sincronizarContaDeAcesso(atual, atualizado, input, novaMatricula)` — decide
  entre **criar** (promoção), **atualizar** (conta existente) ou **nada**.
- `garantirFiscal(usuarioId, nome, turno)` — cria/vincula o registro de `Fiscal`.
- `sincronizarEscalaFiscal(colaborador)` — regenera a escala semanal geral
  preservando exceções (Opção A: o cadastro é a fonte única).
- `grupoDomingoEfetivo(...)` — remove do rodízio de domingo quem tem contrato que
  não trabalha domingo.
- `garantirUsuarioVinculavel(...)` / `definirAtivo(...)`.

### `PerfilColaboradorService.perfil(id, inicio, fim)`
Monta o Perfil Inteligente: score de saúde, indicadores com ranking/tendência,
faltas, resumo em linguagem natural e insígnias — tudo por regras puras (sem IA).

### `PurgaInativosService.purgarInativos()`
Remove definitivamente os inativos fora da janela de retenção, preservando os
totais de arrecadação/APAE. Roda no cron mensal (dia 1º) e sob demanda.

## 6. Lógica de domínio (funções puras)
- `normalizarMatricula(v)` = `trim`; `normalizarLogin(v)` = `trim` + minúsculas.
- `funcaoExigeTurno(f)` → verdadeiro para `FISCAL`/`OPERADOR`.
- `validarTurnoObrigatorio(f, turno)` → lança se faltar turno a fiscal/operador.
- `perfilDaFuncao(f, gerenteDev?)` → `FISCAL→FISCAL`, `SUPERVISOR→SUPERVISOR`,
  `GESTOR→GERENTE|ADMINISTRADOR`, `OPERADOR→null` (sem acesso ao app).
- `validarPermissaoDeFuncao(...)` → só o gerente desenvolvedor concede acesso
  gerencial (barra escalada de privilégios).
- Perfil Inteligente (`perfil-colaborador.domain.ts`): `calcularScore`,
  `notaContribuicao/Disciplina/Assiduidade`, `rankingPorValor`,
  `metaIndividualDerivada`, `gerarResumo`, `gerarInsignias`, `montarVinculo`.

## 7. Estados e enums
- `FuncaoColaborador`: `OPERADOR` · `FISCAL` · `SUPERVISOR` · `GESTOR`.
- `TurnoColaborador`: `ABERTURA` · `INTERMEDIARIO` · `FECHAMENTO` · `APOIO`.
- `TipoContrato` / `TipoContratoJornada` (regras de jornada; ver
  [`tipos-contrato`](tipos-contrato.md)).
- Mapeamento função → `Perfil` de acesso: ver `perfilDaFuncao` em §6.

## 8. Dados que o módulo toca
- **Escreve:** `Colaborador`, `ColaboradorIdentificador`, `Usuario` (conta),
  `Fiscal`, `EscalaEntry`.
- **Lê:** `TipoContratoJornada`, `Ausencia`, `RegistroArrecadacao`,
  `VendaDiaria` (para o Perfil Inteligente).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `AcessosService` (hash/login), `PrismaService`, domínio de
  `fiscais/escala`.
- **É usado por:** o app (telas de Colaboradores e Perfil), e indiretamente por
  escala/jornada/indicadores (que consomem `Colaborador`/`Fiscal`).

## 10. Regras de negócio-chave
1. **Operador não entra no app** (sem login); fiscal/supervisor/gestor entram.
2. **Login = matrícula**; matrícula e login são únicos.
3. **Turno é obrigatório** para fiscal e operador (agrupa a escala do dia).
4. **Só o gerente desenvolvedor** concede acesso de nível gerencial.
5. **Promover cria o login** (com senha); a senha é exigida antes de alterar.
6. **O cadastro é a fonte única da escala** (Opção A): editar regenera a escala
   geral preservando exceções.
7. **Inativar preserva histórico**; a purga respeita a janela de retenção.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `colaboradores.turno-obrigatorio.spec.ts` | Turno obrigatório para fiscal/operador | 9 |
| `colaboradores.adicionar-identificador.spec.ts` | Associação de código solto (idempotência/conflito) | 4 |
| `colaboradores.promocao-acesso.spec.ts` | Promoção operador→fiscal cria o login | 3 |
| `perfil-colaborador.service.spec.ts` | Montagem do Perfil Inteligente | 8 |
| `perfil-colaborador.properties.spec.ts` | Propriedades do score/ranking (property-based) | 17 |
| `perfil-colaborador.medalhas.spec.ts` | Regras de insígnias/medalhas | 8 |
| `purga-inativos.service.spec.ts` | Retenção e preservação de totais | 4 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Despromoção não desativa o login:** ao rebaixar um fiscal/supervisor para
  operador, a conta de acesso continua ativa. Falta decidir (produto) se o acesso
  deve ser desativado/removido nesse caso.
- 🔧 `colaboradores.service.ts` (840 linhas) concentra muitas responsabilidades
  (conta, escala, contrato). Candidato a extrair sub-serviços conforme crescer.
- 🔧 Coexistência dos modelos antigos (`Operador`/`OperadorTurno`/`Fiscal`) com o
  cadastro unificado durante a transição — ver [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md).
