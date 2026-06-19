-- Quem autorizou e o motivo (ex.: cancelamento de cupom) no registro de arrecadação.
ALTER TABLE "registros_arrecadacao" ADD COLUMN "autorizadoPor" TEXT;
ALTER TABLE "registros_arrecadacao" ADD COLUMN "motivo" TEXT;
