-- Marca as faltas que fazem parte de uma "ausência a prazo" (período: férias,
-- licença) lançada pelo gestor. Esses dias não podem ser desmarcados por um
-- fiscal na escala.
ALTER TABLE "ausencias" ADD COLUMN "aPrazo" BOOLEAN NOT NULL DEFAULT false;
