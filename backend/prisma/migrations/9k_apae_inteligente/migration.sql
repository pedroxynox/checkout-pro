-- Sacolas APAE inteligente: movimentos de venda + configuração (preço/meta).

CREATE TABLE "movimentos_lote_apae" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "vendidas" INTEGER NOT NULL,
    "saldoApos" INTEGER NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavelId" TEXT,

    CONSTRAINT "movimentos_lote_apae_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movimentos_lote_apae_em_idx" ON "movimentos_lote_apae"("em");
CREATE INDEX "movimentos_lote_apae_loteId_idx" ON "movimentos_lote_apae"("loteId");

ALTER TABLE "movimentos_lote_apae"
  ADD CONSTRAINT "movimentos_lote_apae_loteId_fkey"
  FOREIGN KEY ("loteId") REFERENCES "lotes_apae"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "config_apae" (
    "id" TEXT NOT NULL,
    "precoSacola" DOUBLE PRECISION NOT NULL DEFAULT 0.49,
    "metaMensal" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "config_apae_pkey" PRIMARY KEY ("id")
);

-- Linha singleton de configuração (idempotente).
INSERT INTO "config_apae" ("id", "precoSacola", "metaMensal")
VALUES ('apae', 0.49, 500)
ON CONFLICT ("id") DO NOTHING;
