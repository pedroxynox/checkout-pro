-- Novo perfil "Importador": usuário dedicado (deixado no computador da loja)
-- cuja única função é carregar os arquivos do dia (arrecadação + vendas) na
-- seção Importações. Não enxerga nenhuma outra área.
ALTER TYPE "Perfil" ADD VALUE IF NOT EXISTS 'IMPORTADOR';
