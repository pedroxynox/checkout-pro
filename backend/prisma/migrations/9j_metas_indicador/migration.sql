-- Metas configuráveis dos indicadores de arrecadação.

CREATE TABLE "metas_indicador" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "meta" DOUBLE PRECISION NOT NULL,
    "limiteAmarelo" DOUBLE PRECISION,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "metas_indicador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metas_indicador_tipo_key" ON "metas_indicador"("tipo");

-- Defaults (idempotente): só insere se ainda não existir o tipo.
INSERT INTO "metas_indicador" ("id", "tipo", "meta")
SELECT gen_random_uuid(), v.tipo, v.meta
FROM (VALUES
  ('TROCO_SOLIDARIO', 2000.0),
  ('RECARGAS_CELULAR', 2000.0),
  ('CANCELAMENTO_ITENS', 0.75),
  ('CANCELAMENTO_CUPOM', 0.5),
  ('DEVOLUCOES', 0.05)
) AS v(tipo, meta)
WHERE NOT EXISTS (
  SELECT 1 FROM "metas_indicador" m WHERE m."tipo" = v.tipo
);
