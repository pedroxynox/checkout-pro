# Design — Solidez de Contratos, Jornada, TAC e Operadores

Referências de código: [`tipos-contrato`](../../../docs/03-atlas-backend/tipos-contrato.md),
[`ponto`](../../../docs/03-atlas-backend/ponto.md),
[`central-jornada`](../../../docs/03-atlas-backend/central-jornada.md),
[`contratos`](../../../docs/03-atlas-backend/contratos.md),
[`colaboradores`](../../../docs/03-atlas-backend/colaboradores.md),
[`operadores`](../../../docs/03-atlas-backend/operadores.md),
[`fiscais`](../../../docs/03-atlas-backend/fiscais.md),
[`common`](../../../docs/03-atlas-backend/common.md).

## Ponto de partida (o que já existe)

- **`TipoContratoJornada`** (Prisma) já é um catálogo **data-driven** com os
  parâmetros de jornada e TAC (carga por dia, dias com 100%, intervalos, limite de
  extras, riscos de TAC, `intervaloObrigatorio`, `trabalhaDomingo`, `padrao`,
  `ativo`). **Este é o "Tipo de Contrato" da Opção A** — já traz jornada + TAC.
- **`Colaborador.tipoContratoJornadaId`** (nullable) já liga a pessoa a um tipo.
- **`Colaborador.tipoContrato`** (enum `TipoContrato { SEIS_X_UM_DOIS_X_UM }`) é
  **legado** e coexiste com o acima.
- **`ponto/contrato-regras.ts`** e `REGRAS_PADRAO` guardam regras **no código**
  (duplicação a eliminar).
- **`tipos-contrato.adapter.ts`** converte `TipoContratoJornada` (minutos) em
  `RegrasContrato` (ms), consumido por `calcularJornadaDia`.
- **`TiposContratoService.regrasDoColaborador(id)`** já resolve as regras pelo
  contrato atribuído (ou o padrão do banco) — é o ponto de entrada correto.
- **`central-jornada.service`** filtra `Colaborador` por
  `tipoContrato === 'SEIS_X_UM_DOIS_X_UM'` (o filtro fixo a remover).
- **Hora de Brasília:** `common/datas` já tem `OFFSET_BRASILIA_MS`,
  `agoraNaBrasilia`, `diaCivilBrasilia`, etc. Alguns módulos ainda repetem o
  offset localmente.

> **Conclusão:** a Opção A está quase pronta na modelagem; o trabalho é
> **consolidar** (uma fonte só), **tornar obrigatório** o vínculo, **remover o
> legado** e **generalizar** os consumidores (ponto e central).

## Fase 0 — Tipo de Contrato como fonte única

1. **Tornar o vínculo obrigatório.** Migração Prisma que:
   - garante que todo `Colaborador` tenha `tipoContratoJornadaId` (preenche os
     nulos com o Tipo de Contrato `padrao` — o 6x1 atual);
   - passa `tipoContratoJornadaId` a **NOT NULL** (após o backfill).
2. **Preservar o 6x1.** O registro `TipoContratoJornada` do 6x1 permanece como
   `padrao`; nenhum parâmetro muda (comportamento idêntico).
3. **Remover o legado de código:**
   - deprecar/remover o enum `TipoContrato` e o campo `Colaborador.tipoContrato`
     (migração que dropa a coluna após confirmar que ninguém a lê);
   - remover `ponto/contrato-regras.ts`/`REGRAS_PADRAO` como fonte — manter, no
     máximo, uma constante de emergência claramente marcada, usada só se o banco
     não tiver um `padrao` (situação anômala).
4. **UI/nomenclatura:** apresentar como "Tipo de Contrato" (mantendo o nome do
   modelo no banco para evitar migração de rename arriscada; a mudança é de
   rótulo/documentação).

## Fase 1 — TAC e jornada a partir do Tipo de Contrato

