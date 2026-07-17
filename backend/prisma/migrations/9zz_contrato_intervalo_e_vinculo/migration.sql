-- Fase 2 dos tipos de contrato de jornada.
-- 1) Regra nova: intervalo OBRIGATÓRIO (encerrar sem intervalo vira TAC).
-- 2) Vínculo do colaborador ao seu tipo de contrato (nulo = usa o padrão).
-- Aditiva: não altera dados existentes nem o comportamento vigente.
--
-- IMPORTANTE: a tabela do modelo `Colaborador` tem @@map("colaboradores"),
-- então o nome real no banco é "colaboradores" (não "Colaborador"). As guardas
-- IF NOT EXISTS tornam esta migração reaplicável com segurança.

ALTER TABLE "TipoContratoJornada"
    ADD COLUMN IF NOT EXISTS "intervaloObrigatorio" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "colaboradores"
    ADD COLUMN IF NOT EXISTS "tipoContratoJornadaId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'colaboradores_tipoContratoJornadaId_fkey'
    ) THEN
        ALTER TABLE "colaboradores"
            ADD CONSTRAINT "colaboradores_tipoContratoJornadaId_fkey"
            FOREIGN KEY ("tipoContratoJornadaId")
            REFERENCES "TipoContratoJornada"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "colaboradores_tipoContratoJornadaId_idx"
    ON "colaboradores"("tipoContratoJornadaId");
