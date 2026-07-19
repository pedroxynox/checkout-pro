> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/fechamento/`

# Módulo: `fechamento`

## 1. Propósito
Fechamento operacional do dia: detecta quando **todos os arquivos do dia** estão
resolvidos (as 5 arrecadações + as vendas por hora), notifica os gestores uma
única vez e expõe um **resumo inteligente** do estado do dia (arquivos +
checklists, pendências e alertas de consistência).

## 2. Responsabilidades e limites
- **Faz:** verifica se o dia está completo (`estaCompleto`); conclui e notifica
  na transição (`concluirSeCompletou`, com garantia de aviso único); e monta o
  resumo somente-leitura do dia (`resumo`).
- **Não faz:** importar arrecadações/vendas (ficam em [`arrecadacao`](arrecadacao.md)
  e [`vendas`](vendas.md), que **chamam** este serviço); a execução dos
  checklists (fica em `checklist`, do qual só lê o status); o envio das
  notificações em si (delega a [`notificacoes`](notificacoes.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `fechamento.controller.ts` | Rota HTTP do resumo do dia | 31 |
| `fechamento.service.ts` | Regras de aplicação: completo, concluir/notificar, resumo | 180 |
| `fechamento.domain.ts` | Regras puras: monta o resumo e os alertas | 186 |
| `fechamento.module.ts` | Ligações (DI) do módulo | 18 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `fechamento`](../05-referencia-dados/api-http.md#fechamento).

O controller exige `FECHAMENTO` (supervisor/gerente).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /fechamento/resumo` | `FECHAMENTO` | Resumo inteligente do dia (padrão: hoje): itens, pendências e alertas. |

## 5. Serviços e funções

### `FechamentoService`

#### `estaCompleto(data)`
- **Devolve:** `true` se cada uma das 5 arrecadações está enviada **ou** marcada
  como "sem movimento" e há vendas por hora no dia.
- **Efeitos:** apenas leitura.

#### `resumo(data)`
- **Devolve:** o `ResumoFechamento` (estado de cada item — 5 arrecadações +
  vendas + 2 checklists —, contadores, pendências e alertas) + `dataISO`.
- **Efeitos:** apenas leitura; delega a montagem à função pura
  `montarResumoFechamento`.

#### `concluirSeCompletou(data)`
- **Devolve:** `true` se o fechamento foi concluído **e notificado agora**;
  `false` se ainda incompleto ou já concluído.
- **Efeitos:** insere a marca idempotente `FechamentoConcluido` (a unicidade de
  `data` atua como **trava atômica** contra uploads concorrentes) e, ao vencer a
  corrida, notifica quem tem `FECHAMENTO`.
- **Regras aplicadas:** aviso **exatamente uma vez** por dia (P2002 = já
  concluído → não repete).

#### `notificar(dia)` (privada)
Envia aos gestores o aviso de fechamento concluído (data formatada em pt-BR/UTC);
best-effort (loga em caso de falha).

## 6. Lógica de domínio (funções puras)
- `montarResumoFechamento(entrada)` — a partir do estado bruto do dia, monta os
  itens (5 arrecadações + vendas + 2 checklists), calcula `completoArquivos`,
  `tudoPronto`, os contadores, a lista de pendentes e os alertas.
- `montarAlertas(...)` — alertas de consistência: (a) todas as 5 arrecadações
  "sem movimento" (incomum); (b) vendas enviadas com arrecadações faltando; (c)
  dia já passou com pendências.
- Um item é **resolvido** quando está `OK` ou `SEM_MOVIMENTO`; itens faltantes
  ficam `PENDENTE` (dia atual) ou `NAO_ENVIADO` (dia já passou).

## 7. Estados e enums
- `StatusItemFechamento`: `OK` · `SEM_MOVIMENTO` · `PENDENTE` · `NAO_ENVIADO`.
- `CategoriaFechamento`: `ARRECADACAO` · `VENDAS` · `CHECKLIST`.
- `StatusArrecadacaoBruto`: `ENVIADO` · `SEM_MOVIMENTO` · `PENDENTE`.
- `StatusChecklistBruto`: `FEITO` · `PENDENTE`.

## 8. Dados que o módulo toca
- **Escreve:** `FechamentoConcluido` (marca idempotente por dia).
- **Lê:** `RegistroArrecadacao`, `ArrecadacaoSemMovimento`, `VendaHora`,
  `Checklist`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` e o domínio de
  `arrecadacao` (`TIPOS_ARRECADACAO`, `CONFIG_ARRECADACAO`).
- **É usado por:** `arrecadacao` e `vendas` (chamam `concluirSeCompletou` após
  cada upload/marcação); exporta o `FechamentoService`.

## 10. Regras de negócio-chave
1. **O dia está completo** quando as 5 arrecadações estão resolvidas (enviadas ou
   "sem movimento") e há vendas por hora.
2. **A notificação de conclusão é única por dia**, garantida pela unicidade de
   `data` em `FechamentoConcluido` (trava atômica sob concorrência).
3. **"Sem movimento" conta como resolvido** para os arquivos, mas todas as 5
   marcadas assim gera um alerta de atenção.
4. Itens faltantes viram `NAO_ENVIADO` quando o dia já passou (senão `PENDENTE`).
5. O `resumo` é **somente leitura**: não altera nada nem notifica.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `fechamento.domain.spec.ts` | Montagem do resumo e alertas de consistência | 5 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 O resumo consulta arrecadação, vendas e checklists em separado; se crescer,
  avaliar consolidar com o `status` de `arrecadacao`/`vendas` para evitar
  divergência de lógica entre módulos.
- ⚠️ A conclusão depende de `concluirSeCompletou` ser chamada pelos módulos de
  arrecadação/vendas; um caminho de escrita que não passe por eles não dispararia
  o aviso.
