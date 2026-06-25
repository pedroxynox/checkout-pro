-- Cadastro Unificado de Colaboradores: pessoa canônica (matrícula como
-- registro) + identificadores (login/matrícula) que resolvem os movimentos.
-- Aditivo: novas tabelas + colunas nullable. NÃO remove nem altera dados.

-- Enums
CREATE TYPE "FuncaoColaborador" AS ENUM ('OPERADOR', 'FISCAL', 'SUPERVISOR', 'GESTOR');
CREATE TYPE "TurnoColaborador" AS ENUM ('ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO', 'APOIO');
CREATE TYPE "TipoIdentificador" AS ENUM ('MATRICULA', 'LOGIN');

-- Pessoa canônica
CREATE TABLE "colaboradores" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcao" "FuncaoColaborador" NOT NULL,
    "genero" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "turno" "TurnoColaborador",
    "entradaSemana" TEXT,
    "saidaSemana" TEXT,
    "entradaFds" TEXT,
    "saidaFds" TEXT,
    "folgaDiaSemana" INTEGER,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "colaboradores_matricula_key" ON "colaboradores"("matricula");
CREATE UNIQUE INDEX "colaboradores_usuarioId_key" ON "colaboradores"("usuarioId");

-- Identificadores (login/matrícula -> colaborador)
CREATE TABLE "colaborador_identificadores" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoIdentificador" NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "colaborador_identificadores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "colaborador_identificadores_tipo_valor_key" ON "colaborador_identificadores"("tipo", "valor");
CREATE INDEX "colaborador_identificadores_colaboradorId_idx" ON "colaborador_identificadores"("colaboradorId");
ALTER TABLE "colaborador_identificadores"
  ADD CONSTRAINT "colaborador_identificadores_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Vínculos nos movimentos (nullable durante a transição)
ALTER TABLE "registros_arrecadacao" ADD COLUMN "colaboradorId" TEXT;
ALTER TABLE "registros_arrecadacao" ADD COLUMN "autorizadoPorId" TEXT;
CREATE INDEX "registros_arrecadacao_colaboradorId_idx" ON "registros_arrecadacao"("colaboradorId");

ALTER TABLE "ausencias" ADD COLUMN "colaboradorId" TEXT;
CREATE INDEX "ausencias_colaboradorId_idx" ON "ausencias"("colaboradorId");

ALTER TABLE "escala_entries" ADD COLUMN "colaboradorId" TEXT;
CREATE INDEX "escala_entries_colaboradorId_idx" ON "escala_entries"("colaboradorId");

ALTER TABLE "registros_ponto_fiscal" ADD COLUMN "colaboradorId" TEXT;
CREATE INDEX "registros_ponto_fiscal_colaboradorId_idx" ON "registros_ponto_fiscal"("colaboradorId");
