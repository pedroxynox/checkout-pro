-- Fase 4 da solidez de contratos (spec `solidez-contratos-jornada`) — Passo 4.4.
--
-- Backfill do vínculo `colaboradorId` (ficha canônica do Cadastro Unificado) nos
-- registros HISTÓRICOS de ponto e de escala dos fiscais. É a continuação da fase
-- *expand* (Passo 4.2), em que os registros NOVOS já passaram a gravar o vínculo:
-- aqui completamos os antigos, que ainda dependiam apenas do `fiscalId`.
--
-- SEGURA E REAPLICÁVEL:
--   * só atualiza linhas com `colaboradorId` AINDA NULO (não sobrescreve nada);
--   * o vínculo forte é a conta de acesso (`usuarioId`, único nos dois lados);
--   * o fallback é a matrícula (== login da conta do fiscal). `matricula` é
--     única em `colaboradores`, então não há ambiguidade de destino.
--   * é a MESMA regra do helper `mapearFiscalColaborador` usado em runtime.
-- Não altera schema (a coluna `colaboradorId`, anulável, já existe). Nenhuma
-- perda de dados: apenas preenche um vínculo que estava em branco.

-- 1) registros_ponto_fiscal — vínculo pela conta de acesso (usuarioId).
UPDATE "registros_ponto_fiscal" r
SET "colaboradorId" = c."id"
FROM "fiscais" f, "colaboradores" c
WHERE r."fiscalId" = f."id"
  AND r."colaboradorId" IS NULL
  AND f."usuarioId" IS NOT NULL
  AND c."usuarioId" = f."usuarioId"
  AND c."funcao"::text = 'FISCAL';

-- 2) registros_ponto_fiscal — fallback pela matrícula (== login da conta).
UPDATE "registros_ponto_fiscal" r
SET "colaboradorId" = c."id"
FROM "fiscais" f
JOIN "usuarios" u ON u."id" = f."usuarioId"
JOIN "colaboradores" c
  ON c."funcao"::text = 'FISCAL'
 AND UPPER(BTRIM(c."matricula")) = UPPER(BTRIM(u."login"))
WHERE r."fiscalId" = f."id"
  AND r."colaboradorId" IS NULL;

-- 3) escala_entries — vínculo pela conta de acesso (usuarioId).
UPDATE "escala_entries" e
SET "colaboradorId" = c."id"
FROM "fiscais" f, "colaboradores" c
WHERE e."funcionarioId" = f."id"
  AND e."colaboradorId" IS NULL
  AND f."usuarioId" IS NOT NULL
  AND c."usuarioId" = f."usuarioId"
  AND c."funcao"::text = 'FISCAL';

-- 4) escala_entries — fallback pela matrícula (== login da conta).
UPDATE "escala_entries" e
SET "colaboradorId" = c."id"
FROM "fiscais" f
JOIN "usuarios" u ON u."id" = f."usuarioId"
JOIN "colaboradores" c
  ON c."funcao"::text = 'FISCAL'
 AND UPPER(BTRIM(c."matricula")) = UPPER(BTRIM(u."login"))
WHERE e."funcionarioId" = f."id"
  AND e."colaboradorId" IS NULL;
