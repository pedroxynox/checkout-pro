> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/reset-operacional/`

# Módulo: `reset-operacional`

## 1. Propósito
Reinício operacional controlado: apaga os dados de movimento (vendas,
arrecadação, estoque, jornada, avisos, checklists etc.) e zera o saldo dos
insumos numa **única transação**, conservando todo o cadastro e a configuração —
para recomeçar a operação a partir da Data Inicial sem perder os dados de base.

## 2. Responsabilidades e limites
- **Faz:** valida o marcador de confirmação explícita; executa o "plano de
  reinício" ordenado (respeitando as FKs) dentro de `prisma.$transaction`;
  apaga as 18 entidades de movimento e zera `insumos.saldo`; devolve um
  `Resumo_de_Reinicio` (contagem apagada por entidade); é idempotente.
- **Não faz** (fica em outro módulo): a limpeza pontual de cada domínio (ex.:
  `zerarEstoque` em [`insumos`](insumos.md), `limparHistorico` em
  [`lote-apae`](lote-apae.md)); a definição da Data Inicial (fica em
  [`data-inicial`](data-inicial.md)); autenticação/permissão em si (fica em
  `acessos`/`permissoes`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `reset-operacional.controller.ts` | Rota HTTP administrativa | 27 |
| `reset-operacional.service.ts` | Executa o plano na transação (efeitos) | 87 |
| `reset-operacional.domain.ts` | Regras puras: plano, partição, execução pura | 193 |
| `reset-operacional.errors.ts` | Erro de domínio (confirmação ausente) | 25 |
| `reset-operacional.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/reset-operacional.dto.ts` | Validação do marcador de confirmação | 13 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `reset-operacional`](../05-referencia-dados/api-http.md#reset-operacional). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /admin/reset-operacional` | `ADMIN_DADOS` | Dispara o reinício (exige `confirmacao: "ZERAR"`) e devolve o resumo. |

## 5. Serviços e funções

### `ResetOperacionalService.reiniciar(dto)`
- **Recebe:** DTO com `confirmacao: "ZERAR"`.
- **Devolve:** `ResumoDeReinicio` (mapa entidade → nº de registros apagados).
- **Efeitos:** revalida o marcador (defesa em profundidade — lança
  `ConfirmacaoAusenteError` se ausente); percorre `PLANO_REINICIO` dentro de
  `prisma.$transaction`; para cada passo `APAGAR`, chama o `Apagador` tipado
  correspondente (`deleteMany`) e acumula a contagem; no passo
  `ZERAR_SALDO_INSUMOS`, faz `updateMany({ saldo: 0 })`. Se qualquer passo
  falhar, a transação reverte por completo (tudo ou nada).
- **Regras aplicadas:** ordem do plano respeita FKs; cobertura das 18 entidades
  de movimento; salvaguarda que exige um apagador para cada entidade `APAGAR`.
- **Erros:** `ConfirmacaoAusenteError` (400); `Error` interno se faltar apagador
  mapeado (plano e mapa fora de sincronia).

> `APAGADORES` é o mapa nome-`@@map` → *delegate* Prisma tipado, cobrindo todas
> as entidades com ação `APAGAR` do plano.

## 6. Lógica de domínio (funções puras)
- `PLANO_REINICIO` (congelado) → passos ordenados (`entidade`, `acao`, `ordem`);
  a ordem garante filho antes do pai e estoque em movimento antes de zerar o
  saldo dos insumos.
- `ENTIDADES_MOVIMENTO_ESPERADAS` → as 18 entidades que devem ser apagadas.
- `ENTIDADES_CONSERVADAS` → cadastro + config + Data Inicial (`insumos` está aqui
  porque a **linha** é conservada; só o `saldo` é zerado).
- `DEPENDENCIAS_FK` → pares `[filho, pai]`.
- `entidadesApagadas(plano)` → conjunto das entidades `APAGAR`.
- `planoEhParticaoValida(plano, conservadas)` → apagar ∩ conservar = ∅.
- `ordemRespeitaDependencias(plano, deps)` → `ordem(filho) < ordem(pai)`.
- `executarPlanoPuro(estado, plano)` → modelo puro (sem banco): zera as
  entidades apagadas e resume o que existia; base para testar idempotência e a
  cobertura do resumo.

## 7. Estados e enums
- `AcaoReset`: `APAGAR` · `ZERAR_SALDO_INSUMOS`.
- Não há máquina de estados; o plano é uma sequência determinística de passos
  ordenados por `ordem` (menor primeiro).

## 8. Dados que o módulo toca
- **Apaga (deleteMany):** `movimentos_lote_apae`, `lotes_apae`,
  `movimentos_estoque`, `requisicoes`, `sugestoes_pedido`,
  `registros_operacionais`, `registros_importacao`, `registros_ponto_fiscal`,
  `ausencias`, `incidencias_escala`, `vendas_diarias`, `vendas_hora`,
  `registros_arrecadacao`, `arrecadacao_sem_movimento`, `notificacoes`,
  `mensagens_assistente`, `fechamentos_concluidos`, `checklists`.
- **Zera:** `insumos.saldo` (a linha é conservada).
- **Conserva:** cadastro, `fardos`, `pedidos_recorrentes`, `config_apae`,
  `config_vendas`, metas e `config_sistema` (a Data Inicial).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService` (transação e delegates), domínio puro
  (`PLANO_REINICIO`).
- **É usado por:** o app (tela administrativa de reinício), sob `ADMIN_DADOS`.

## 10. Regras de negócio-chave
1. **Confirmação obrigatória**: só executa com `confirmacao: "ZERAR"` (validado
   no DTO e revalidado no serviço).
2. **Tudo ou nada**: toda a limpeza roda numa transação; falha reverte tudo.
3. **Partição apagar/conservar disjunta**: nenhuma entidade conservada é apagada.
4. **Ordem respeita FKs**: filhos antes dos pais; movimentos de estoque antes de
   zerar o saldo.
5. **Idempotente**: rodar de novo sobre um sistema já zerado conclui com
   contagens 0.
6. **Insumos são conservados**: só o campo `saldo` é zerado.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `reset-operacional.domain.spec.ts` | Ordem/FK, partição, 18 entidades, insumos conservado, execução pura, erro/DTO | 8 |
| `reset-operacional.properties.spec.ts` | Propriedades: partição+cobertura, idempotência, resumo | 3 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Operação destrutiva e irreversível**: apaga dados de movimento sem backup
  próprio; depende de o operador ter `ADMIN_DADOS` e enviar a confirmação.
- 🔧 O `PLANO_REINICIO` e o mapa `APAGADORES` precisam ser mantidos **em
  sincronia** ao adicionar novas entidades de movimento; a salvaguarda em runtime
  ajuda, mas o ideal é um teste que compare as chaves.
- ⚠️ Novas tabelas de movimento criadas no futuro não são apagadas até serem
  adicionadas ao plano — risco de "sujeira" residual após um reinício.
