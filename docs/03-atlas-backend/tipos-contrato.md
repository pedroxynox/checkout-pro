> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/tipos-contrato/`

# Módulo: `tipos-contrato`

## 1. Propósito
Catálogo editável de **tipos de contrato de jornada** (data-driven): a gestão
cria, edita, ativa/desativa e remove contratos pela UI — cada um com seus
parâmetros de jornada (carga base, intervalos, limites de extras e TAC) — sem
tocar no código.

## 2. Responsabilidades e limites
- **Faz:** CRUD dos tipos de contrato; valida a coerência dos limites; protege o
  contrato **padrão** (não desativa/remove) e os que estão **em uso**; converte
  os parâmetros (em minutos) para as `RegrasContrato` (em ms) que o cálculo da
  jornada consome; resolve as regras por contrato ou por colaborador (com cache).
- **Não faz** (fica em outro módulo): o cálculo da jornada em si
  (fica em [`ponto`](ponto.md) — `calcularJornadaDia`); a apuração do ciclo
  (fica em [`central-jornada`](central-jornada.md)); a atribuição do contrato a
  cada pessoa (campo `tipoContratoJornadaId` em [`colaboradores`](colaboradores.md));
  o contrato de **experiência** 45+45 (fica em [`contratos`](contratos.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `tipos-contrato.controller.ts` | Rotas HTTP do catálogo | 71 |
| `tipos-contrato.service.ts` | Regras de aplicação: CRUD, validação, cache | 284 |
| `tipos-contrato.adapter.ts` | Regras puras: modelo (min) → `RegrasContrato` (ms) | 40 |
| `tipos-contrato.module.ts` | Ligações (DI) do módulo | 15 |
| `dto/tipos-contrato.dto.ts` | Validação de entrada das rotas | 189 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `tipos-contrato`](../05-referencia-dados/api-http.md#tipos-contrato). Aqui explicamos o que cada rota faz. Todo o controller exige `ADMIN_DADOS` (afeta o cálculo de horas/folha).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /tipos-contrato` | `ADMIN_DADOS` | Lista os contratos (o padrão vem primeiro; `incluirInativos=1` traz os desativados). |
| `POST /tipos-contrato` | `ADMIN_DADOS` | Cria um novo tipo de contrato. |
| `PATCH /tipos-contrato/:id` | `ADMIN_DADOS` | Edita um tipo de contrato. |
| `PATCH /tipos-contrato/:id/ativo` | `ADMIN_DADOS` | Ativa/desativa (o padrão não pode ser desativado). |
| `DELETE /tipos-contrato/:id` | `ADMIN_DADOS` | Remove (o padrão e os em uso não podem ser removidos). |

## 5. Serviços e funções

### `TiposContratoService`

#### `listar(incluirInativos = false)`
Lista os contratos (só ativos por padrão), com o **padrão** em primeiro e ordem
alfabética.

#### `criar(dto)`
- **Efeitos:** valida a coerência dos limites; exige nome livre; grava o
  contrato (`padrao: false` sempre — o padrão é o semeado na migração); invalida
  o cache.
- **Erros:** `BadRequestException` (coerência), `ConflictException` (nome).

#### `atualizar(id, dto)`
Valida a coerência sobre o estado resultante (atual + alterações); impede
desativar o padrão; invalida o cache.

#### `definirAtivo(id, ativo)` / `remover(id)`
Alternam `ativo` (o padrão não pode ser desativado) ou removem o contrato (o
padrão e os que estão **em uso** por colaboradores não podem ser removidos —
com contagem de quantos usam).

#### `regrasDoContrato(id?)`
- **Devolve:** as `RegrasContrato` de um contrato (via `regrasContratoDeModelo`),
  com cache; cai no contrato padrão do banco quando o id é ausente/desconhecido,
  e no `REGRAS_PADRAO` do código se nem o padrão existir.

#### `regrasDoColaborador(colaboradorId?)`
Resolve as regras pelo contrato atribuído ao colaborador (ou o padrão). É o
ponto de entrada do cálculo por pessoa usado por [`ponto`](ponto.md) e
[`central-jornada`](central-jornada.md).

#### `validarCoerencia(...)` (privado)
Garante: carga base com 7 valores; dias com 100% entre 0 e 6; intervalo mínimo
< máximo; e limites crescentes (risco 1h30 ≤ risco 1h40 ≤ limite de extras).

## 6. Lógica de domínio (funções puras)
- `regrasContratoDeModelo(modelo)` (`tipos-contrato.adapter.ts`) → converte uma
  linha `TipoContratoJornada` (minutos) em `RegrasContrato` (ms); as "funções"
  `cargaBaseMs`/`temAdicional100` viram lookups sobre os arranjos guardados.
- `diaNaFaixa(diaSemana)` → normaliza o dia para 0..6.

## 7. Estados e enums
- `TipoContratoJornada` (Prisma): registro editável com os parâmetros de jornada
  em minutos. Flags relevantes: `ativo`, `padrao`, `intervaloObrigatorio`,
  `trabalhaDomingo`.
- Não há máquina de estados: o único invariante forte é **existir sempre um
  contrato padrão** (fallback do cálculo), que não pode ser desativado/removido.

## 8. Dados que o módulo toca
- **Escreve/Lê:** `TipoContratoJornada` (o catálogo).
- **Lê:** `Colaborador` (contagem de uso na remoção; contrato atribuído em
  `regrasDoColaborador`).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` e o tipo `RegrasContrato`/`REGRAS_PADRAO` de
  [`ponto`](ponto.md).
- **É usado por:** [`ponto`](ponto.md) e [`central-jornada`](central-jornada.md)
  (resolvem as regras da pessoa) e o app (Centro de Controle → tipos de contrato).

## 10. Regras de negócio-chave
1. **Data-driven**: novos contratos entram pela UI, sem mudar o código; o
   cálculo é genérico sobre `RegrasContrato`.
2. **Sempre há um contrato padrão** (semeado na migração), fallback do cálculo;
   ele não pode ser desativado nem removido.
3. **Contrato em uso não é removido** (reatribua ou apenas desative).
4. **Coerência dos limites** validada no servidor (crescentes; mínimo < máximo).
5. **Parâmetros em minutos na UI**, convertidos para ms no cálculo.
6. **Só administrador** (`ADMIN_DADOS`) mexe no catálogo — afeta horas/folha.
7. **Cache invalidado em qualquer mutação** (as regras mudam pouco).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `tipos-contrato.service.spec.ts` | CRUD, coerência, proteção do padrão/em uso e cache | 9 |
| `tipos-contrato.adapter.spec.ts` | Conversão modelo (min) → `RegrasContrato` (ms) | 5 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Nome parecido com [`contratos`](contratos.md):** aqui são os contratos de
  **jornada** (regras de cálculo); lá é o contrato de **experiência** (45+45).
- 🔧 O cache de regras é por instância (em memória) e limpo em cada mutação; com
  múltiplas instâncias, uma edição só reflete nas demais no próximo ciclo/refresh.
- ⚠️ Hoje existe só o contrato vigente (6x1–2x1) como padrão; o cabeamento por
  colaborador (`tipoContratoJornadaId`) já está pronto para novos contratos.
