-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('GERENTE', 'FISCAL');

-- CreateEnum
CREATE TYPE "TipoRegistro" AS ENUM ('CANCELAMENTO', 'TROCO', 'RECARGA', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "CategoriaInsumo" AS ENUM ('SACOLA', 'BOBINA', 'PANO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('ABERTO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "StatusChecklist" AS ENUM ('PENDENTE', 'FEITO');

-- CreateEnum
CREATE TYPE "TipoChecklist" AS ENUM ('ABERTURA', 'FECHAMENTO');

-- CreateEnum
CREATE TYPE "StatusFiscal" AS ENUM ('DISPONIVEL', 'EM_INTERVALO', 'EM_ATENDIMENTO');

-- CreateEnum
CREATE TYPE "TurnoFiscal" AS ENUM ('ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operadores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscais" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "turno" "TurnoFiscal" NOT NULL,
    "especial" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_operacionais" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRegistro" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "importacaoId" TEXT,
    "operadorId" TEXT,
    "fiscalId" TEXT,

    CONSTRAINT "registros_operacionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_importacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoRegistro" NOT NULL,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPor" TEXT,
    "nomesNaoReconhecidos" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "registros_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_diarias" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "vendas_diarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_apae" (
    "id" TEXT NOT NULL,
    "quantidadeInicial" INTEGER NOT NULL,
    "saldoAtual" INTEGER NOT NULL,
    "quantidadeVendida" INTEGER NOT NULL DEFAULT 0,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataEncerramento" TIMESTAMP(3),
    "status" "StatusLote" NOT NULL DEFAULT 'ABERTO',

    CONSTRAINT "lotes_apae_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaInsumo" NOT NULL,
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "limiteMinimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fardos" (
    "id" TEXT NOT NULL,
    "codigoBarras" TEXT NOT NULL,
    "quantidadeSacolas" INTEGER NOT NULL,

    CONSTRAINT "fardos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_estoque" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "responsavelId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destino" TEXT,
    "pdvId" TEXT,

    CONSTRAINT "movimentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_fiscais" (
    "id" TEXT NOT NULL,
    "fiscalId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "statusAtual" "StatusFiscal" NOT NULL DEFAULT 'DISPONIVEL',
    "statusDefinidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_entries" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "entrada" TEXT,
    "saida" TEXT,
    "intervaloMin" INTEGER NOT NULL DEFAULT 0,
    "folga" BOOLEAN NOT NULL DEFAULT false,
    "especial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "escala_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" TEXT NOT NULL,
    "tipo" "TipoChecklist" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "status" "StatusChecklist" NOT NULL DEFAULT 'PENDENTE',
    "imagemUrl" TEXT,
    "enviadoPor" TEXT,
    "enviadoEm" TIMESTAMP(3),

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausencias" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "canalPush" BOOLEAN NOT NULL DEFAULT false,
    "canalInApp" BOOLEAN NOT NULL DEFAULT false,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE UNIQUE INDEX "operadores_nome_key" ON "operadores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "fiscais_nome_key" ON "fiscais"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "fiscais_usuarioId_key" ON "fiscais"("usuarioId");

-- CreateIndex
CREATE INDEX "registros_operacionais_tipo_data_idx" ON "registros_operacionais"("tipo", "data");

-- CreateIndex
CREATE INDEX "registros_importacao_dataReferencia_idx" ON "registros_importacao"("dataReferencia");

-- CreateIndex
CREATE UNIQUE INDEX "vendas_diarias_data_key" ON "vendas_diarias"("data");

-- CreateIndex
CREATE UNIQUE INDEX "fardos_codigoBarras_key" ON "fardos"("codigoBarras");

-- CreateIndex
CREATE INDEX "movimentos_estoque_insumoId_idx" ON "movimentos_estoque"("insumoId");

-- CreateIndex
CREATE INDEX "sessoes_fiscais_fiscalId_idx" ON "sessoes_fiscais"("fiscalId");

-- CreateIndex
CREATE INDEX "escala_entries_funcionarioId_diaSemana_idx" ON "escala_entries"("funcionarioId", "diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "checklists_tipo_data_key" ON "checklists"("tipo", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ausencias_pessoaId_data_key" ON "ausencias"("pessoaId", "data");

-- CreateIndex
CREATE INDEX "notificacoes_usuarioId_idx" ON "notificacoes"("usuarioId");

-- AddForeignKey
ALTER TABLE "fiscais" ADD CONSTRAINT "fiscais_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_operacionais" ADD CONSTRAINT "registros_operacionais_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "registros_importacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_operacionais" ADD CONSTRAINT "registros_operacionais_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "operadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_operacionais" ADD CONSTRAINT "registros_operacionais_fiscalId_fkey" FOREIGN KEY ("fiscalId") REFERENCES "fiscais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_importacao" ADD CONSTRAINT "registros_importacao_importadoPor_fkey" FOREIGN KEY ("importadoPor") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_fiscais" ADD CONSTRAINT "sessoes_fiscais_fiscalId_fkey" FOREIGN KEY ("fiscalId") REFERENCES "fiscais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

