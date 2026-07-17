-- Fechamento/reabertura do ciclo de folha (26→25). Migração SOMENTE aditiva:
-- novos enums + tabelas de estado e de trilha. Sem linha = ciclo ABERTO; uma
-- linha FECHADO bloqueia modificações ordinárias no período. Não altera dados.

-- CreateEnum
CREATE TYPE "StatusCicloFolha" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TipoEventoCiclo" AS ENUM ('FECHADO', 'REABERTO');

-- CreateTable
CREATE TABLE "ciclos_folha" (
    "id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fimExclusivo" TIMESTAMP(3) NOT NULL,
    "status" "StatusCicloFolha" NOT NULL DEFAULT 'FECHADO',
    "fechadoPor" TEXT,
    "fechadoPorNome" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "reabertoPor" TEXT,
    "reabertoPorNome" TEXT,
    "reabertoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ciclos_folha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_folha_eventos" (
    "id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoEventoCiclo" NOT NULL,
    "por" TEXT NOT NULL,
    "porNome" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclos_folha_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ciclos_folha_inicio_key" ON "ciclos_folha"("inicio");

-- CreateIndex
CREATE INDEX "ciclos_folha_eventos_inicio_idx" ON "ciclos_folha_eventos"("inicio");
