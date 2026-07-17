-- Idempotencia do registro de batidas (fila offline). Migracao SOMENTE aditiva:
-- adiciona uma chave de idempotencia gerada no cliente, com indice unico, para
-- que o reenvio da MESMA batida (reconexao/retry) nao crie duplicata. Nulo para
-- as batidas existentes; o indice unico ignora nulos (varias linhas sem chave).

-- AlterTable
ALTER TABLE "batidas_ponto" ADD COLUMN "clienteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "batidas_ponto_clienteId_key" ON "batidas_ponto"("clienteId");
