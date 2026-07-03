-- Revogação de sessões: versão do token por usuário. É incrementada ao
-- redefinir a senha (e a remoção do usuário já invalida seus tokens, pois o
-- guard rejeita tokens de usuários inexistentes). Coluna aditiva com default 0
-- — não afeta usuários nem tokens existentes (tokens antigos, sem versão, são
-- lidos como 0 e continuam válidos até que a versão do usuário mude).
ALTER TABLE "usuarios" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
