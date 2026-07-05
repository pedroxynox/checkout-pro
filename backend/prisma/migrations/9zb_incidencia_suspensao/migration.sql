-- Novo tipo de incidência de escala: SUSPENSAO (ADR 0011). Lançada no perfil do
-- colaborador (como a advertência). Aditivo: só adiciona um valor ao enum
-- existente, NÃO remove nem altera dados. Idempotente (PG 12+).

ALTER TYPE "TipoIncidenciaEscala" ADD VALUE IF NOT EXISTS 'SUSPENSAO';
