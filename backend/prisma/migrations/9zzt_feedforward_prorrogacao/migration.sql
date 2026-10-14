-- Feedforward: prorrogação do prazo de um ponto a melhorar.
--
-- Antes, um ponto que precisava de mais tempo só podia ser marcado como "não
-- atingido". Agora o líder pode prorrogar o prazo de um ponto PENDENTE, com
-- auditoria: o prazo original (antes da primeira prorrogação), quantas vezes foi
-- prorrogado e quem/quando/por quê na última vez.
--
-- Colunas novas e aditivas (nulas ou com padrão) — não afetam dados existentes.

-- AlterTable
ALTER TABLE "feedforward_pontos" ADD COLUMN "prazoOriginal" TIMESTAMP(3),
ADD COLUMN "prorrogacoes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "prorrogadoPorId" TEXT,
ADD COLUMN "prorrogadoPorNome" TEXT,
ADD COLUMN "prorrogadoEm" TIMESTAMP(3),
ADD COLUMN "motivoProrrogacao" TEXT;
