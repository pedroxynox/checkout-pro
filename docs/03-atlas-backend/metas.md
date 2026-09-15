> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `backend/src/metas/`

# Módulo: `metas`

## 1. Propósito
Fonte única das **metas mensais** dos indicadores (Centro de Controle ▸ Metas):
resolve o valor alvo de cada tipo para um período mensal (`AAAA-MM`) e permite ao
gestor definir as metas **digitadas**. A meta de `VENDAS` é **derivada** — é a
soma das estimativas diárias do mês e não se digita (ver
[ADR 0017](../02-arquitetura/decisoes/0017-meta-de-vendas-derivada-das-estimativas.md)).

## 2. Responsabilidades e limites
- **Faz:** lista as metas dos 5 tipos para um mês (valor resolvido + metadados);
  define (cria/atualiza) as metas digitadas; resolve o valor de qualquer meta,
  calculando a de `VENDAS` a partir das estimativas diárias.
- **Não faz:** cálculo/coloração dos indicadores em si (fica em
  [`arrecadacao`](arrecadacao.md) e [`vendas`](vendas.md), que **consomem** este
  serviço); o **cadastro** das estimativas diárias (fica em
  [`vendas`](vendas.md) — aqui elas são apenas somadas); a meta global de
  `TROCO_SOLIDARIO` (segue por `MetaIndicador`/CONFIG em `arrecadacao`).

