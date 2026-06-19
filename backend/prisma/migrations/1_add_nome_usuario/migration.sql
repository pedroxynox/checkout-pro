-- Adiciona o nome (exibição) do usuário. Nullable para compatibilidade com
-- registros existentes; o seed preenche os nomes conhecidos.
ALTER TABLE "usuarios" ADD COLUMN "nome" TEXT;
