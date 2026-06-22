-- Checklist: auditoria/anti-fraude — pontualidade e hash da imagem.
ALTER TABLE "checklists" ADD COLUMN "noPrazo" BOOLEAN;
ALTER TABLE "checklists" ADD COLUMN "imagemHash" TEXT;

CREATE INDEX "checklists_imagemHash_idx" ON "checklists"("imagemHash");
