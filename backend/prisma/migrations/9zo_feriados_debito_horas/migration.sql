-- Feriados e débito de horas nas faltas. Migração SOMENTE aditiva (nova tabela,
-- novo enum e nova coluna com DEFAULT) — não afeta dados existentes.
--
-- - Feriados: os NACIONAIS são semeados automaticamente pelo sistema; os
--   ESTADUAIS/MUNICIPAIS são cadastrados manualmente pelo gestor. Para a
--   jornada, o feriado segue a regra do domingo (carga de domingo + 100%),
--   porém sem o rodízio por grupos.
-- - ausencias.debitoHoras: marca a falta cujo dia deve entrar como "horas que
--   deve" na Central de Jornada.

-- CreateEnum
CREATE TYPE "FeriadoAmbito" AS ENUM ('NACIONAL', 'ESTADUAL', 'MUNICIPAL');

-- CreateTable
CREATE TABLE "feriados" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "ambito" "FeriadoAmbito" NOT NULL DEFAULT 'MUNICIPAL',
    "automatico" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,

    CONSTRAINT "feriados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feriados_data_key" ON "feriados"("data");

-- CreateIndex
CREATE INDEX "feriados_data_idx" ON "feriados"("data");

-- AddColumn
ALTER TABLE "ausencias" ADD COLUMN "debitoHoras" BOOLEAN NOT NULL DEFAULT false;
