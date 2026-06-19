-- Tabela de registros de arrecadação por operador (alimenta os indicadores).
CREATE TABLE "registros_arrecadacao" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "matricula" TEXT,
    "nome" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registros_arrecadacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registros_arrecadacao_tipo_data_idx" ON "registros_arrecadacao"("tipo", "data");
