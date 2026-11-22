-- Contrato 5x2 (spec jornada-5x2, Fase 2).
--
-- Campos novos do tipo de contrato de jornada. ADITIVA e sem mudança de
-- comportamento: os padrões reproduzem exatamente o 6x1 de hoje (feriado de
-- 7h20 a 100%, sem teto diário de horas, uma folga por semana, sem folgas fixas
-- padrão e sem folga no sábado).
--
-- Rollback (se for preciso):
--   ALTER TABLE "TipoContratoJornada"
--     DROP COLUMN "cargaFeriadoMin", DROP COLUMN "feriadoAdicional100",
--     DROP COLUMN "folgasFixasPadrao", DROP COLUMN "folgasPorSemana",
--     DROP COLUMN "limiteTrabalhoDiaMin", DROP COLUMN "permiteFolgaSabado";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '9zzv_contrato_5x2';

-- AlterTable
ALTER TABLE "TipoContratoJornada" ADD COLUMN     "cargaFeriadoMin" INTEGER NOT NULL DEFAULT 440,
ADD COLUMN     "feriadoAdicional100" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "folgasFixasPadrao" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "folgasPorSemana" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "limiteTrabalhoDiaMin" INTEGER,
ADD COLUMN     "permiteFolgaSabado" BOOLEAN NOT NULL DEFAULT false;
