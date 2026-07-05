-- Contratos de experiência (máx. 90 dias = 45 + 45). Aditivo:
--   1) nova coluna opcional `dataAdmissao` em `colaboradores` (base do tempo
--      de casa e dos marcos; NÃO altera dados existentes — fica NULL até o
--      gestor preencher);
--   2) dois enums novos (marco e resultado);
--   3) nova tabela `decisoes_contrato` (auditoria das decisões de 45/90 dias).
-- NÃO remove nem altera dados/colunas existentes.

-- 1) Data de admissão (tempo de casa). Opcional, pode ser histórica.
ALTER TABLE "colaboradores" ADD COLUMN "dataAdmissao" TIMESTAMP(3);

-- 2) Enums do contrato de experiência.
CREATE TYPE "MarcoContrato" AS ENUM ('MARCO_45', 'MARCO_90');
CREATE TYPE "ResultadoDecisaoContrato" AS ENUM ('APROVADO', 'REPROVADO');

-- 3) Decisões de contrato (aprovar/reprovar por marco), com auditoria.
CREATE TABLE "decisoes_contrato" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "marco" "MarcoContrato" NOT NULL,
    "resultado" "ResultadoDecisaoContrato" NOT NULL,
    "decididoPorId" TEXT,
    "decididoPorNome" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisoes_contrato_pkey" PRIMARY KEY ("id")
);

-- No máximo uma decisão por (colaborador, marco) — regravar atualiza a linha.
CREATE UNIQUE INDEX "decisoes_contrato_colaboradorId_marco_key"
    ON "decisoes_contrato"("colaboradorId", "marco");

-- Índice de consulta por colaborador (perfil, cards, cron de alertas).
CREATE INDEX "decisoes_contrato_colaboradorId_idx"
    ON "decisoes_contrato"("colaboradorId");
