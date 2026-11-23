-- Rodízio de folgas por grupo (spec jornada-5x2, Fase 3).
--
-- Cria a tabela das vigências do rodízio e semeia a primeira, de 23/11/2026
-- (decisão 5 do spec): ciclo de 3 semanas, de segunda a domingo, e ninguém de
-- grupo folga no sábado. ADITIVA: só vale para quem tem grupo numa vigência da
-- jornada (ainda ninguém); o rodízio antigo de domingo, em "ConfigSistema",
-- continua decidindo os dias do 6x1.
--
--   Grupo | Semana 1  | Semana 2  | Semana 3
--   G1    | qui + sex | ter + qua | seg + dom
--   G2    | ter + qua | seg + dom | qui + sex
--   G3    | seg + dom | qui + sex | ter + qua
--
-- Rollback (antes de alguém ter grupo numa vigência):
--   DROP TABLE "rodizio_folgas_vigencias";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '9zzw_rodizio_folgas';

-- CreateTable
CREATE TABLE "rodizio_folgas_vigencias" (
    "id" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "semanasNoCiclo" INTEGER NOT NULL,
    "padrao" JSONB NOT NULL,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rodizio_folgas_vigencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rodizio_folgas_vigencias_vigenteDesde_key" ON "rodizio_folgas_vigencias"("vigenteDesde");

-- Semente: a vigência de 23/11/2026 (dias 0=domingo … 6=sábado; o índice
-- externo é a semana do ciclo).
INSERT INTO "rodizio_folgas_vigencias" ("id", "vigenteDesde", "semanasNoCiclo", "padrao", "criadoPor")
VALUES (
    'rodizio-folgas-2026-11-23',
    '2026-11-23 00:00:00',
    3,
    '{"G1": [[4, 5], [2, 3], [1, 0]], "G2": [[2, 3], [1, 0], [4, 5]], "G3": [[1, 0], [4, 5], [2, 3]]}'::jsonb,
    'migracao-9zzw'
)
ON CONFLICT ("vigenteDesde") DO NOTHING;
