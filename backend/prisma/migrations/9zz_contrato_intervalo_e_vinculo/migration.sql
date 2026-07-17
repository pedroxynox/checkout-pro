-- Fase 2 dos tipos de contrato de jornada.
-- 1) Regra nova: intervalo OBRIGATÓRIO (encerrar sem intervalo vira TAC).
-- 2) Vínculo do colaborador ao seu tipo de contrato (nulo = usa o padrão).
-- Aditiva: não altera dados existentes nem o comportamento vigente.

ALTER TABLE "TipoContratoJornada"
    ADD COLUMN "intervaloObrigatorio" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Colaborador"
    ADD COLUMN "tipoContratoJornadaId" TEXT;

ALTER TABLE "Colaborador"
    ADD CONSTRAINT "Colaborador_tipoContratoJornadaId_fkey"
    FOREIGN KEY ("tipoContratoJornadaId")
    REFERENCES "TipoContratoJornada"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Colaborador_tipoContratoJornadaId_idx"
    ON "Colaborador"("tipoContratoJornadaId");
