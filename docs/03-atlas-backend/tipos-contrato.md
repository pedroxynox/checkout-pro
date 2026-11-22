> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `backend/src/tipos-contrato/`

# Módulo: `tipos-contrato`

## 1. Propósito
Catálogo editável de **tipos de contrato de jornada** (data-driven): a gestão
cria, edita, ativa/desativa e remove contratos pela UI — cada um com seus
parâmetros de jornada (carga base e de feriado, intervalos, limites de extras e
TAC, teto diário, folgas por semana) — sem tocar no código.

## 2. Responsabilidades e limites
- **Faz:** CRUD dos tipos de contrato; valida a coerência dos limites; protege o
  contrato **padrão** (não desativa/remove) e os que estão **em uso** (não
  remove e **trava as regras de cálculo**); duplica um contrato; troca o padrão;
  converte
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
| `tipos-contrato.controller.ts` | Rotas HTTP do catálogo | 92 |
| `tipos-contrato.service.ts` | Regras de aplicação: CRUD, validação, trava de uso, duplicar, padrão, cache | 555 |
| `tipos-contrato.adapter.ts` | Regras puras: modelo (min) → `RegrasContrato` (ms) | 53 |
| `tipos-contrato.module.ts` | Ligações (DI) do módulo | 15 |
| `dto/tipos-contrato.dto.ts` | Validação de entrada das rotas | 273 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `tipos-contrato`](../05-referencia-dados/api-http.md#tipos-contrato). Aqui explicamos o que cada rota faz. Todo o controller exige `ADMIN_DADOS` (afeta o cálculo de horas/folha).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /tipos-contrato` | `ADMIN_DADOS` | Lista os contratos (o padrão vem primeiro; `incluirInativos=1` traz os desativados), cada um com `emUso`. |
| `POST /tipos-contrato` | `ADMIN_DADOS` | Cria um novo tipo de contrato (sem `folgasPorSemana`, nasce com 2). |
| `PATCH /tipos-contrato/:id` | `ADMIN_DADOS` | Edita um tipo de contrato. Em uso: só nome, descrição e ativo (regra que muda → 409). |
| `PATCH /tipos-contrato/:id/ativo` | `ADMIN_DADOS` | Ativa/desativa (o padrão não pode ser desativado). |
| `PATCH /tipos-contrato/:id/padrao` | `ADMIN_DADOS` | Torna o contrato o padrão (precisa estar ativo; 409 se houver batida sem ficha). |
| `POST /tipos-contrato/:id/duplicar` | `ADMIN_DADOS` | Cria uma cópia **inativa** e editável, com nome "(cópia)". |
| `DELETE /tipos-contrato/:id` | `ADMIN_DADOS` | Remove (o padrão e os em uso não podem ser removidos). |

## 5. Serviços e funções

### `TiposContratoService`

#### `listar(incluirInativos = false)`
Lista os contratos (só ativos por padrão), com o **padrão** em primeiro e ordem
alfabética. Cada item traz `emUso`: alguma ficha ou vigência o usa, ou ele é o
padrão (uma consulta só, com `_count`).

#### `criar(dto)`
- **Efeitos:** valida a coerência dos limites; exige nome livre; grava o
  contrato (`padrao: false` sempre — o padrão muda só por `definirPadrao`);
  invalida o cache.
- **Padrões dos campos novos:** `folgasPorSemana` 2, `cargaFeriadoMin` 440,
  `feriadoAdicional100` true, `limiteTrabalhoDiaMin` null, `folgasFixasPadrao`
  vazio, `permiteFolgaSabado` false.
- **Erros:** `BadRequestException` (coerência), `ConflictException` (nome).

#### `atualizar(id, dto)`
- **Trava de uso** (spec `jornada-5x2`, R2.8): se um **campo de regra** muda
  (`CAMPOS_REGRA`: carga, dias a 100%, intervalos, limites, avisos, feriado, teto
  diário, folgas…) e o contrato está em uso (fichas + vigências > 0, ou é o
  padrão), recusa com `ConflictException` citando os campos. Só conta o valor que
  **muda**: a tela antiga reenvia todos os campos e renomear continua possível.
- Valida a coerência sobre o estado resultante (atual + alterações); impede
  desativar o padrão; grava só os campos de regra que mudaram; invalida o cache.

#### `definirPadrao(id)`
Troca o padrão numa transação (`updateMany` dos antigos + `update` do novo).
Exige o contrato **ativo**. Recusa (`ConflictException`) enquanto houver batida
sem ficha (`BatidaPonto.colaboradorId` nulo): o padrão decide **todos** os dias
dessas batidas, e trocá-lo mudaria horas já calculadas.

#### `duplicar(id)`
Copia os `CAMPOS_REGRA` e a descrição para um contrato novo, **inativo** e não
padrão, com nome "X (cópia)" (ou "(cópia 2)", … o primeiro livre, até 60
letras). É o caminho para mudar as regras de um contrato em uso.

#### `definirAtivo(id, ativo)` / `remover(id)`
Alternam `ativo` (o padrão não pode ser desativado) ou removem o contrato (o
padrão e os que estão **em uso** não podem ser removidos — com contagem de quantos
usam). "Em uso" conta as fichas (`Colaborador.tipoContratoJornadaId`) **e as
vigências da jornada** ([`jornada-vigencia`](jornada-vigencia.md)): um contrato que
só aparece no histórico ainda decide os dias daquele período.

#### `regrasDoContrato(id?)`
- **Devolve:** as `RegrasContrato` de um contrato (via `regrasContratoDeModelo`),
  com cache; cai no contrato padrão do banco quando o id é ausente/desconhecido,
  e no `REGRAS_PADRAO` do código se nem o padrão existir.

#### `regrasDoColaborador(colaboradorId, dia)` e `resolvedorDeRegras(colaboradorId)`
- **O dia é obrigatório** ([ADR 0027](../02-arquitetura/decisoes/0027-vigencia-da-jornada.md)): vale o contrato da vigência da jornada daquele dia; antes da primeira vigência, o da ficha. `resolvedorDeRegras` carrega tudo uma vez e devolve `dia → regras`, para os relatórios do mês.

Resolve as regras pelo contrato atribuído ao colaborador (ou o padrão). É o
ponto de entrada do cálculo por pessoa usado por [`ponto`](ponto.md) e
[`central-jornada`](central-jornada.md).

#### `validarCoerencia(...)` (privado)
Garante: carga base com 7 valores; dias com 100% entre 0 e 6; intervalo mínimo
< máximo; limites crescentes (1º aviso ≤ 2º aviso ≤ limite de extras); folgas
padrão entre 0 e 6, sem repetição, no máximo `folgasPorSemana`, e sábado só com
`permiteFolgaSabado`.

## 6. Lógica de domínio (funções puras)
- `regrasContratoDeModelo(modelo)` (`tipos-contrato.adapter.ts`) → converte uma
  linha `TipoContratoJornada` (minutos) em `RegrasContrato` (ms); as "funções"
  `cargaBaseMs`/`temAdicional100` viram lookups sobre os arranjos guardados.
- **A jornada do FERIADO é coluna própria** (`cargaFeriadoMin`, migração
  `9zzv_contrato_5x2`; 440 = 7h20 no 6x1). Não é `cargaBaseMinPorDia[0]` de
  propósito — um contrato de quem folga fixo no domingo tem esse dia em **zero**,
  e ler dali fazia todo feriado esperar zero hora (jornada inteira como extra a
  100%, com TAC). Ver
  [ADR 0018](../02-arquitetura/decisoes/0018-feriado-jornada-do-dia-real.md).
- Também vêm das colunas: `feriadoAdicional100`, `limiteTrabalhoDiaMs` (null =
  sem teto), `folgasPorSemana`, `folgasFixasPadrao` e `permiteFolgaSabado`.
- `diaNaFaixa(diaSemana)` → normaliza o dia para 0..6.

## 7. Estados e enums
- `TipoContratoJornada` (Prisma): registro editável com os parâmetros de jornada
  em minutos. Flags relevantes: `ativo`, `padrao`, `intervaloObrigatorio`,
  `trabalhaDomingo` (só o regime legado), `feriadoAdicional100`,
  `permiteFolgaSabado`. `riscoTac1h30Min`/`riscoTac1h40Min` mantêm o nome (APK
  antigo), mas são o **1º e o 2º aviso** em minutos de extra.
- Não há máquina de estados: o único invariante forte é **existir sempre um
  contrato padrão** (fallback do cálculo), que não pode ser desativado/removido.

## 8. Dados que o módulo toca
- **Escreve/Lê:** `TipoContratoJornada` (o catálogo).
- **Lê:** `Colaborador` e `JornadaVigencia` (contagem de uso; contrato do dia em
  `regrasDoColaborador`); `BatidaPonto` (batidas sem ficha, em `definirPadrao`).
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
3. **Contrato em uso não é removido** (reatribua ou apenas desative). Uso inclui o
   histórico: contrato referenciado por vigência da jornada só pode ser desativado.
   As **regras de cálculo** de um contrato em uso também não mudam: duplica-se e
   aplica-se a cópia com vigência. Nome, descrição e ativo continuam editáveis.
4. **Coerência dos limites** validada no servidor (crescentes; mínimo < máximo).
   A carga base **pode ser zero** num dia, e é o correto para um contrato que não
   trabalha aquele dia — num domingo REAL trabalhado, tudo conta como extra. O que
   um zero ali **não** afeta é o feriado: a jornada do feriado é a coluna
   `cargaFeriadoMin` (ver seção 6).
5. **Parâmetros em minutos na UI**, convertidos para ms no cálculo.
6. **Só administrador** (`ADMIN_DADOS`) mexe no catálogo — afeta horas/folha.
7. **Cache invalidado em qualquer mutação** (as regras mudam pouco).
8. **Vínculo obrigatório:** todo colaborador pertence a um tipo de contrato
   (fonte única de jornada/TAC); sem escolha, o cadastro conecta o **padrão**
   (Fase 0 do spec `solidez-contratos-jornada`). O enum legado `TipoContrato`
   foi removido.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `tipos-contrato.service.spec.ts` | CRUD, coerência (folgas padrão), proteção do padrão/em uso, trava de regras em uso, duplicar, tornar padrão, `emUso`, regras do colaborador **no dia** e o resolvedor por dia | 23 |
| `tipos-contrato.adapter.spec.ts` | Conversão modelo (min) → `RegrasContrato` (ms), feriado e teto diário das colunas | 7 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Nome parecido com [`contratos`](contratos.md):** aqui são os contratos de
  **jornada** (regras de cálculo); lá é o contrato de **experiência** (45+45).
- 🔧 O cache de regras é por instância (em memória) e limpo em cada mutação; com
  múltiplas instâncias, uma edição só reflete nas demais no próximo ciclo/refresh.
- ⚠️ Hoje existe só o contrato vigente (6x1–2x1) como padrão. O 5x2 44h é criado
  pelo dono depois do deploy da Fase 2 (spec `jornada-5x2`, tarefa 2.8) e só
  passa a valer com as vigências da Fase 4.
- ⚠️ `definirPadrao` fica bloqueado enquanto existir batida sem ficha; trocar o
  padrão não é necessário para o 5x2 (cada vigência aponta o contrato).
