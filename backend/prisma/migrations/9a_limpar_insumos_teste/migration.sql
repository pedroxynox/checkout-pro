-- Limpeza única dos dados de insumos que eram de TESTE.
--
-- Remove todos os movimentos, requisições e insumos existentes. Logo após as
-- migrações, o `prisma db seed` recria os 4 insumos padrão (Sacolas, Bobina,
-- Pano, Álcool) com saldo zerado e os atributos corretos (unidade/embalagem/
-- fator). Resultado: almoxarifado limpo, pronto para uso real.
--
-- A ordem respeita as chaves estrangeiras: primeiro os filhos (movimentos e
-- requisições), depois os insumos.
DELETE FROM "movimentos_estoque";
DELETE FROM "requisicoes";
DELETE FROM "insumos";
