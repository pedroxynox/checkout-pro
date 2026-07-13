-- Âncora do rodízio de domingo (Fase 2): guarda o "ponto de partida" da
-- rotação — um domingo de referência e qual grupo (G1/G2/G3) folga nele.
-- A partir disso o grupo que folga em qualquer domingo é determinístico.
-- Singleton em config_sistema (id = 'sistema'). Colunas anuláveis, aditivo.
ALTER TABLE "config_sistema" ADD COLUMN "domingoAncoraData" TIMESTAMP(3);
ALTER TABLE "config_sistema" ADD COLUMN "domingoAncoraGrupo" TEXT;
