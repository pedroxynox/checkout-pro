-- Marca as faltas criadas AUTOMATICAMENTE pela detecção do Relógio Ponto
-- (colaborador escalado que não bateu ponto até 2h após a entrada prevista).
-- Só as faltas automáticas são removidas quando a pessoa finalmente bate o
-- ponto; as faltas lançadas manualmente pelo gestor permanecem intactas.
ALTER TABLE "ausencias" ADD COLUMN "automatica" BOOLEAN NOT NULL DEFAULT false;
