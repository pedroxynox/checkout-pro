> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/data-inicial/`

# Módulo: `data-inicial`

## 1. Propósito
Data Inicial do Sistema: configuração global *singleton* que define o limite
inferior de datas da operação (calendários, cargas e edições) e centraliza a
regra "nenhum registro pode ser anterior à Data Inicial".

## 2. Responsabilidades e limites
- **Faz:** leitura/edição da Data Inicial (singleton `ConfigSistema`, id
  `'sistema'`, com padrão **2026-07-01**); registra quem atualizou; oferece a
  validação de data mínima compartilhada (`ValidacaoDataService`) para os demais
  módulos de carga/edição.
- **Não faz** (fica em outro módulo): a limpeza dos dados de movimento (fica em
  [`reset-operacional`](reset-operacional.md)); a validação específica de cada
  domínio (cada módulo só chama `exigirDataPermitida`); autenticação/permissão
  em si (fica em `acessos`/`permissoes`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `data-inicial.controller.ts` | Rotas HTTP (ler/editar a Data Inicial) | 41 |
| `data-inicial.service.ts` | Leitura/escrita do singleton (upsert) | 55 |
| `validacao-data.service.ts` | Validação de data mínima compartilhada | 31 |
| `data-inicial.domain.ts` | Regra pura: `data ≥ Data Inicial` (por dia, UTC) | 30 |
| `data-inicial.errors.ts` | Erro de domínio (data anterior à inicial) | 29 |
| `data-inicial.module.ts` | Ligações (DI) e exportações do módulo | 22 |
| `dto/data-inicial.dto.ts` | Validação de entrada (data ISO) | 14 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `data-inicial`](../05-referencia-dados/api-http.md#data-inicial). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /config/data-inicial` | `—` (autenticado) | Data Inicial vigente em ISO `yyyy-mm-dd` (para o app). |
| `PATCH /config/data-inicial` | `ADMIN_DADOS` | Edita a Data Inicial e registra quem atualizou. |

## 5. Serviços e funções

### `DataInicialService`

#### `obterData()`
Data Inicial vigente como `Date` (uso interno). Faz `upsert` do singleton,
criando com o padrão `2026-07-01` quando ainda não existe.

#### `obter()`
Data Inicial vigente em ISO `yyyy-mm-dd` (para o app).

#### `editar(dataISO, por?)`
Persiste uma nova Data Inicial (`upsert`) e registra `atualizadoPor`; devolve o
valor vigente em ISO.

### `ValidacaoDataService.exigirDataPermitida(data)`
- **Efeitos:** lê a Data Inicial vigente e aplica a regra pura `dataPermitida`.
- **Regras:** lança `ErroDataAnteriorInicial` (400) quando `data` é anterior à
  Data Inicial; caso contrário (igual ou posterior), retorna e o fluxo segue.
- **Uso:** ponto único reutilizado pelos módulos de carga/edição (arrecadação,
  vendas, ausências, incidências, ponto, [`checklist`](checklist.md)) — evita
  duplicar a lógica.

## 6. Lógica de domínio (funções puras)
- `inicioDoDiaUTC(d)` → milissegundos do início do dia (UTC); permite comparar
  **por dia**, ignorando a hora.
- `dataPermitida(data, dataInicial)` → `inicioDoDiaUTC(data) >=
  inicioDoDiaUTC(dataInicial)`. Fronteira: mesmo dia é permitido; um dia antes é
  rejeitado.

## 7. Estados e enums
Não há enums nem máquina de estados. O módulo mantém um único registro
*singleton* (`ConfigSistema` com `id = 'sistema'`) que guarda a Data Inicial e
quem a atualizou.

## 8. Dados que o módulo toca
- **Escreve:** `ConfigSistema` (campo `dataInicial`, `atualizadoPor`).
- **Lê:** `ConfigSistema`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`.
- **É usado por:** o app (limite inferior dos calendários) e vários módulos de
  carga/edição via `ValidacaoDataService` (exportado) — notadamente
  [`checklist`](checklist.md); também é uma das entidades **conservadas** pelo
  [`reset-operacional`](reset-operacional.md).

## 10. Regras de negócio-chave
1. **Singleton com padrão**: um único registro (`id = 'sistema'`), padrão
   `2026-07-01` na primeira leitura.
2. **Regra "data ≥ Data Inicial"** comparada **por dia** (UTC): o próprio dia é
   permitido; a véspera é rejeitada (400).
3. **Edição auditável**: `PATCH` registra quem atualizou (`atualizadoPor`).
4. **Edição restrita** a `ADMIN_DADOS`; leitura liberada a qualquer autenticado.
5. **Validação centralizada**: os demais módulos só chamam
   `exigirDataPermitida`, sem reimplementar a regra.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `data-inicial.domain.spec.ts` | Fronteira de `dataPermitida` e o erro (400, dd/mm/aaaa) | 5 |
| `validacao-data.service.spec.ts` | Rejeita anterior; aceita igual e posterior | 3 |
| `data-inicial.properties.spec.ts` | Propriedade: `dataPermitida(inicial + k dias) === (k ≥ 0)` | 2 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ Mudar a Data Inicial para uma data mais recente **não apaga** os registros
  anteriores já existentes; apenas passa a barrar novas cargas/edições anteriores
  a ela (a limpeza é do [`reset-operacional`](reset-operacional.md)).
- 🔧 O valor padrão (`2026-07-01`) está fixo no serviço; se a operação começar em
  outra data sem editar a config, o padrão pode não refletir a realidade.
