-- Aprendizado do leitor de ponto: memoriza que um NOME LIDO pelo OCR (texto
-- normalizado) corresponde a uma pessoa confirmada pelo usuário, para
-- reconhecê-la na hora nas próximas leituras do mesmo comprovante. Uma linha
-- por texto lido (único); `usos` conta as confirmações. Tabela nova e aditiva
-- — não afeta dados existentes.
CREATE TABLE "aliases_leitura_ponto" (
    "id" TEXT NOT NULL,
    "textoNome" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoaPonto" NOT NULL DEFAULT 'FISCAL',
    "colaboradorId" TEXT,
    "nome" TEXT NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aliases_leitura_ponto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aliases_leitura_ponto_textoNome_key" ON "aliases_leitura_ponto"("textoNome");
