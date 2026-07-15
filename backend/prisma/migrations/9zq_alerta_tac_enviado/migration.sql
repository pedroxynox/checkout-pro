-- Deduplicação PERSISTENTE dos avisos de risco/TAC. Migração SOMENTE aditiva:
-- novo enum + nova tabela com índice único. Substitui a memória em processo por
-- um registro que sobrevive a reinícios e coordena múltiplas instâncias, sem
-- alterar dados existentes nem regras de negócio. O TAC é diário: a unicidade
-- inclui o dia, então cada novo dia recomeça a escala de etapas.

-- CreateEnum
CREATE TYPE "EtapaAlertaTac" AS ENUM ('RISCO_1H30', 'RISCO_1H40', 'TAC');

-- CreateTable
CREATE TABLE "alertas_tac_enviados" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "etapa" "EtapaAlertaTac" NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_tac_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_tac_enviados_pessoaId_dia_etapa_key" ON "alertas_tac_enviados"("pessoaId", "dia", "etapa");