## 3. Arquivos do módulo
| Arquivo | Papel |
|---|---|
| `metas.controller.ts` | Rotas HTTP (listar e definir metas do mês) |
| `metas.service.ts` | Regras de aplicação: resolver, listar e definir |
| `metas.domain.ts` | Regras puras: tipos, config, meta derivada, período |
| `metas.errors.ts` | Erro de domínio: meta derivada não é editável |
| `metas.module.ts` | Ligações (DI) do módulo |
| `dto/metas.dto.ts` | Validação de entrada das rotas |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `metas`](../05-referencia-dados/api-http.md#metas).

O controller inteiro exige `OPERADORES_CRUD` (gestor), como o restante do Centro
de Controle.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /metas` | `OPERADORES_CRUD` | Lista as metas dos indicadores para o mês (`AAAA-MM`). |
| `POST /metas` | `OPERADORES_CRUD` | Define (cria/atualiza) a meta de um indicador digitado no mês. Recusa `VENDAS` com **409**. |

## 5. Serviços e funções

### `MetasService`

#### `resolver(tipo, anoMes)`
- **Recebe:** o tipo de meta e o período mensal (`AAAA-MM`).
- **Devolve:** o valor numérico da meta.
- **Efeitos:** apenas leitura.
- **Regras aplicadas:** dois regimes.
  - **`VENDAS` (derivada):** soma as estimativas diárias do mês
    (`EstimativaVendaDia`) via `metaDeEstimativas`. Ignora qualquer registro em
    `MetaMensal` para `VENDAS` e **não** consulta mais a meta legada de
    `ConfigVendas`. Mês sem estimativas → `0` ("meta ainda não definida").
  - **Demais tipos (digitados):** registro salvo em `MetaMensal` (tipo+anoMes) e,
    na falta dele, o valor padrão de `CONFIG_METAS`. Tolera a tabela ainda não
    migrada (try/catch).

#### `somarEstimativas(anoMes)` _(privado)_
- Soma as estimativas do mês lendo `EstimativaVendaDia` **direto pelo Prisma**.
  É deliberado: `VendasService` já depende do `MetasService`, então injetá-lo
  aqui criaria dependência circular. Falha (período inválido/tabela ausente)
  resolve `0` em vez de derrubar a chamada.

#### `listar(anoMes)`
- **Devolve:** os 5 tipos com valor resolvido, título, unidade, sentido e:
  - `definida` — nas digitadas, "há registro salvo"; em `VENDAS`, "há estimativas
    no mês" (meta > 0);
  - `derivada` — `true` só em `VENDAS`; a tela usa isso para exibir a meta como
    somente leitura;
  - `origem` — frase curta explicando de onde vem o valor.

#### `definir(tipo, anoMes, meta, atualizadoPor?)`
- **Efeitos:** upsert em `MetaMensal` por tipo+mês; devolve a visão atualizada
  com `definida: true`.
- **Regra:** **recusa tipos derivados** lançando `MetaDerivadaNaoEditavelError`
  (409) — a meta de `VENDAS` só muda pelas estimativas.

## 6. Lógica de domínio (funções puras)
- `TIPOS_META` / `ehTipoMeta(v)` — tipos acompanhados por mês (`VENDAS`,
  `RECARGAS_CELULAR`, `CANCELAMENTO_ITENS`, `CANCELAMENTO_CUPOM`, `DEVOLUCOES`).
- `TIPOS_META_DERIVADA` / `ehMetaDerivada(tipo)` — tipos **calculados** a partir
  de outro dado do sistema, em vez de digitados. Hoje só `VENDAS`.
- `metaDeEstimativas(valores)` — a meta de `VENDAS`: soma das estimativas
  diárias, arredondada em 2 casas. Ignora valores não finitos e nunca devolve
  negativo; lista vazia → `0`. **Compartilhada** com
  `VendasService.listarEstimativas` (`totalMes`), para que Central de Vendas e
  Painel de Vendas mostrem o mesmo número.
- `intervaloDoMes(anoMes)` — intervalo `[início, fim)` do mês em UTC, com fim
  exclusivo (pronto para o `where` do Prisma). Lança `RangeError` fora do
  formato `AAAA-MM`.
- `CONFIG_METAS` — por tipo: título, unidade (`REAIS`/`PERCENTUAL`), sentido e
  valor padrão.
- `ehAnoMesValido(v)` — valida o formato `AAAA-MM`.
- `anoMesDe(data)` — período mensal (`AAAA-MM`) da data, em UTC.

## 7. Estados e enums
- `TipoMeta`: `VENDAS` (derivada) · `RECARGAS_CELULAR` · `CANCELAMENTO_ITENS` ·
  `CANCELAMENTO_CUPOM` · `DEVOLUCOES`.
- `UnidadeMeta`: `REAIS` · `PERCENTUAL`.
- Sentido: `MAIOR_MELHOR` · `MENOR_MELHOR`.

## 8. Dados que o módulo toca
- **Escreve:** `MetaMensal` (apenas metas digitadas).
- **Lê:** `MetaMensal` e `EstimativaVendaDia` (soma da meta de `VENDAS`).
- **Não lê mais:** `ConfigVendas` — a meta legada foi desativada (ADR 0017).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`.
- **É usado por:** `arrecadacao` (via `ArrecadacaoService.metaDe`), `vendas` (via
  `VendasService.painelResumo`/avisos) e `assistente` (contexto de vendas do
  Cluby); exporta o `MetasService`.

## 10. Regras de negócio-chave
1. **Metas são por período mensal** (`AAAA-MM`); cada tipo tem um valor por mês.
2. **A meta de `VENDAS` é a soma das estimativas diárias do mês** — fonte única,
   sem valor digitado e sem sobreposição manual.
3. **Tentar digitar a meta de `VENDAS` falha com 409**, apontando para a Central
   de Vendas. Falha explícita em vez de "salvo, mas ignorado".
4. **As quatro metas digitadas seguem inalteradas:** registro salvo do mês e, na
   falta dele, o valor padrão de `CONFIG_METAS`.
5. Mês de `VENDAS` sem estimativas resolve **`0`**, lido como "meta ainda não
   definida" (painel sem comparação).
6. `TROCO_SOLIDARIO` **não é gerido aqui** (segue a meta global em `arrecadacao`).
7. A meta não pode ser negativa (validação no DTO e no domínio).

## 11. Testes
| Arquivo | Cobre |
|---|---|
| `metas.domain.spec.ts` | Domínio puro: `ehMetaDerivada` (só `VENDAS`; as outras quatro seguem digitadas), `metaDeEstimativas` (soma, arredondamento, mês vazio, valores não finitos, sem negativo) e `intervaloDoMes` (mês em UTC, virada de ano, formato inválido). |
| `metas.service.spec.ts` | Wiring com Prisma mockado: `resolver('VENDAS')` soma as estimativas, ignora registro em `MetaMensal`, **não** consulta `ConfigVendas`, tolera tabela ausente e consulta só o intervalo do mês; metas digitadas mantêm salvo → padrão; `definir('VENDAS')` lança `MetaDerivadaNaoEditavelError` sem gravar; `listar` marca `derivada`/`definida`/`origem`. |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 O fallback silencioso via try/catch (tabela não migrada) pode mascarar erros
  reais de banco; convém logar quando cair no `catch`.
- ⚠️ **Registros antigos de `MetaMensal(tipo='VENDAS')` ficam inertes:** não são
  apagados, mas deixam de ser lidos. Uma limpeza pode ser feita numa migração
  dedicada.
- ⚠️ **Permissões desalinhadas:** a meta de `VENDAS` é definida por quem tem
  `PAINEL_VENDAS_EDITAR` (Central de Vendas), enquanto a tela de Metas exige
  `OPERADORES_CRUD`. Não há exposição nova (a meta já era visível no painel a
  esse público), mas as duas permissões deveriam convergir.
- ⚠️ **Fuso nas bordas do mês:** aqui o mês é calculado em **UTC**
  (`anoMesDe`/`intervaloDoMes`) e a Central de Vendas monta o mês em **Brasília
  (UTC−3)**; nas primeiras/últimas horas do mês pode haver divergência
  (pré-existente).
- 🔜 A tabela `config_vendas` ficou **obsoleta** e pode ser removida numa
  migração dedicada.
