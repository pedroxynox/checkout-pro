-- Zera o estoque de TODOS os insumos (dados de teste de entradas/consumos).
--
-- O saldo de cada insumo é a soma dos movimentos; removendo todos os movimentos,
-- todos os saldos voltam a 0. Os 4 insumos padrão permanecem (o seed garante
-- que existam). Também limpa as requisições de teste.
DELETE FROM "movimentos_estoque";
DELETE FROM "requisicoes";
