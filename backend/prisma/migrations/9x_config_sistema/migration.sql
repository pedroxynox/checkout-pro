-- Configuração (singleton) global do Sistema: a Data_Inicial_Sistema, data a
-- partir da qual registros podem ser cadastrados/editados e a partir da qual
-- começam os calendários do app. Migração SOMENTE aditiva (nova tabela + linha
-- singleton idempotente); nenhuma migração destrutiva.

CREATE TABLE "config_sistema" (
    "id" TEXT NOT NULL,
    "dataInicial" TIMESTAMP(3) NOT NULL DEFAULT '2026-07-01 00:00:00',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "config_sistema_pkey" PRIMARY KEY ("id")
);

-- Linha singleton de configuração (idempotente).
INSERT INTO "config_sistema" ("id", "dataInicial")
VALUES ('sistema', '2026-07-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;
