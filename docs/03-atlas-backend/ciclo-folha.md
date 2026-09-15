> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `backend/src/ciclo-folha/`

# Módulo: `ciclo-folha`

## 1. Propósito
Fechamento e reabertura do ciclo de folha de pagamento (período 26→25): depois
de revisado, fechar o ciclo bloqueia modificações ordinárias na jornada daquele
período; reabrir (com autorização) volta a permitir correções.

## 2. Responsabilidades e limites
- **Faz:** informa o estado do ciclo (aberto/fechado, quem fechou/reabriu);
  fecha e reabre o ciclo; guarda a trilha de fechamentos/reaberturas; oferece
  `exigirCicloAberto(data)` (um dia) e `exigirCiclosAbertos(inicio, fim)` (um
  período) para os demais módulos bloquearem alterações em período fechado; e
  responde que ciclos um período toca, para o app avisar antes de salvar.
- **Não faz** (fica em outro módulo): registrar/corrigir batidas
  (fica em [`ponto`](ponto.md)); agregar/apurar a jornada do ciclo
  (fica em [`central-jornada`](central-jornada.md)); o cálculo puro do período
  26→25 (fica em `common/datas`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `ciclo-folha.controller.ts` | Rotas HTTP (status, eventos, intervalo, fechar, reabrir) | 93 |
| `ciclo-folha.service.ts` | Regras de aplicação: estado, fechar/reabrir, guards, consulta de intervalo | 281 |
| `ciclo-folha.errors.ts` | Erros de domínio (mapeados para HTTP) | 39 |
| `ciclo-folha.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/ciclo-folha.dto.ts` | Validação de entrada (deslocamento do ciclo, intervalo) | 23 |

> Não há `*.domain.ts`: a matemática do período é puramente reutilizada de
> `common/datas` (`periodoFolha`, `periodoFolhaDeslocado`, `rotuloPeriodoFolha`,
> `ciclosDoIntervalo`) — ver [`common`](common.md).

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `ciclo-folha`](../05-referencia-dados/api-http.md#ciclo-folha). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /ciclo-folha/status` | `CENTRAL_JORNADA` | Estado do ciclo (aberto/fechado, quem fechou/reabriu). |
| `GET /ciclo-folha/eventos` | `CENTRAL_JORNADA` | Trilha de fechamentos/reaberturas (trazabilidade). |
| `GET /ciclo-folha/intervalo` | `CENTRAL_JORNADA`, `OPERADORES_CRUD` ou `OPERADORES_AUSENCIAS` | Ciclos tocados por um período (`inicio`/`fim`), com o estado de cada um e os dias que lhe cabem. |
| `POST /ciclo-folha/fechar` | `CENTRAL_JORNADA` | Fecha o ciclo; bloqueia modificações ordinárias. |
| `POST /ciclo-folha/reabrir` | `ADMIN_DADOS` | Reabre um ciclo fechado (exige administrador). |

> **Por que `/intervalo` tem permissão mais ampla:** quem programa atestado,
> ausência a prazo ou férias tem `OPERADORES_CRUD`/`OPERADORES_AUSENCIAS`, não
> `CENTRAL_JORNADA`. Sem essa abertura o aviso daria 403 exatamente para quem
> precisa dele. A rota é só de leitura e não expõe nada além do rótulo do ciclo,
> os dias e se está aberto ou fechado.

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
Lança `CicloFechadoError` (409) quando **um dia** cai num ciclo `FECHADO`. É o
ponto de bloqueio usado por [`ponto`](ponto.md) (registrar/corrigir/excluir
batida), por [`central-jornada`](central-jornada.md) (marcar débito),
[`fiscais`](fiscais.md) e pelas operações de **um dia** de
[`operadores`](operadores.md). A mensagem nomeia o ciclo bloqueado.

#### `exigirCiclosAbertos(inicio, fim)`
Lança `CicloFechadoError` (409) quando **qualquer** ciclo tocado pelo período
está `FECHADO`, nomeando os culpados. Resolve todos os ciclos numa **única**
consulta (`inicio: { in: [...] }`).

Existe porque um período longo pode atravessar o corte 26→25 e gravar um dia de
ausência por dia corrido: validar só o primeiro dia deixava o resto entrar num
ciclo já fechado sem controle. Usado por [`atestados`](atestados.md) (lançar e
excluir) e por [`operadores`](operadores.md) (registrar e cancelar ausência a
prazo).

#### `consultarIntervalo(inicio, fim)`
- **Devolve:** `IntervaloCiclosView` — os ciclos tocados (`rotulo`, `status`,
  `dias` que lhe cabem), `atravessaCiclos` e a lista `fechados`.
- **Efeitos:** apenas leitura, numa consulta.
- **Para que serve:** permite ao app avisar **antes** de salvar que o período
  atravessa o fechamento da folha (ou cai num ciclo fechado), sem duplicar a
  regra do dia 26 no cliente.

## 6. Lógica de domínio (funções puras)
Não se aplica um `*.domain.ts` próprio: o período 26→25 é calculado por funções
puras de [`common/datas`](common.md) — `periodoFolha`, `periodoFolhaDeslocado`,
`rotuloPeriodoFolha` e `ciclosDoIntervalo` (que recorta um intervalo nos ciclos
que ele toca) —, reaproveitadas aqui.

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
6. **Um período é bloqueado se QUALQUER ciclo que ele toca está fechado** — não
   só o do primeiro dia. Um período que começa em ciclo fechado continua sendo
   recusado por inteiro: gravar apenas a parte aberta deixaria dias faltando em
   silêncio, o que é pior que uma recusa explícita.
7. **O erro nomeia o ciclo** que trava a operação, para o gestor saber qual
   reabrir.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ciclo-folha.service.spec.ts` | Estado, fechar/reabrir, o guard de um dia (com o ciclo nomeado), `exigirCiclosAbertos` (período que começa, termina ou cabe num ciclo fechado; período invertido) e `consultarIntervalo` (travessia, reparto de dias, estado real, invertido) | 14 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ O bloqueio depende de os demais módulos chamarem o guard; uma nova rota que
  altere a jornada precisa lembrar de invocá-lo. **E de escolher o guard certo:**
  `exigirCicloAberto` para um dia, `exigirCiclosAbertos` para um período — usar o
  primeiro num período volta a deixar o resto do intervalo sem verificação.
- ⚠️ **Férias não passa por nenhum guard**, de propósito: é um intervalo único e
  não grava uma linha por dia. Mas a escala **lê** férias ao apurar, então
  registrar/cancelar férias retroativas muda o que um ciclo fechado mostra. O app
  avisa (sem bloquear); se algum dia isso precisar travar, o guard é este.
- 🔧 Não há um `*.controller.spec.ts`; as permissões (fechar × reabrir ×
  intervalo) são garantidas pelos decorators, mas não há teste dedicado a elas —
  em especial a semântica OR da rota `/intervalo`.
- 🔧 A tela do app avisa mas **não desabilita** o botão quando o ciclo está
  fechado: o backend é quem recusa. Deixar tentar e falhar com uma mensagem clara
  é aceitável, mas desabilitar seria melhor.
