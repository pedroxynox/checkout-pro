-- Deduplicação PERSISTENTE do ALERTA DE ATRASO (1h). Migração SOMENTE aditiva:
-- nova tabela com índice único (pessoaId, dia). Substitui qualquer memória em
-- processo por um registro que sobrevive a reinícios e coordena múltiplas
-- instâncias, sem alterar dados existentes nem regras. O atraso é diário: a
-- unicidade inclui o dia, então cada novo dia recomeça a contagem.

-- CreateTable
CREATE TABLE "alertas_atraso_enviados" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "dia" TIMESTAMP(3) NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_atraso_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alertas_atraso_enviados_pessoaId_dia_key" ON "alertas_atraso_enviados"("pessoaId", "dia");
