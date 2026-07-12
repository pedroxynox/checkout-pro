-- Auditoria/exibição dos movimentos de estoque: nomes (snapshot) de quem
-- registrou a saída (ou aprovou a entrada) e de quem requisitou. Colunas
-- nullable — não afetam movimentos já existentes.
ALTER TABLE "movimentos_estoque" ADD COLUMN "responsavelNome" TEXT;
ALTER TABLE "movimentos_estoque" ADD COLUMN "requisitanteNome" TEXT;
