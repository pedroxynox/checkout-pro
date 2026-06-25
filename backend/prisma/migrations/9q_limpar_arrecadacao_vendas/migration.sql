-- Limpeza única dos INDICADORES (arrecadação) e das VENDAS, para recarregar
-- tudo do zero. O gestor vai subir novamente todos os arquivos .txt (troco,
-- recargas, cancelamentos, devoluções e as vendas por hora), agora já casados
-- aos colaboradores por matrícula/login no perfil.
--
-- Remove:
--   - registros_arrecadacao        -> todos os lançamentos dos indicadores
--   - arrecadacao_sem_movimento    -> marcas de "sem movimento" do fechamento
--   - vendas_hora / vendas_diarias -> vendas por hora e o total diário
--
-- NÃO toca em configuração nem em metas (config_vendas, metas_indicador) nem
-- no cadastro de colaboradores. Os dados serão recriados nos próximos uploads.
DELETE FROM "registros_arrecadacao";
DELETE FROM "arrecadacao_sem_movimento";
DELETE FROM "vendas_hora";
DELETE FROM "vendas_diarias";
