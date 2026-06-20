-- Conversa com o assistente de IA (chat flutuante). Mensagens efêmeras:
-- guardadas por 24h e apagadas por um cron diário. Isoladas por usuário.

-- CreateTable
CREATE TABLE "mensagens_assistente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_assistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensagens_assistente_usuarioId_criadaEm_idx" ON "mensagens_assistente"("usuarioId", "criadaEm");
