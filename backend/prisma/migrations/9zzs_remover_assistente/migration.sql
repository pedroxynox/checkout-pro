-- REMOÇÃO DA ASSISTENTE DE IA (Cluby / Google Gemini).
--
-- A assistente foi retirada do produto por decisão do dono do projeto: o app
-- deixa de ter qualquer recurso de IA. A tabela guardava apenas conversas
-- efêmeras (24h) do chat, apagadas diariamente por um cron que também saiu —
-- nenhum outro dado do sistema depende dela (sem FKs de entrada ou saída).
--
-- Rollback: recriar a tabela conforme a migração `9f_conversa_assistente`. As
-- conversas não são recuperáveis, mas por definição já expiravam em 24h.

-- DropTable
DROP TABLE IF EXISTS "mensagens_assistente";
