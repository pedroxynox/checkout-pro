-- ATESTADOS médicos (Req: gestão de atestados com CID e regra do INSS).
--
-- `atestados` guarda o documento inteiro (período [inicio, fim] + CID ou
-- "sem CID"). Ao lançar, o backend cria uma falta JUSTIFICADA (motivo
-- ATESTADO_MEDICO, aPrazo) em cada dia corrido do período, vinculada por
-- `atestadoId` e carimbada com `cid` na tabela `ausencias` — por isso as duas
-- colunas aditivas abaixo. Assim a escala/faltas do dia mostram "Atestado" e é
-- possível somar dias por CID (INSS: mesmo CID > 15 dias em 60 dias).

-- Colunas aditivas em ausencias (não afetam faltas existentes: ficam NULL).
ALTER TABLE "ausencias" ADD COLUMN "atestadoId" TEXT;
ALTER TABLE "ausencias" ADD COLUMN "cid" TEXT;

CREATE INDEX "ausencias_atestadoId_idx" ON "ausencias"("atestadoId");

-- Tabela do atestado (documento).
CREATE TABLE "atestados" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "dias" INTEGER NOT NULL,
    "cid" TEXT,
    "semCid" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "fotoUrl" TEXT,
    "registradaPorId" TEXT,
    "registradaPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atestados_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "atestados_colaboradorId_idx" ON "atestados"("colaboradorId");
CREATE INDEX "atestados_cid_idx" ON "atestados"("cid");
CREATE INDEX "atestados_inicio_fim_idx" ON "atestados"("inicio", "fim");

ALTER TABLE "atestados" ADD CONSTRAINT "atestados_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
