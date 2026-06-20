-- Marca de "sem movimento" por tipo de arrecadação e dia (ex.: nenhum
-- cancelamento de itens no dia). Permite o Fechamento distinguir "sem
-- movimento" de "pendente / não enviado".
CREATE TABLE "arrecadacao_sem_movimento" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "marcadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arrecadacao_sem_movimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "arrecadacao_sem_movimento_tipo_data_key"
    ON "arrecadacao_sem_movimento"("tipo", "data");
