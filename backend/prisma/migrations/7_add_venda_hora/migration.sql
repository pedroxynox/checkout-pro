-- Vendas por hora (alimenta o Painel de Vendas e os gráficos por hora).
CREATE TABLE "vendas_hora" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "vendas_hora_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendas_hora_data_hora_key" ON "vendas_hora"("data", "hora");
CREATE INDEX "vendas_hora_data_idx" ON "vendas_hora"("data");
