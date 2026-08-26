-- LIMITE DE 200 NOTIFICAÇÕES POR USUÁRIO (janela deslizante).
--
-- Migração SOMENTE aditiva: cria um índice. Nenhum dado é alterado e nenhuma
-- regra antiga muda de comportamento.
--
-- O centro de notificações passa a guardar no máximo 200 avisos por pessoa: ao
-- entrar um novo, o mais antigo sai. As duas operações quentes disso são
-- (1) listar o histórico do usuário do mais recente ao mais antigo e (2) achar
-- o excedente a apagar. Ambas ordenam por `criadaEm` DENTRO de um `usuarioId`,
-- então o índice composto evita varrer a tabela e ordenar em memória.
--
-- O índice simples de `usuarioId` continua existindo (outras consultas o usam);
-- este é adicional, não substituto. A aparagem em si é feita pelo backend a
-- cada envio — não há trigger nem job de banco.

-- CreateIndex
CREATE INDEX "notificacoes_usuarioId_criadaEm_idx" ON "notificacoes"("usuarioId", "criadaEm");
