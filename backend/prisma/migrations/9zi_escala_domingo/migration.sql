-- Escala de domingo (rodízio por grupos). Aditivo e não destrutivo:
-- colunas anuláveis no cadastro do colaborador. Fase 1 (cadastro):
--  - grupoDomingo: grupo do rodízio de domingo ('G1' | 'G2' | 'G3'). NULL =
--    não entra no rodízio (não trabalha domingo / folga fixa de domingo).
--  - entradaDom / saidaDom: horário do domingo ("HH:mm"), definido por pessoa
--    (como já é feito para Seg–Qui e Sex–Sáb).
ALTER TABLE "colaboradores" ADD COLUMN "grupoDomingo" TEXT;
ALTER TABLE "colaboradores" ADD COLUMN "entradaDom" TEXT;
ALTER TABLE "colaboradores" ADD COLUMN "saidaDom" TEXT;
