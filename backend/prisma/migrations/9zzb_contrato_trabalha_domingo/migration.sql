-- Escala no contrato: se participa do rodízio de domingo (2x1).
-- Default true = comportamento vigente (o 6x1 trabalha domingo). Aditiva.
ALTER TABLE "TipoContratoJornada"
    ADD COLUMN IF NOT EXISTS "trabalhaDomingo" BOOLEAN NOT NULL DEFAULT true;
