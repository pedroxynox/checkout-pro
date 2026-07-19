# Tarefas — Solidez de Contratos, Jornada, TAC e Operadores

Executar na ordem das fases. Cada fase termina com `npm run verify` +
`npm run docs:check` verdes e um PR próprio. Marcar `[x]` ao concluir.

> **Progresso:** **Fase 0 concluída.** Como a remoção da coluna legada
> `tipoContrato` exigiu tirar o filtro fixo da Central de Jornada, o **núcleo da
> Fase 2** (2.1 e 2.2 — Central inclui todos os tipos de contrato, com regras
> resolvidas por pessoa) foi antecipado junto. Restante da Fase 1 (garantir que
> todo o fluxo de ponto resolva as regras pelo tipo de contrato) e o polimento
> da Fase 2 seguem em PRs próprios.

## Fase 0 — Tipo de Contrato como fonte única (jornada + TAC)

- [ ] 0.1 Backfill: preencher `Colaborador.tipoContratoJornadaId` nulos com o Tipo
  de Contrato `padrao` (o 6x1 atual). _(R0.2, R0.4)_
- [ ] 0.2 Migração Prisma: tornar `tipoContratoJornadaId` **NOT NULL** após o
  backfill. _(R0.2)_
- [ ] 0.3 Mapear e remover todos os leitores do enum legado `TipoContrato` /
  `Colaborador.tipoContrato`. _(R0.5)_
- [ ] 0.4 Migração Prisma: dropar a coluna `tipoContrato` e o enum, depois de 0.3.
  _(R0.5)_
- [ ] 0.5 Reduzir `ponto/contrato-regras.ts`/`REGRAS_PADRAO` a, no máximo, uma
  constante de emergência marcada; a fonte passa a ser o Tipo de Contrato. _(R0.5)_
- [ ] 0.6 Confirmar/estender a validação de coerência dos limites com testes.
  _(R0.6, RT.2)_
- [ ] 0.7 Rótulo/documentação: apresentar como "Tipo de Contrato"; atualizar Atlas
  de [`tipos-contrato`](../../../docs/03-atlas-backend/tipos-contrato.md) e as
  regras em [`contratos-e-jornada`](../../../docs/01-produto/regras-de-negocio/contratos-e-jornada.md). _(RT.4)_

## Fase 1 — TAC e jornada dependem do Tipo de Contrato

- [ ] 1.1 Garantir que `PontoService` (jornada do dia, registrar/editar batida)
  resolva as regras via `regrasDoColaborador`. _(R1.1)_
- [ ] 1.2 Garantir que `PontoAlertasService` e `PontoDeteccaoAutomaticaService`
  usem as regras do Tipo de Contrato da pessoa. _(R1.2)_
- [ ] 1.3 Remover qualquer uso de limites de TAC/jornada fixos no código no fluxo
  de cálculo; fallback só no Tipo de Contrato `padrao`. _(R1.2, R1.3)_
- [ ] 1.4 Teste de regressão do 6x1: mesmos limites e mesmo resultado de antes.
  _(R1.4, RT.5)_
- [ ] 1.5 Teste "congela-regra" dos limites de TAC (1h30/1h40/1h50) e intervalo
  (1h/3h) a partir do Tipo de Contrato. _(RT.2)_
- [ ] 1.6 Atualizar Atlas de [`ponto`](../../../docs/03-atlas-backend/ponto.md) e as
  regras de [`ponto-jornada-e-tac`](../../../docs/01-produto/regras-de-negocio/ponto-jornada-e-tac.md). _(RT.4)_

## Fase 2 — Central de Jornada com todos os Tipos de Contrato

- [ ] 2.1 Remover o filtro fixo `tipoContrato === 'SEIS_X_UM_DOIS_X_UM'` na
  `central-jornada.service`; incluir por função. _(R2.1, R2.3)_
- [ ] 2.2 Resolver as regras **por pessoa** no cálculo do ciclo (indexar os tipos
  de contrato por id para evitar N+1). _(R2.2)_
- [ ] 2.3 Aplicar o mesmo critério em resumo, detalhe, inconsistências, exportação
  e comparativos. _(R2.1, R2.2)_
- [ ] 2.4 Testes: pessoas de tipos de contrato diferentes aparecem e são calculadas
  com as suas regras. _(RT.2)_
- [ ] 2.5 Atualizar Atlas de [`central-jornada`](../../../docs/03-atlas-backend/central-jornada.md). _(RT.4)_

## Fase 3 — Contratos de experiência

- [ ] 3.1 Padronizar nomenclatura (Contrato de Experiência vs. Tipo de Contrato) em
  documentação e rótulos. _(R3.1)_
- [ ] 3.2 Remover/depreciar `marcoEmAtraso` sem afetar os alertas. _(R3.2)_
- [ ] 3.3 Ampliar as propriedades do ciclo automático (45/90/91 + avisos). _(R3.3, RT.2)_
- [ ] 3.4 Atualizar Atlas de [`contratos`](../../../docs/03-atlas-backend/contratos.md). _(RT.4)_

## Fase 4 — Consolidar operadores (retirar o legado)

- [ ] 4.1 Inventário dos consumidores dos modelos legados
  (`Operador`/`OperadorTurno`/`Fiscal`). _(R4.1)_
- [ ] 4.2 Garantir equivalente canônico (`Colaborador`/`Fiscal`) para cada
  consumidor. _(R4.1)_
- [ ] 4.3 Redirecionar escrita (cadastros/edições) para o Cadastro Unificado. _(R4.2)_
- [ ] 4.4 Backfill dos dados restantes + verificação de integridade. _(R4.2, RT.3)_
- [ ] 4.5 Remover os modelos legados, rotas e telas, um por vez, com testes. _(R4.3)_
- [ ] 4.6 Atualizar Atlas de [`operadores`](../../../docs/03-atlas-backend/operadores.md)
  e [`fiscais`](../../../docs/03-atlas-backend/fiscais.md). _(RT.4)_

## Transversais (fazer ao longo das fases)

- [ ] T.1 Auditar e centralizar a hora de Brasília em `common/datas`; nenhum módulo
  reimplementa o offset. _(RT.1)_
- [ ] T.2 Criar os testes "congela-regra" das regras críticas de cada fase. _(RT.2)_
- [ ] T.3 Implementar `verificar-integridade` (lista vínculos órfãos por id). _(RT.3)_
- [ ] T.4 Regenerar a referência (`npm run docs:gen`) e garantir o guardião verde a
  cada fase. _(RT.4, RT.5)_

---

## Notas

- **Ponto de partida forte:** `TipoContratoJornada`, `regrasDoColaborador` e
  `tipos-contrato.adapter.ts` já existem — a Fase 0/1 é mais **consolidação** do
  que construção.
- **Domingo/escalas** (rodízio 2x1, fallback de âncora legada) ficam **fora deste
  spec**, para uma etapa posterior.
- Cada fase é independente e entregue em **branch + PR**; nada vai direto para a
  `main`.
