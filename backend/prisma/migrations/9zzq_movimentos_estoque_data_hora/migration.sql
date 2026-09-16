-- Índice por data nos movimentos de estoque.
--
-- Três consultas filtram `movimentos_estoque` por JANELA DE DATAS sem filtrar
-- por insumo (o recorte é pela CATEGORIA do insumo, feito por join): a análise
-- de uso do insumo, o indicador de Sacolas e o detalhe dele (série diária,
-- entradas do mês e consumo do mês). O único índice existente é por `insumoId`,
-- que essas consultas não usam — o Postgres varria a tabela inteira.
--
-- A tabela cresce a cada entrada E a cada saída registrada (é o livro-caixa do
-- almoxarifado), então a varredura piora com o tempo em vez de melhorar.
--
-- Mudança puramente ADITIVA: cria um índice, não altera dado nem coluna. É
-- reversível com um DROP INDEX e não muda nenhum comportamento do sistema.

CREATE INDEX "movimentos_estoque_dataHora_idx" ON "movimentos_estoque"("dataHora");
