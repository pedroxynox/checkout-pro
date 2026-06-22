-- Quadro de Operadores: turno fixo (horário Seg–Qui e Sex–Sáb) + dia de folga.

CREATE TABLE "operador_turnos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "entradaSemana" TEXT NOT NULL,
    "saidaSemana" TEXT NOT NULL,
    "entradaFds" TEXT NOT NULL,
    "saidaFds" TEXT NOT NULL,
    "folgaDiaSemana" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operador_turnos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operador_turnos_nome_key" ON "operador_turnos"("nome");
