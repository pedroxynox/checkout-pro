-- REMOÇÃO da seção Sacolas APAE (decisão do dono do produto: a seção não era
-- usada). Sai o código, a tela, a permissão e também os dados.
--
-- ⚠️ MIGRAÇÃO DESTRUTIVA — a única deste repositório que apaga tabelas inteiras.
-- Ela remove o HISTÓRICO de lotes e de vendas de sacolas, e a configuração de
-- preço/meta. Não há como desfazer depois de aplicada: se houver interesse em
-- guardar esses números para conferência contábil, exporte as três tabelas
-- ANTES de subir esta versão.
--
-- Ordem: primeiro os movimentos (FK loteId → lotes_apae), depois os lotes, a
-- configuração e por fim o enum que só existia para o status do lote.
-- `IF EXISTS` mantém a migração idempotente em bases que nunca tiveram a seção.

-- DropTable (filho antes do pai: movimentos_lote_apae.loteId → lotes_apae.id)
DROP TABLE IF EXISTS "movimentos_lote_apae";

-- DropTable
DROP TABLE IF EXISTS "lotes_apae";

-- DropTable (configuração singleton de preço e meta)
DROP TABLE IF EXISTS "config_apae";

-- DropEnum (só era usado por lotes_apae.status)
DROP TYPE IF EXISTS "StatusLote";
