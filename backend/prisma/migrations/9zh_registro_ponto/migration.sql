-- Registro de Ponto (leitor de papelito) — Fase A.
-- Nova tabela de batidas de ponto do dia (1 linha por batida) + enums.
-- Migração aditiva (não altera nada existente).

-- Enums
CREATE TYPE "TipoBatida" AS ENUM ('ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'ENCERRAMENTO', 'EXTRA');
CREATE TYPE "OrigemBatida" AS ENUM ('MANUAL', 'LEITOR', 'EDITADO');
CREATE TYPE "TipoPessoaPonto" AS ENUM ('FISCAL', 'OPERADOR');

-- Tabela de batidas de ponto.
CREATE TABLE "batidas_ponto" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoaPonto" NOT NULL DEFAULT 'FISCAL',
    "colaboradorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoBatida" NOT NULL,
    "origem" "OrigemBatida" NOT NULL DEFAULT 'MANUAL',
    "confianca" DOUBLE PRECISION,
    "comprovanteUrl" TEXT,
    "registradoPor" TEXT NOT NULL,
    "registradoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batidas_ponto_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "batidas_ponto_pessoaId_data_idx" ON "batidas_ponto"("pessoaId", "data");
CREATE INDEX "batidas_ponto_colaboradorId_idx" ON "batidas_ponto"("colaboradorId");
