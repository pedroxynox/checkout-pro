> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/feriados/`

# Módulo: `feriados`

## 1. Propósito
Mantém o **calendário de feriados** que afeta a jornada: reconhece os feriados
**nacionais** automaticamente e permite ao gestor cadastrar os **estaduais e
municipais**. Para a jornada, todo feriado segue a regra do domingo (100%), sem
o rodízio por grupos.

## 2. Responsabilidades e limites
- **Faz:** calcula os feriados nacionais (fixos + Sexta-feira Santa via Computus);
  cadastra/remove feriados manuais (estadual/municipal); lista o ano combinando
  automáticos e manuais; expõe consultas (`ehFeriado`, `mapaNoPeriodo`) para a jornada.
- **Não faz** (fica em outro módulo): o cálculo de horas extras/adicional em si
  (fica em [`central-jornada`](central-jornada.md), que consome estes feriados);
  o rodízio de domingo (fica em [`escala-domingo`](escala-domingo.md)); pontos
  facultativos (Carnaval, Corpus Christi) — se observados, entram como manuais.

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `feriados.controller.ts` | Rotas HTTP (listar/criar/remover) | 61 |
| `feriados.service.ts` | Regras de aplicação e persistência (Prisma) | 146 |
| `feriados.domain.ts` | Regras puras: feriados nacionais e Páscoa | 88 |
| `feriados.module.ts` | Ligações (DI); exporta o serviço | 15 |
| `dto/feriados.dto.ts` | Validação de entrada (feriado manual) | 16 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `feriados`](../05-referencia-dados/api-http.md#feriados).

O controller inteiro exige `CENTRAL_JORNADA` (mesma alçada da Central de Jornada
que consome os feriados); o fiscal (`FISCAIS_JORNADA`) não gerencia feriados.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /feriados` | `CENTRAL_JORNADA` | Lista os feriados do ano (nacionais + manuais); `?ano=` opcional. |
| `POST /feriados` | `CENTRAL_JORNADA` | Cadastra um feriado manual (estadual/municipal). |
| `DELETE /feriados/:id` | `CENTRAL_JORNADA` | Remove um feriado manual (204; 404 se não existir). |

## 5. Serviços e funções

### `FeriadosService`

#### `listarDoAno(ano)`
- **Recebe:** o ano.
- **Devolve:** `FeriadoView[]` (nacionais automáticos + manuais), ordenados por data.
- **Efeitos:** lê `Feriado` (manuais) no ano e mescla com os nacionais.
- **Regras aplicadas:** se um manual cair na data de um nacional, o **nacional
  prevalece** (o manual é omitido).

#### `mapaNoPeriodo(inicio, fimExclusivo)`
Devolve um `Map<tempo → nome>` com os feriados no período (nacionais + manuais),
usado pela Central de Jornada para saber, por dia, se é feriado (100%).

#### `adicionar(dto, autor?)`
- **Recebe:** data, nome e âmbito (`ESTADUAL`/`MUNICIPAL`) e o autor.
- **Devolve:** o `Feriado` criado.
- **Efeitos:** grava o feriado manual com auditoria (`criadoPor`).
- **Erros possíveis:** `BadRequestException` (data inválida); `ConflictException`
  (data já é feriado nacional, ou já há manual cadastrado nela).

#### `ehFeriado(data)`
Verdadeiro se a data é feriado nacional (automático) **ou** manual cadastrado.

#### `remover(id)`
Remove um feriado manual; `NotFoundException` se não existir (os nacionais não
têm registro e não são removíveis).

## 6. Lógica de domínio (funções puras)
- `domingoDePascoa(ano)` → Domingo de Páscoa (Computus de Gauss), base dos móveis.
- `feriadosNacionais(ano)` → 9 fixos (inclui Consciência Negra, 20/11) +
  Sexta-feira Santa (2 dias antes da Páscoa), ordenados por data.
- `ehFeriadoNacional(data)` → verdadeiro se a data (00:00 UTC) é feriado nacional.

## 7. Estados e enums
- `FeriadoAmbito`: `NACIONAL` (automático, não removível) · `ESTADUAL` ·
  `MUNICIPAL` (manuais, removíveis). Só `ESTADUAL`/`MUNICIPAL` são cadastráveis;
  `NACIONAL` é sempre derivado do domínio.

## 8. Dados que o módulo toca
- **Escreve:** `Feriado` (apenas os manuais).
- **Lê:** `Feriado`.
- Os feriados nacionais **não** são persistidos: são calculados em tempo de execução.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` (global).
- **É usado por:** a [`central-jornada`](central-jornada.md) (aplica a regra de
  100% nos feriados via `mapaNoPeriodo`/`ehFeriado`); o módulo **exporta** `FeriadosService`.

## 10. Regras de negócio-chave
1. **Nacionais são automáticos** (calculados, não cadastrados nem removíveis).
2. **Manuais só estadual/municipal**, com data única e sem colidir com um nacional.
3. **O nacional prevalece** sobre um manual na mesma data.
4. **Feriado segue a regra do domingo (100%)** para a jornada, sem o rodízio por grupos.
5. **Facultativos não entram automaticamente** (Carnaval/Corpus Christi): o
   gestor os cadastra manualmente se a unidade os observa.
6. **Gestão restrita a `CENTRAL_JORNADA`.**

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `feriados.domain.spec.ts` | Cálculo de Páscoa, Sexta-feira Santa e feriados fixos | 4 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 A lista de feriados nacionais fica embutida no código (`feriadosNacionais`):
  mudanças legislativas exigem alterar e reimplantar o backend.
- ⚠️ Só o domínio (cálculo) tem testes; a mesclagem/persistência do serviço
  depende de verificação por integração.
