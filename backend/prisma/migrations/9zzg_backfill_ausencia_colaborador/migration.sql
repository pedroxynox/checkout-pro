-- Fase 4 · Opção A · Passo A.1 (spec `solidez-contratos-jornada`).
--
-- Backfill do vínculo `colaboradorId` nas faltas HISTÓRICAS (`ausencias`),
-- completando o *expand* iniciado no ponto/escala (migrações 9zzf). A escrita
-- nova já grava o vínculo (registrarFalta / registrarAusencia); aqui
-- preenchemos os registros antigos.
--
-- SEGURA E REAPLICÁVEL: só toca linhas com `colaboradorId` NULO; nunca
-- sobrescreve; não altera schema. Mesma regra de vínculo do runtime.

-- 1) Faltas de OPERADOR: o `pessoaId` já é o id da ficha (Colaborador). Só
--    copiamos para `colaboradorId` quando existe um colaborador com esse id.
UPDATE "ausencias" a
SET "colaboradorId" = a."pessoaId"
FROM "colaboradores" c
WHERE a."colaboradorId" IS NULL
  AND c."id" = a."pessoaId";

-- 2) Faltas de FISCAL: `pessoaId` é o id do Fiscal → resolve a ficha pela conta
--    de acesso (usuarioId).
UPDATE "ausencias" a
SET "colaboradorId" = c."id"
FROM "fiscais" f, "colaboradores" c
WHERE a."pessoaId" = f."id"
  AND a."colaboradorId" IS NULL
  AND f."usuarioId" IS NOT NULL
  AND c."usuarioId" = f."usuarioId"
  AND c."funcao"::text = 'FISCAL';

-- 3) Faltas de FISCAL: fallback pela matrícula (== login da conta do fiscal).
UPDATE "ausencias" a
SET "colaboradorId" = c."id"
FROM "fiscais" f
JOIN "usuarios" u ON u."id" = f."usuarioId"
JOIN "colaboradores" c
  ON c."funcao"::text = 'FISCAL'
 AND UPPER(BTRIM(c."matricula")) = UPPER(BTRIM(u."login"))
WHERE a."pessoaId" = f."id"
  AND a."colaboradorId" IS NULL;
