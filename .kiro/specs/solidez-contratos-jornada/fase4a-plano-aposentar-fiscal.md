# Fase 4 · Opção A — Plano para aposentar o modelo `Fiscal`

> **Objetivo:** tornar o `Colaborador` (funcao FISCAL) a **única** identidade de
> pessoa em todo o subsistema de ponto/jornada e, ao final, remover o modelo
> legado `Fiscal`. **Sem quebrar nada** — cada sub-passo é um PR próprio, com
> `npm run verify` + `npm run docs:check` verdes, e só avança quando o anterior
> estiver estável.

## 1. O problema em uma frase

Hoje `Fiscal.id` é o `pessoaId` polimórfico (ADR 0005) que identifica a pessoa
em batidas, log de ponto, escala, faltas e alertas de TAC. Para aposentar o
`Fiscal`, essa identidade precisa passar a ser `Colaborador.id` — de forma
gradual e reversível.

## 2. Estratégia: *expand → migrate reads → contract*

1. **Expand (preencher o vínculo):** garantir que **toda** linha nova e antiga
   das tabelas de ponto carregue `colaboradorId`. Aditivo, sem risco.
2. **Migrate reads (trocar a chave de leitura):** fazer cada leitura interna
   operar por `colaboradorId` em vez de `fiscalId`, mantendo o resultado
   idêntico (com testes de regressão).
3. **Contract (remover o legado):** quando ninguém mais depende de `fiscalId`,
   trocar a identidade exposta (mobile/WebSocket), remover o modelo `Fiscal` e o
   legado morto (`Operador`/`OperadorTurno`/`RegistroOperacional`).

## 3. Situação da fundação de dados (colaboradorId)

| Tabela | Escrita nova | Históricos |
|---|---|---|
| `batidas_ponto` | ✅ `registrarBatida` | (novas já vêm com vínculo) |
| `registros_ponto_fiscal` | ✅ `definirStatus` / batidas | ✅ backfill `9zzf` |
| `escala_entries` (do cadastro) | ✅ `sincronizarEscalaFiscal` | ✅ backfill `9zzf` |
| `escala_entries` (manual) | ⚠️ `cadastrarEscala`/`definirHorarioEspecial` | — |
| `ausencias` (fiscal) | ⚠️ `registrarFalta` | ⚠️ pendente |
| `ausencias` (operador) | ⚠️ `registrarAusencia` | ⚠️ pendente |
| `alertas_tac_enviados` / `eventos_alerta_tac` | ❌ sem coluna | — (efêmero/append) |

## 4. Roteiro (sub-passos, cada um um PR)

- **A.1 — Completar o *expand* das faltas (ESTE PR).** Preencher `colaboradorId`
  na escrita de `Ausencia` (fiscal e operador) e no backfill dos históricos
  (migração `9zzg`). Estender o verificador de integridade para contar ausências
  sem vínculo. **Aditivo — não toca leituras nem a identidade exposta.**
- **A.2 — *Expand* da escala manual. ✅ Concluído.** `cadastrarEscala` e
  `definirHorarioEspecial` (escala.service) preenchem `colaboradorId`, resolvido
  do `funcionarioId` (reaproveitando um vínculo já gravado ou a conta/matrícula
  do fiscal). Aditivo. Com isto a **fase *expand* está completa** em todas as
  tabelas de identidade que têm coluna de vínculo.
- **A.3 — Migrar leituras internas para `colaboradorId`.** Onde a chave não é
  exposta ao exterior. **Em andamento:** os crons `saudacao-diaria` e
  `fiscais-horario` já resolvem a conta pela ficha canônica (`colaboradorId` da
  escala), com fallback ao `Fiscal` legado. Faltam `registrosDoDia`,
  `sincronizarFiscalNoCliente` e `escalaConsolidada` (já híbrida) — mantendo o
  resultado idêntico e lendo por ambos os ids na transição. `listarAusencias`
(relatório de faltas) já resolve o nome pela ficha canônica, com o `Fiscal` só
como fallback.
- **A.4 — Alertas de TAC por ficha.** Decidir o destino de `pessoaId` em
  `AlertaTacEnviado`/`EventoAlertaTac` (migrar para `colaboradorId` ou manter,
  dado que são efêmeros/append). Baixo impacto funcional.
- **A.5.1 — Expor `colaboradorId` (backend, aditivo). ✅ Concluído.** Painel,
  jornada, `meuResumo`, `horasExtrasMes` e o evento WebSocket `fiscal:status`
  passam a enviar `colaboradorId` junto do `fiscalId`. Nada é removido: apps
  instalados seguem usando `fiscalId`.
- **A.5.2 — App prefere `colaboradorId`. ✅ Concluído.** O mapa de status ao vivo
  do painel de fiscais (`OperadoresScreen`), o evento WebSocket e os tipos
  (`EventoStatusFiscal`, `MeuResumoFiscal`, `ItemHorasExtrasFiscal`) passam a usar
  `colaboradorId` como chave, com fallback ao `fiscalId`. Compatível.
- **A.5 — Trocar a identidade EXPOSTA (o passo mais delicado).** Fazer o painel,
  a jornada, o `meuResumo`, o evento WebSocket `fiscal:status` e a fila offline
  usarem `colaboradorId` como identidade. **Exige mudança coordenada
  backend + mobile** (contratos `ItemPainelFiscal`/`ItemJornadaFiscal`/
  `MeuResumoFiscal`, `PayloadAlteracaoStatus`). Feito com compatibilidade
  temporária (enviar os dois ids) para não quebrar apps antigos.
- **A.6 — Remover o `Fiscal`.** Quando ninguém lê por `fiscalId`: migração que
  remove o modelo/tabela `Fiscal` (com backup), limpar `garantirFiscal`,
  `meuFiscal`, `colaborador-vinculo` e as colunas `fiscalId` redundantes.
- **A.7 — Remover o legado morto.** `Operador`, `OperadorTurno`,
  `RegistroOperacional` (zero usos), com **backup dos dados históricos** antes do
  drop (decisão do dono já registrada).
- **A.8 — Atlas.** Atualizar `operadores.md`, `fiscais.md` e as regras.

## 5. Regras de segurança do épico

- Cada sub-passo é **reversível** e isolado; nada vai direto para `main`.
- O verificador `npm run integridade` roda como rede de segurança entre passos.
- A identidade exposta (A.5) só muda com **compatibilidade** (dois ids em
  paralelo) para nunca quebrar um app já instalado.
- Nenhum drop destrutivo (A.6/A.7) sem **backup** confirmado dos dados.

## 6. Rastreabilidade

- Requisitos **R4.1/R4.2/R4.3**; transversal **T.3** (verificador).
- Depende dos Passos 4.2 (dual-write) e 4.4 (backfill) já concluídos.
