-- Categoria de insumo "Álcool".
ALTER TYPE "CategoriaInsumo" ADD VALUE IF NOT EXISTS 'ALCOOL';

-- Unidade base, embalagem de entrada e fator de conversão dos insumos, além
-- do indicador de ativo. Ex.: fardo=1000 sacolas, caixa=20 bobinas,
-- rolo=100 metros (pano), galão=5 litros (álcool).
ALTER TABLE "insumos" ADD COLUMN "unidade" TEXT NOT NULL DEFAULT 'un';
ALTER TABLE "insumos" ADD COLUMN "embalagem" TEXT NOT NULL DEFAULT 'un';
ALTER TABLE "insumos" ADD COLUMN "fatorEmbalagem" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "insumos" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
