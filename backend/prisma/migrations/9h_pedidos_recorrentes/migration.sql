-- Pedidos recorrentes de insumos e sugestões automáticas.

CREATE TYPE "StatusSugestao" AS ENUM ('PENDENTE', 'CONFIRMADA', 'IGNORADA');

CREATE TABLE "pedidos_recorrentes" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "frequenciaDias" INTEGER NOT NULL DEFAULT 7,
    "diaSugestao" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_recorrentes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sugestoes_pedido" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "quantidadeAjustada" INTEGER,
    "status" "StatusSugestao" NOT NULL DEFAULT 'PENDENTE',
    "lote" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3),
    "confirmadaPor" TEXT,

    CONSTRAINT "sugestoes_pedido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sugestoes_pedido_status_idx" ON "sugestoes_pedido"("status");

ALTER TABLE "pedidos_recorrentes" ADD CONSTRAINT "pedidos_recorrentes_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sugestoes_pedido" ADD CONSTRAINT "sugestoes_pedido_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
