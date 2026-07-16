-- Renomeia o perfil de acesso total "GERENTE_DESENVOLVEDOR" para "ADMINISTRADOR".
-- Migração puramente de renome do valor do enum: preserva TODOS os usuários já
-- existentes (as linhas com o valor antigo passam a referenciar o novo nome
-- automaticamente). Não altera dados nem regras de negócio.
ALTER TYPE "Perfil" RENAME VALUE 'GERENTE_DESENVOLVEDOR' TO 'ADMINISTRADOR';
