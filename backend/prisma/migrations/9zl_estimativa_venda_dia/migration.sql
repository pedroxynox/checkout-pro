-- Estimativa de venda por dia (Central de Vendas). O gestor define quanto se
-- estima vender em cada data; a estimativa do mês é a soma das diárias.
-- Uma linha por data (poucas linhas por mês — não pesa).
CREATE TABLE "estimativas_venda_dia" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "estimativas_venda_dia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "estimativas_venda_dia_data_key" ON "estimativas_venda_dia"("data");
