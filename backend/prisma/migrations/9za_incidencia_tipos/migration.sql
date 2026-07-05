-- Novos tipos de incidência de escala (ADR 0010). O modelo é genérico por
-- `tipo` (ADR 0007): novos eventos entram apenas somando valores ao enum, sem
-- tabelas nem colunas novas. Aditivo: só adiciona valores ao enum existente,
-- NÃO remove nem altera dados.
--
-- `ADD VALUE IF NOT EXISTS` é idempotente (PostgreSQL 12+). A partir do PG 12,
-- adicionar valores a um enum é permitido dentro da transação da migração,
-- desde que os novos valores não sejam usados na MESMA transação (aqui só os
-- declaramos; o uso vem em gravações posteriores).

ALTER TYPE "TipoIncidenciaEscala" ADD VALUE IF NOT EXISTS 'ATRASO';
ALTER TYPE "TipoIncidenciaEscala" ADD VALUE IF NOT EXISTS 'SAIDA_ANTECIPADA';
ALTER TYPE "TipoIncidenciaEscala" ADD VALUE IF NOT EXISTS 'RETORNO_TARDIO';
ALTER TYPE "TipoIncidenciaEscala" ADD VALUE IF NOT EXISTS 'ADVERTENCIA';
