-- Adiciona a data de desligamento (base da janela de retenção da purga mensal).
ALTER TABLE "colaboradores" ADD COLUMN "desligadoEm" TIMESTAMP(3);

-- Backfill seguro: colaboradores JÁ inativos passam a contar a retenção a partir
-- de agora (não serão purgados até completar a janela RETENCAO_INATIVOS_MESES a
-- partir desta data). Evita apagar histórico de desligados antigos de imediato.
UPDATE "colaboradores" SET "desligadoEm" = now() WHERE "ativo" = false AND "desligadoEm" IS NULL;
