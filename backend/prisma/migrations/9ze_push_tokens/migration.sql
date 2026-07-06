-- Tokens de push (Expo) por dispositivo, para enviar notificações push além do
-- in-app/WebSocket. Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "plataforma" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key" ON "push_tokens" ("token");
CREATE INDEX IF NOT EXISTS "push_tokens_usuarioId_idx" ON "push_tokens" ("usuarioId");