1. Garantir que **todos** os pontos que calculam jornada resolvam as regras via
   `TiposContratoService.regrasDoColaborador(colaboradorId)`:
   - `PontoService.jornadaDoDia` e o registro/edição de batida;
   - `PontoAlertasService` (cron de TAC) e `PontoDeteccaoAutomaticaService`.
2. O TAC (etapas 1h30/1h40/TAC, intervalo min/máx) já sai de `RegrasContrato`;
   basta assegurar que `RegrasContrato` **sempre** venha do Tipo de Contrato da
   pessoa (nunca de `REGRAS_PADRAO` fixo).
3. **Regressão:** teste que compara o cálculo do 6x1 antes/depois (mesmos limites),
   garantindo comportamento idêntico.

## Fase 2 — Central de Jornada com todos os Tipos

1. Remover o filtro `where: { tipoContrato: 'SEIS_X_UM_DOIS_X_UM' }` em
   `central-jornada.service`; incluir por **função** (operador/supervisor/fiscal).
2. No cálculo por pessoa (`calcularPessoa`), resolver as regras com
   `regrasDoColaborador(colaboradorId)` **por pessoa** (hoje usa um contrato único).
   Carregar os tipos de contrato uma vez e indexar por id (evita N+1).
3. Ajustar `resumoCiclo`, `detalhePessoa`, `inconsistenciasCiclo`, `exportarCiclo`
   e `comparativos` para o mesmo critério.

## Fase 3 — Contratos de experiência

1. **Nomenclatura:** na documentação e nos rótulos, "Contrato de Experiência"
   (módulo `contratos`) vs. "Tipo de Contrato" (módulo `tipos-contrato`).
2. **Limpeza:** remover/depreciar `marcoEmAtraso` (o ciclo é automático e não gera
   atraso em experiência), sem alterar os alertas de vencimento.
3. **Testes:** manter/ampliar as propriedades do ciclo automático.

## Fase 4 — Consolidar operadores (retirar o legado)

Migração **gradual e reversível**, em passos pequenos, cada um com PR próprio:

1. **Mapear consumidores** de `Operador`/`OperadorTurno`/`Fiscal` legado (quadro,
   ausências, ponto, escala) — inventário a partir do Atlas.
2. **Ponte de leitura:** garantir que cada consumidor tenha equivalente via
   `Colaborador`/`Fiscal` canônico (muitos já têm).
3. **Migrar escrita:** redirecionar cadastros/edições que ainda gravam no legado
   para o Cadastro Unificado.
4. **Backfill + verificação de integridade** (RT.3): migrar dados restantes e
   rodar o verificador de órfãos.
5. **Remover** os modelos legados e suas rotas/telas, um por vez, com testes.

> Fase de **alto risco**: cada passo é isolado, testado e reversível. Só avança
> quando o anterior está estável em produção.

## Transversais

- **RT.1 Hora de Brasília:** auditar usos de offset local e substituí-los pelas
  funções de `common/datas`. Documentar a regra "sempre hora de Brasília" (a
  decisão de eventual horário de verão fica fora de escopo — hoje é UTC−3 fixo,
  conforme a decisão do dono do produto).
- **RT.2 Regras blindadas:** testes "congela-regra" para: limites de TAC
  (1h30/1h40/1h50), intervalo (1h/3h), carga por dia, adicional de domingo/feriado,
  ciclo de experiência (45/90/91) e rodízio (quando chegar a fase de domingo).
- **RT.3 Integridade:** um comando/serviço (`verificar-integridade`) que lista
  vínculos órfãos por id; roda sob demanda e, opcionalmente, num cron de auditoria.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Tornar o vínculo obrigatório quebrar cadastros antigos | Backfill com o `padrao` antes do NOT NULL; migração em duas etapas. |
| Dropar `tipoContrato` (enum) com algum leitor esquecido | Buscar todos os usos antes; remover leitores na Fase 1; só então dropar a coluna. |
| Central com N+1 ao resolver regras por pessoa | Carregar tipos de contrato uma vez e indexar por id. |
| Consolidação de operadores (Fase 4) | Passos pequenos, reversíveis, com verificação de integridade e testes a cada etapa. |
