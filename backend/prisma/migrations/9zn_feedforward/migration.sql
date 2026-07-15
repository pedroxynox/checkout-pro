-- Feedforward: acompanhamento de desenvolvimento do colaborador. Uma rodada
-- (Feedforward) por conversa/formulário, com a foto do formulário preenchido e
-- os pontos a melhorar (FeedforwardPonto), cada um com o seu prazo. Tabelas
-- novas e aditivas — não afetam dados existentes.

-- CreateEnum
CREATE TYPE "StatusFeedforwardPonto" AS ENUM ('PENDENTE', 'ATINGIDO', 'NAO_ATINGIDO');

-- CreateTable
CREATE TABLE "feedforwards" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "liderId" TEXT,
    "liderNome" TEXT,
    "cargo" TEXT,
    "pontosFortes" TEXT,
    "oportunidades" TEXT,
    "compromissoFinal" TEXT,
    "evolucaoNota" INTEGER,
    "fotoUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedforwards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedforward_pontos" (
    "id" TEXT NOT NULL,
    "feedforwardId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" "StatusFeedforwardPonto" NOT NULL DEFAULT 'PENDENTE',
    "revisadoPorId" TEXT,
    "revisadoPorNome" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "observacaoRevisao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedforward_pontos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedforwards_colaboradorId_data_idx" ON "feedforwards"("colaboradorId", "data");

-- CreateIndex
CREATE INDEX "feedforward_pontos_feedforwardId_idx" ON "feedforward_pontos"("feedforwardId");

-- CreateIndex
CREATE INDEX "feedforward_pontos_colaboradorId_idx" ON "feedforward_pontos"("colaboradorId");

-- CreateIndex
CREATE INDEX "feedforward_pontos_status_prazo_idx" ON "feedforward_pontos"("status", "prazo");

-- AddForeignKey
ALTER TABLE "feedforward_pontos" ADD CONSTRAINT "feedforward_pontos_feedforwardId_fkey" FOREIGN KEY ("feedforwardId") REFERENCES "feedforwards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
