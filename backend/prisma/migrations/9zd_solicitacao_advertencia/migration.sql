-- Solicitação automática de advertência por falta não justificada (ADR 0013).
-- Aditivo e idempotente: cria o enum e a tabela se ainda não existirem.

DO $$ BEGIN
  CREATE TYPE "StatusSolicitacaoAdvertencia" AS ENUM ('PENDENTE', 'APROVADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "solicitacoes_advertencia" (
  "id" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "ausenciaId" TEXT NOT NULL,
  "dataFalta" TIMESTAMP(3) NOT NULL,
  "motivo" TEXT NOT NULL DEFAULT 'Desídia (falta injustificada)',
  "status" "StatusSolicitacaoAdvertencia" NOT NULL DEFAULT 'PENDENTE',
  "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decididaPorId" TEXT,
  "decididaPorNome" TEXT,
  "decididaEm" TIMESTAMP(3),
  "incidenciaId" TEXT,
  "motivoDecisao" TEXT,
  CONSTRAINT "solicitacoes_advertencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "solicitacoes_advertencia_ausenciaId_key"
  ON "solicitacoes_advertencia" ("ausenciaId");
CREATE INDEX IF NOT EXISTS "solicitacoes_advertencia_status_idx"
  ON "solicitacoes_advertencia" ("status");
CREATE INDEX IF NOT EXISTS "solicitacoes_advertencia_colaboradorId_idx"
  ON "solicitacoes_advertencia" ("colaboradorId");
