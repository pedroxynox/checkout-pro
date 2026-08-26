-- HISTÓRICO DE INDICADORES — janela móvel de 24 meses.
--
-- Migração SOMENTE aditiva: cria uma tabela nova. Nenhum dado existente é
-- alterado e nenhuma regra antiga muda de comportamento.
--
-- `fotos_mes_indicador` guarda a FOTO de cada mês FECHADO por indicador: total
-- do mês, itens, vendas da loja, percentual sobre vendas, a meta que valia
-- naquele mês e o nível do semáforo. Serve a três propósitos:
--   1. ler 24 meses de histórico é instantâneo (uma linha por mês/tipo);
--   2. o resultado de um mês fechado deixa de mudar (fica auditável);
--   3. o número sobrevive à limpeza mensal dos lançamentos crus, que saem da
--      janela de retenção (`RETENCAO_INDICADORES_MESES`, padrão 24 meses).
--
-- O mês CORRENTE não é congelado — segue calculado ao vivo a partir dos
-- lançamentos. As fotos dos meses já existentes são preenchidas sozinhas na
-- primeira leitura do histórico (e pelo cron mensal), então esta migração não
-- precisa fazer backfill.

-- CreateTable
CREATE TABLE "fotos_mes_indicador" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "anoMes" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itens" INTEGER NOT NULL DEFAULT 0,
    "vendas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percentual" DOUBLE PRECISION,
    "meta" DOUBLE PRECISION NOT NULL,
    "nivel" TEXT NOT NULL,
    "cumpriu" BOOLEAN NOT NULL,
    "congeladoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fotos_mes_indicador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fotos_mes_indicador_tipo_anoMes_key" ON "fotos_mes_indicador"("tipo", "anoMes");

-- CreateIndex
CREATE INDEX "fotos_mes_indicador_anoMes_idx" ON "fotos_mes_indicador"("anoMes");
