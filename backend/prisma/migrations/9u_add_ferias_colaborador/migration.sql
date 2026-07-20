-- Sistema de Férias (inativação NÃO rígida): período em que o colaborador some
-- da escala e não gera falta automática, mantendo `Colaborador.ativo = true`.

CREATE TABLE "ferias_colaborador" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "registradaPorId" TEXT,
    "registradaPorNome" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ferias_colaborador_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ferias_colaborador_colaboradorId_idx" ON "ferias_colaborador"("colaboradorId");
CREATE INDEX "ferias_colaborador_inicio_fim_idx" ON "ferias_colaborador"("inicio", "fim");

ALTER TABLE "ferias_colaborador"
  ADD CONSTRAINT "ferias_colaborador_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
