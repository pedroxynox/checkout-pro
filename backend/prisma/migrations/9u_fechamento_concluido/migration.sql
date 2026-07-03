-- Marca idempotente de fechamento concluído por dia (notificação exatamente
-- uma vez, mesmo com uploads concorrentes). Aditiva — não afeta dados atuais.
CREATE TABLE "fechamentos_concluidos" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "concluidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fechamentos_concluidos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fechamentos_concluidos_data_key" ON "fechamentos_concluidos"("data");
