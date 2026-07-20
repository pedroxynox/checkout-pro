-- Catálogo de PRODUTOS PESADOS (balança), carregado de um ÚNICO arquivo .txt
-- (colunas separadas por tabulação) com TODOS os setores juntos. Guarda o
-- código de balança (CODACESSO) que o operador digita, o nome (DESCCOMPLETA),
-- o setor (CATEGORIA_NV2) e o tipo (CATEGORIA_NV3, opcional). A busca no app é
-- feita em memória sobre o catálogo inteiro; `nomeNormalizado` fica disponível
-- para uma futura busca no servidor. `descricao`/`fotoUrl` são aditivos e ainda
-- não usados (a foto dependerá de um storage de objetos/S3).
CREATE TABLE "produtos_pesados" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo" TEXT,
    "descricao" TEXT,
    "fotoUrl" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produtos_pesados_pkey" PRIMARY KEY ("id")
);

-- Um código é único por setor (o mesmo CODACESSO não se repete dentro da
-- categoria). Recarregar o arquivo substitui todo o catálogo.
CREATE UNIQUE INDEX "produtos_pesados_categoria_codigo_key" ON "produtos_pesados"("categoria", "codigo");

CREATE INDEX "produtos_pesados_categoria_idx" ON "produtos_pesados"("categoria");

CREATE INDEX "produtos_pesados_nomeNormalizado_idx" ON "produtos_pesados"("nomeNormalizado");
