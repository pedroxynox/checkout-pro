-- Marca requisições criadas pela auto-reposição e impede duplicatas pendentes
-- automáticas do mesmo insumo (índice único parcial). Aditiva.
ALTER TABLE "requisicoes" ADD COLUMN "automatica" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "requisicoes_auto_pendente_key"
    ON "requisicoes" ("insumoId")
    WHERE status = 'PENDENTE' AND automatica = true;
