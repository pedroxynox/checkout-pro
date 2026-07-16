-- Protecao da memoria de nomes do leitor de ponto. Migracao SOMENTE aditiva:
-- adiciona ao alias os campos do "desafiante pendente". Quando uma leitura e
-- confirmada para uma pessoa DIFERENTE da ja aprendida, a troca nao e imediata:
-- guarda-se a pessoa proposta e a contagem de confirmacoes repetidas; so ao
-- atingir o limiar a associacao principal e substituida. Nao altera dados nem
-- as associacoes existentes (defaults nulos / 0).

-- AlterTable
ALTER TABLE "aliases_leitura_ponto"
  ADD COLUMN "pendentePessoaId" TEXT,
  ADD COLUMN "pendenteTipoPessoa" "TipoPessoaPonto",
  ADD COLUMN "pendenteColaboradorId" TEXT,
  ADD COLUMN "pendenteNome" TEXT,
  ADD COLUMN "pendenteUsos" INTEGER NOT NULL DEFAULT 0;
