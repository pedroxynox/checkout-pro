-- Painel de Vendas inteligente: configuração (meta mensal de faturamento).

CREATE TABLE "config_vendas" (
    "id" TEXT NOT NULL,
    "metaMensal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "config_vendas_pkey" PRIMARY KEY ("id")
);

-- Linha singleton de configuração (idempotente).
INSERT INTO "config_vendas" ("id", "metaMensal")
VALUES ('vendas', 0)
ON CONFLICT ("id") DO NOTHING;
