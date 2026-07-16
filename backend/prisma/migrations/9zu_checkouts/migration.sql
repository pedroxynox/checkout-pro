-- Seção Check-Outs: quantidade de check-outs (config) + reportes de avaria.
-- Migração aditiva: adiciona uma coluna com default e cria uma tabela nova.
-- Não altera dados existentes.

-- AlterTable: quantidade de check-outs (padrão 38)
ALTER TABLE "config_sistema" ADD COLUMN "quantidadeCheckouts" INTEGER NOT NULL DEFAULT 38;

-- CreateTable
CREATE TABLE "checkout_reportes" (
    "id" TEXT NOT NULL,
    "checkoutNumero" INTEGER NOT NULL,
    "equipamento" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "reportadoPorId" TEXT,
    "reportadoPorNome" TEXT,
    "reportadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoPorId" TEXT,
    "resolvidoPorNome" TEXT,
    "resolvidoEm" TIMESTAMP(3),

    CONSTRAINT "checkout_reportes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkout_reportes_status_idx" ON "checkout_reportes"("status");

-- CreateIndex
CREATE INDEX "checkout_reportes_checkoutNumero_idx" ON "checkout_reportes"("checkoutNumero");
