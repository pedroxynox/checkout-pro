-- Ordem do ciclo de domingo (a sequência não é fixa G1→G2→G3). Guarda a ordem
-- de quem folga em cada domingo do ciclo, como CSV (ex.: 'G1,G3,G2'). Aditivo.
-- domingoAncoraData continua sendo o 1º domingo de referência do ciclo.
ALTER TABLE "config_sistema" ADD COLUMN "domingoOrdemGrupos" TEXT;
