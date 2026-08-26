-- AUTO-CURA das ocorrências lançadas pela detecção automática do Relógio Ponto.
-- Migração SOMENTE aditiva: uma coluna com default e uma tabela nova. Nenhum
-- dado existente é alterado e nenhuma regra antiga muda de comportamento.
--
-- 1) `ausencias.faltaAnterior` — memória para DESFAZER uma conversão: marca os
--    dias que já eram falta antes de virarem atestado (ou ausência a prazo).
--    Ao remover o atestado, esses dias voltam a ser falta em vez de desaparecer.
--    Registros existentes recebem `false`: para eles não há memória anterior, e
--    o comportamento continua o de hoje (o dia é apagado com o atestado).
--
-- 2) `exclusoes_ocorrencia_automatica` — a decisão do gestor de excluir uma
--    falta/não-retorno automático. A detecção é reincidente (recria a cada 5
--    min enquanto a condição for verdadeira), então sem este registro excluir à
--    mão não tinha efeito prático. A unicidade é por (tipo, pessoa, dia): a
--    decisão vale para aquele dia, e cada novo dia recomeça do zero.

-- AlterTable
ALTER TABLE "ausencias" ADD COLUMN "faltaAnterior" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "TipoOcorrenciaAutomatica" AS ENUM ('FALTA', 'NAO_RETORNO_INTERVALO');

-- CreateTable
CREATE TABLE "exclusoes_ocorrencia_automatica" (
    "id" TEXT NOT NULL,
    "tipo" "TipoOcorrenciaAutomatica" NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "excluidaPorId" TEXT,
    "excluidaPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exclusoes_ocorrencia_automatica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exclusoes_ocorrencia_automatica_tipo_pessoaId_data_key" ON "exclusoes_ocorrencia_automatica"("tipo", "pessoaId", "data");

-- CreateIndex
CREATE INDEX "exclusoes_ocorrencia_automatica_tipo_data_idx" ON "exclusoes_ocorrencia_automatica"("tipo", "data");

-- CreateIndex
CREATE INDEX "exclusoes_ocorrencia_automatica_colaboradorId_idx" ON "exclusoes_ocorrencia_automatica"("colaboradorId");
