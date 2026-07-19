> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/metas/`

# Módulo: `metas`

## 1. Propósito
Fonte única das **metas mensais** dos indicadores (Centro de Controle ▸ Metas):
resolve o valor alvo de cada tipo para um período mensal (`AAAA-MM`), com
fallback aos padrões, e permite ao gestor defini-las uma a uma.

## 2. Responsabilidades e limites
- **Faz:** lista as metas dos 5 tipos para um mês (valor resolvido + metadados);
  define (cria/atualiza) a meta de um tipo no mês; e resolve o valor de uma meta
  com fallback (registro salvo → meta legada de vendas → padrão de configuração).
- **Não faz:** cálculo/coloração dos indicadores em si (fica em
  [`arrecadacao`](arrecadacao.md) e [`vendas`](vendas.md), que **consomem** este
  serviço); a meta global de `TROCO_SOLIDARIO` (não é gerida aqui — segue por
  `MetaIndicador`/CONFIG em `arrecadacao`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `metas.controller.ts` | Rotas HTTP (listar e definir metas do mês) | 48 |
| `metas.service.ts` | Regras de aplicação: resolver, listar e definir | 125 |
| `metas.domain.ts` | Regras puras: tipos, config, validação de `AAAA-MM` | 98 |
| `metas.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/metas.dto.ts` | Validação de entrada das rotas | 27 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `metas`](../05-referencia-dados/api-http.md#metas).

O controller inteiro exige `OPERADORES_CRUD` (gestor), como o restante do Centro
de Controle.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /metas` | `OPERADORES_CRUD` | Lista as metas dos indicadores para o mês (`AAAA-MM`). |
| `POST /metas` | `OPERADORES_CRUD` | Define (cria/atualiza) a meta de um indicador no mês. |

## 5. Serviços e funções

### `MetasService`

#### `resolver(tipo, anoMes)`
- **Recebe:** o tipo de meta e o período mensal (`AAAA-MM`).
- **Devolve:** o valor numérico da meta.
- **Efeitos:** apenas leitura.
- **Regras aplicadas:** fallback em cadeia — (1) registro salvo em `MetaMensal`
  (tipo+anoMes); (2) para `VENDAS`, a meta legada de `ConfigVendas`; (3) o valor
  padrão de `CONFIG_METAS`. Tolera a tabela ainda não migrada (try/catch).

#### `listar(anoMes)`
- **Devolve:** os 5 tipos com valor resolvido, título, unidade, sentido e a marca
  `definida` (se há registro salvo, além do padrão).

#### `definir(tipo, anoMes, meta, atualizadoPor?)`
- **Efeitos:** faz upsert em `MetaMensal` por tipo+mês; devolve a visão
  atualizada com `definida: true`.

## 6. Lógica de domínio (funções puras)
- `TIPOS_META` / `ehTipoMeta(v)` — tipos configuráveis por mês (`VENDAS`,
  `RECARGAS_CELULAR`, `CANCELAMENTO_ITENS`, `CANCELAMENTO_CUPOM`, `DEVOLUCOES`).
- `CONFIG_METAS` — por tipo: título, unidade (`REAIS`/`PERCENTUAL`), sentido e
  valor padrão.
- `ehAnoMesValido(v)` — valida o formato `AAAA-MM`.
- `anoMesDe(data)` — período mensal (`AAAA-MM`) da data, em UTC.

## 7. Estados e enums
- `TipoMeta`: `VENDAS` · `RECARGAS_CELULAR` · `CANCELAMENTO_ITENS` ·
  `CANCELAMENTO_CUPOM` · `DEVOLUCOES`.
- `UnidadeMeta`: `REAIS` · `PERCENTUAL`.
- Sentido: `MAIOR_MELHOR` · `MENOR_MELHOR`.

## 8. Dados que o módulo toca
- **Escreve:** `MetaMensal`.
- **Lê:** `MetaMensal` e, no fallback de `VENDAS`, `ConfigVendas`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`.
- **É usado por:** `arrecadacao` (via `ArrecadacaoService.metaDe`) e `vendas`
  (via `VendasService.painel`/avisos); exporta o `MetasService`.

## 10. Regras de negócio-chave
1. **Metas são por período mensal** (`AAAA-MM`); cada tipo tem um valor por mês.
2. **Resolver usa fallback em cadeia** (registro salvo → meta legada de vendas →
   padrão), então nunca falta um valor.
3. `VENDAS` **herda a meta legada** do Painel de Vendas quando não há registro do
   mês (compatibilidade).
4. `TROCO_SOLIDARIO` **não é gerido aqui** (segue a meta global em `arrecadacao`).
5. A meta não pode ser negativa (validação no DTO).

## 11. Testes
Não se aplica: o módulo não possui arquivos `*.spec.ts` próprios (a validação de
período e o fallback são exercitados indiretamente por `arrecadacao`/`vendas`).

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 O fallback silencioso via try/catch (tabela não migrada) pode mascarar erros
  reais de banco; convém logar quando cair no `catch`.
- ⚠️ A coexistência da meta legada de `ConfigVendas` com `MetaMensal` para
  `VENDAS` é transitória; convém consolidar numa fonte única quando possível.
