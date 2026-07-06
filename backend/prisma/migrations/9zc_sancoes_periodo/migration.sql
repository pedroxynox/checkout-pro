-- Sanções disciplinares (ADR 0012). Enriquece a tabela de incidências para
-- suportar a seção "Sanções": duração da SUSPENSAO em dias + a data final
-- (inclusiva) para calcular quem está suspenso "hoje", e o vínculo opcional da
-- sanção à ocorrência que a motivou (causa). Aditivo e idempotente: só adiciona
-- colunas nulas, NÃO altera nem remove dados existentes.

ALTER TABLE "incidencias_escala" ADD COLUMN IF NOT EXISTS "diasSuspensao" INTEGER;
ALTER TABLE "incidencias_escala" ADD COLUMN IF NOT EXISTS "dataFim" TIMESTAMP(3);
ALTER TABLE "incidencias_escala" ADD COLUMN IF NOT EXISTS "causaTipo" TEXT;
ALTER TABLE "incidencias_escala" ADD COLUMN IF NOT EXISTS "causaData" TIMESTAMP(3);

-- Consulta frequente: suspensões ativas hoje (tipo + janela [data, dataFim]).
CREATE INDEX IF NOT EXISTS "incidencias_escala_tipo_dataFim_idx"
  ON "incidencias_escala" ("tipo", "dataFim");
