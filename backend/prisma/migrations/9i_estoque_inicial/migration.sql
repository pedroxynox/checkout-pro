-- Atualizar fatorEmbalagem de Bobina de 20 para 16.
UPDATE "insumos" SET "fatorEmbalagem" = 16, "limiteMinimo" = 16 WHERE "nome" = 'Bobina';

-- Atualizar limiteMinimo de Sacolas (200 fardos * 1000 = 200.000; mínimo 50 fardos = 50.000).
UPDATE "insumos" SET "limiteMinimo" = 50000 WHERE "nome" = 'Sacolas';

-- Inserir estoque inicial via movimentos (idempotente: só insere se não existe movimento para o insumo).
-- 4 galões de álcool = 4 * 5 = 20 litros
INSERT INTO "movimentos_estoque" ("id", "insumoId", "delta", "origem", "dataHora")
SELECT gen_random_uuid(), i."id", 20, 'ESTOQUE_INICIAL', NOW()
FROM "insumos" i
WHERE i."nome" = 'Álcool'
  AND NOT EXISTS (SELECT 1 FROM "movimentos_estoque" m WHERE m."insumoId" = i."id");

-- 6 caixas de bobina = 6 * 16 = 96 bobinas
INSERT INTO "movimentos_estoque" ("id", "insumoId", "delta", "origem", "dataHora")
SELECT gen_random_uuid(), i."id", 96, 'ESTOQUE_INICIAL', NOW()
FROM "insumos" i
WHERE i."nome" = 'Bobina'
  AND NOT EXISTS (SELECT 1 FROM "movimentos_estoque" m WHERE m."insumoId" = i."id");

-- 200 fardos de sacolas = 200 * 1000 = 200.000 sacolas
INSERT INTO "movimentos_estoque" ("id", "insumoId", "delta", "origem", "dataHora")
SELECT gen_random_uuid(), i."id", 200000, 'ESTOQUE_INICIAL', NOW()
FROM "insumos" i
WHERE i."nome" = 'Sacolas'
  AND NOT EXISTS (SELECT 1 FROM "movimentos_estoque" m WHERE m."insumoId" = i."id");

-- 2 rolos de pano = 2 * 100 = 200 metros
INSERT INTO "movimentos_estoque" ("id", "insumoId", "delta", "origem", "dataHora")
SELECT gen_random_uuid(), i."id", 200, 'ESTOQUE_INICIAL', NOW()
FROM "insumos" i
WHERE i."nome" = 'Pano'
  AND NOT EXISTS (SELECT 1 FROM "movimentos_estoque" m WHERE m."insumoId" = i."id");
