-- Tipo de contrato do colaborador (regras de jornada). Migração SOMENTE aditiva:
-- novo enum + nova coluna com DEFAULT. Todos os colaboradores existentes passam
-- a ter o contrato "6x1 - 2x1" (o único hoje), preservando o comportamento atual.

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('SEIS_X_UM_DOIS_X_UM');

-- AddColumn (com DEFAULT: backfill automático das fichas existentes)
ALTER TABLE "colaboradores"
  ADD COLUMN "tipoContrato" "TipoContrato" NOT NULL DEFAULT 'SEIS_X_UM_DOIS_X_UM';
