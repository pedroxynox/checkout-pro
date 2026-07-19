-- Fase 0 da solidez de contratos (spec `solidez-contratos-jornada`):
-- o Tipo de Contrato de jornada passa a ser a FONTE ÚNICA das regras de jornada
-- e de TAC, e o vínculo do colaborador ao seu tipo de contrato torna-se
-- OBRIGATÓRIO. O enum legado `TipoContrato` (com um único valor) é removido.
--
-- Segura e reaplicável (guardas IF EXISTS). A tabela do modelo `Colaborador`
-- tem @@map("colaboradores"); o catálogo é "TipoContratoJornada".

-- 1) Backfill: toda ficha sem contrato recebe o contrato PADRÃO (o 6x1 vigente,
--    semeado na migração 9zy). Sem padrão a migração falha de propósito
--    (situação anômala que não deve ser mascarada).
UPDATE "colaboradores"
SET "tipoContratoJornadaId" = (
    SELECT "id" FROM "TipoContratoJornada"
    WHERE "padrao" = true
    ORDER BY "criadoEm" ASC
    LIMIT 1
)
WHERE "tipoContratoJornadaId" IS NULL;

-- 2) Vínculo obrigatório.
ALTER TABLE "colaboradores" ALTER COLUMN "tipoContratoJornadaId" SET NOT NULL;

-- 3) FK passa de ON DELETE SET NULL para RESTRICT (coerente com relação
--    obrigatória; remover um tipo de contrato em uso já é bloqueado no serviço).
ALTER TABLE "colaboradores"
    DROP CONSTRAINT IF EXISTS "colaboradores_tipoContratoJornadaId_fkey";
ALTER TABLE "colaboradores"
    ADD CONSTRAINT "colaboradores_tipoContratoJornadaId_fkey"
    FOREIGN KEY ("tipoContratoJornadaId")
    REFERENCES "TipoContratoJornada"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Remove o enum/coluna legado `tipoContrato` (havia um único valor; sem
--    perda de informação — as regras agora vêm do tipo de contrato).
ALTER TABLE "colaboradores" DROP COLUMN IF EXISTS "tipoContrato";
DROP TYPE IF EXISTS "TipoContrato";
