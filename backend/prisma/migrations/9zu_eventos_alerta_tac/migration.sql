-- Histórico compreensível dos alertas de TAC por pessoa/dia. Migração SOMENTE
-- aditiva: novo enum + nova tabela com índice de consulta. Não altera dados
-- nem regras existentes. Complementa `alertas_tac_enviados` (trava de dedup)
-- com uma trilha append-only: risco avisado, jornada corrigida e novo excesso.

-- CreateEnum
CREATE TYPE "TipoEventoTac" AS ENUM ('AVISADO', 'CORRIGIDO', 'REINCIDENTE');

-- CreateTable
CREATE TABLE "eventos_alerta_tac" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoEventoTac" NOT NULL,
    "etapa" "EtapaAlertaTac",
    "motivos" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_alerta_tac_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_alerta_tac_pessoaId_dia_idx" ON "eventos_alerta_tac"("pessoaId", "dia");
