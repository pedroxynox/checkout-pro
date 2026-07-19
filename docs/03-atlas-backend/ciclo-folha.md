> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/ciclo-folha/`

# Módulo: `ciclo-folha`

## 1. Propósito
Fechamento e reabertura do ciclo de folha de pagamento (período 26→25): depois
de revisado, fechar o ciclo bloqueia modificações ordinárias na jornada daquele
período; reabrir (com autorização) volta a permitir correções.

## 2. Responsabilidades e limites
- **Faz:** informa o estado do ciclo (aberto/fechado, quem fechou/reabriu);
  fecha e reabre o ciclo; guarda a trilha de fechamentos/reaberturas; e oferece
  `exigirCicloAberto(data)` para os demais módulos bloquearem alterações em
  período fechado.
- **Não faz** (fica em outro módulo): registrar/corrigir batidas
  (fica em [`ponto`](ponto.md)); agregar/apurar a jornada do ciclo
  (fica em [`central-jornada`](central-jornada.md)); o cálculo puro do período
  26→25 (fica em `common/datas`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `ciclo-folha.controller.ts` | Rotas HTTP (status, eventos, fechar, reabrir) | 73 |
| `ciclo-folha.service.ts` | Regras de aplicação: estado, fechar/reabrir, guard | 192 |
| `ciclo-folha.errors.ts` | Erros de domínio (mapeados para HTTP) | 26 |
| `ciclo-folha.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/ciclo-folha.dto.ts` | Validação de entrada (deslocamento do ciclo) | 11 |

> Não há `*.domain.ts`: a matemática do período é puramente reutilizada de
> `common/datas` (`periodoFolha`, `periodoFolhaDeslocado`, `rotuloPeriodoFolha`).

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `ciclo-folha`](../05-referencia-dados/api-http.md#ciclo-folha). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /ciclo-folha/status` | `CENTRAL_JORNADA` | Estado do ciclo (aberto/fechado, quem fechou/reabriu). |
| `GET /ciclo-folha/eventos` | `CENTRAL_JORNADA` | Trilha de fechamentos/reaberturas (trazabilidade). |
| `POST /ciclo-folha/fechar` | `CENTRAL_JORNADA` | Fecha o ciclo; bloqueia modificações ordinárias. |
| `POST /ciclo-folha/reabrir` | `ADMIN_DADOS` | Reabre um ciclo fechado (exige administrador). |

## 5. Serviços e funções

### `CicloFolhaService`

#### `status(deslocamento = 0)`
- **Devolve:** `EstadoCicloFolha` (período, `ABERTO`/`FECHADO`, autor/data de
  fechamento e reabertura).
- **Efeitos:** lê a linha `CicloFolha` pela âncora `inicio` (dia 26). Sem linha
  = `ABERTO`.

#### `fechar(deslocamento, usuario)`
- **Efeitos:** faz `upsert` de `CicloFolha` para `FECHADO` (gravando quem/quando
  e zerando a marca de reabertura anterior) e registra um evento `FECHADO`.

#### `reabrir(deslocamento, usuario)`
- **Efeitos:** exige que o ciclo esteja `FECHADO`; volta a `ABERTO`, grava quem
  reabriu e registra um evento `REABERTO`.
- **Erros:** `CicloNaoFechadoError`.
- Como os relatórios são calculados sob demanda, a reabertura já reflete nas
  próximas apurações (não há snapshot a invalidar).

#### `eventos(deslocamento = 0)`
Trilha de fechamentos/reaberturas do ciclo, mais recentes por último (desempate
estável por `id`).

#### `exigirCicloAberto(data)`
Lança `CicloFechadoError` (409) quando a `data` cai num ciclo `FECHADO`. É o
ponto de bloqueio usado por [`ponto`](ponto.md) (registrar/corrigir/excluir
batida) e por [`central-jornada`](central-jornada.md) (marcar débito).

## 6. Lógica de domínio (funções puras)
Não se aplica um `*.domain.ts` próprio: o período 26→25 é calculado por funções
puras de `common/datas` (`periodoFolha`, `periodoFolhaDeslocado`,
`rotuloPeriodoFolha`), reaproveitadas aqui.

## 7. Estados e enums
- `EstadoCicloFolha.status`: `ABERTO` · `FECHADO`. Transições:
  `ABERTO → FECHADO` (fechar); `FECHADO → ABERTO` (reabrir, só administrador).
- `EventoCicloView.tipo`: `FECHADO` · `REABERTO`.
- A âncora de um ciclo é o `inicio` (dia 26, 00:00 UTC); sem linha, o ciclo é
  implicitamente `ABERTO`.

## 8. Dados que o módulo toca
- **Escreve/Lê:** `CicloFolha` (estado por período), `CicloFolhaEvento` (trilha).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` e o cálculo puro de período (`common/datas`).
  É autônomo (sem outros módulos), para ser importado por Ponto e Central sem
  dependência circular.
- **É usado por:** [`ponto`](ponto.md) e [`central-jornada`](central-jornada.md)
  (bloqueio por ciclo fechado) e o app (tela de fechamento).

## 10. Regras de negócio-chave
1. **Ciclo 26→25** ancorado no dia 26 (`inicio`); deslocamento 0 = atual, ≤ 0.
2. **Sem linha = ABERTO**; só uma linha `FECHADO` bloqueia modificações.
3. **Fechar exige `CENTRAL_JORNADA`; reabrir exige `ADMIN_DADOS`** (autorização
   de administrador).
4. **Um novo fechamento zera a marca da reabertura anterior**.
5. **Reabertura não invalida snapshot** — a apuração é sempre sob demanda.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ciclo-folha.service.spec.ts` | Estado, fechar/reabrir e o guard `exigirCicloAberto` | 4 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ O bloqueio depende de os demais módulos chamarem `exigirCicloAberto`; uma
  nova rota que altere a jornada precisa lembrar de invocá-lo.
- 🔧 Não há um `*.controller.spec.ts`; as permissões (fechar × reabrir) são
  garantidas pelos decorators, mas não há teste dedicado a elas.
