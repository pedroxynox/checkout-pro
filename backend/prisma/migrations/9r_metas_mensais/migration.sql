-- Metas MENSAIS dos indicadores (definidas pelo gestor em Centro de Controle ▸
-- Metas). Cada meta é por período mensal (anoMes = "AAAA-MM"), permitindo
-- valores diferentes a cada mês. Tipos: VENDAS, RECARGAS_CELULAR,
-- CANCELAMENTO_ITENS, CANCELAMENTO_CUPOM, DEVOLUCOES.

CREATE TABLE "metas_mensais" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "anoMes" TEXT NOT NULL,
    "meta" DOUBLE PRECISION NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "metas_mensais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metas_mensais_tipo_anoMes_key" ON "metas_mensais"("tipo", "anoMes");
