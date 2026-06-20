-- Origem do movimento de estoque (para o "Controle de requisição"). Entradas
-- têm delta > 0; ex.: ENTRADA, REQUISICAO, COMPRA, AJUSTE.
ALTER TABLE "movimentos_estoque" ADD COLUMN "origem" TEXT;

-- Requisições de insumos (fiscal solicita; gerente/supervisor aprova ou nega).
CREATE TYPE "StatusRequisicao" AS ENUM ('PENDENTE', 'APROVADA', 'NEGADA');

CREATE TABLE "requisicoes" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "status" "StatusRequisicao" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "solicitanteId" TEXT,
    "solicitanteNome" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididaPorId" TEXT,
    "decididaPorNome" TEXT,
    "decididaEm" TIMESTAMP(3),
    "motivo" TEXT,
    CONSTRAINT "requisicoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requisicoes_status_idx" ON "requisicoes"("status");

ALTER TABLE "requisicoes" ADD CONSTRAINT "requisicoes_insumoId_fkey"
    FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
