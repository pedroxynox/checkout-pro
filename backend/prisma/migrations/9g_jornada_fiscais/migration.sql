-- Rediseño do Modulo_Fiscais: controle de jornada com 3 estados
-- (DISPONIVEL, INTERVALO, FORA_EXPEDIENTE) e log de ponto por transição.
-- ATENÇÃO: migração destrutiva — remove o modelo antigo de sessões de fiscais
-- (dados de teste pré-demo) e recria o enum de status.

-- Remove o modelo antigo (substituído por registros_ponto_fiscal).
DROP TABLE IF EXISTS "sessoes_fiscais";

-- Recria o enum de status com os 3 estados do novo fluxo.
DROP TYPE IF EXISTS "StatusFiscal";
CREATE TYPE "StatusFiscal" AS ENUM ('DISPONIVEL', 'INTERVALO', 'FORA_EXPEDIENTE');

-- Log de ponto: cada transição de status de um fiscal.
CREATE TABLE "registros_ponto_fiscal" (
    "id" TEXT NOT NULL,
    "fiscalId" TEXT NOT NULL,
    "status" "StatusFiscal" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_ponto_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registros_ponto_fiscal_fiscalId_data_idx" ON "registros_ponto_fiscal"("fiscalId", "data");

-- AddForeignKey
ALTER TABLE "registros_ponto_fiscal" ADD CONSTRAINT "registros_ponto_fiscal_fiscalId_fkey" FOREIGN KEY ("fiscalId") REFERENCES "fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
