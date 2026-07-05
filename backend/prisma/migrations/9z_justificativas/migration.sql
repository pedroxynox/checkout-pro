-- Justificativa (abono) de ocorrências de escala — faltas (ausencias) e
-- não-retornos de intervalo (incidencias_escala). Permite marcar, DEPOIS do
-- registro, se a ocorrência foi justificada (com motivo) e por quem, reduzindo
-- o impacto no score conforme o motivo (ver ADR 0009). Aditivo: 2 enums novos +
-- colunas opcionais. NÃO remove nem altera dados existentes (default PENDENTE).

CREATE TYPE "StatusJustificativa" AS ENUM ('PENDENTE', 'JUSTIFICADA', 'INJUSTIFICADA');
CREATE TYPE "MotivoJustificativa" AS ENUM ('ATESTADO_MEDICO', 'ABONADA', 'LICENCA', 'ATRASO_JUSTIFICADO', 'OUTRO');

-- Faltas: quem registrou (auditoria) + justificativa.
ALTER TABLE "ausencias"
    ADD COLUMN "registradaPorId" TEXT,
    ADD COLUMN "registradaPorNome" TEXT,
    ADD COLUMN "statusJustificativa" "StatusJustificativa" NOT NULL DEFAULT 'PENDENTE',
    ADD COLUMN "motivoJustificativa" "MotivoJustificativa",
    ADD COLUMN "observacaoJustificativa" TEXT,
    ADD COLUMN "justificadaPorId" TEXT,
    ADD COLUMN "justificadaPorNome" TEXT,
    ADD COLUMN "justificadaEm" TIMESTAMP(3);

CREATE INDEX "ausencias_statusJustificativa_idx" ON "ausencias"("statusJustificativa");

-- Não-retornos de intervalo: justificativa (mesmo modelo das faltas).
ALTER TABLE "incidencias_escala"
    ADD COLUMN "statusJustificativa" "StatusJustificativa" NOT NULL DEFAULT 'PENDENTE',
    ADD COLUMN "motivoJustificativa" "MotivoJustificativa",
    ADD COLUMN "observacaoJustificativa" TEXT,
    ADD COLUMN "justificadaPorId" TEXT,
    ADD COLUMN "justificadaPorNome" TEXT,
    ADD COLUMN "justificadaEm" TIMESTAMP(3);

CREATE INDEX "incidencias_escala_statusJustificativa_idx" ON "incidencias_escala"("statusJustificativa");
