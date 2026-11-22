-- Vigência da jornada (spec jornada-5x2, Fase 1 · ADR 0027).
--
-- Cria as duas tabelas do histórico da jornada por pessoa. ADITIVA: não altera
-- nem copia nada. Os dias anteriores à primeira vigência de cada pessoa seguem a
-- ficha legada (6x1) que está em "colaboradores", então nenhum número muda.
--
-- Rollback (se for preciso, antes de existir qualquer vigência):
--   DROP TABLE "disponibilidade_dias";
--   DROP TABLE "jornada_vigencias";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '9zzu_jornada_vigencia';

-- CreateTable
CREATE TABLE "jornada_vigencias" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "tipoContratoJornadaId" TEXT NOT NULL,
    "grupo" TEXT,
    "folgasFixas" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "motivo" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornada_vigencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilidade_dias" (
    "id" TEXT NOT NULL,
    "vigenciaId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "entrada" TEXT NOT NULL,
    "saida" TEXT NOT NULL,

    CONSTRAINT "disponibilidade_dias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jornada_vigencias_tipoContratoJornadaId_idx" ON "jornada_vigencias"("tipoContratoJornadaId");

-- CreateIndex
CREATE UNIQUE INDEX "jornada_vigencias_colaboradorId_vigenteDesde_key" ON "jornada_vigencias"("colaboradorId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "disponibilidade_dias_vigenciaId_diaSemana_key" ON "disponibilidade_dias"("vigenciaId", "diaSemana");

-- AddForeignKey
ALTER TABLE "jornada_vigencias" ADD CONSTRAINT "jornada_vigencias_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada_vigencias" ADD CONSTRAINT "jornada_vigencias_tipoContratoJornadaId_fkey" FOREIGN KEY ("tipoContratoJornadaId") REFERENCES "TipoContratoJornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidade_dias" ADD CONSTRAINT "disponibilidade_dias_vigenciaId_fkey" FOREIGN KEY ("vigenciaId") REFERENCES "jornada_vigencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
