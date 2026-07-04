-- Incidências de Escala: eventos de escala por DATA (ex.: "não retornou do
-- intervalo"). Tabela genérica por `tipo` para crescer sem novas tabelas.
-- Aditivo: novo enum + nova tabela + índices. NÃO remove nem altera dados.

-- Enum do tipo de incidência (primeiro evento: não retorno do intervalo).
CREATE TYPE "TipoIncidenciaEscala" AS ENUM ('NAO_RETORNO_INTERVALO');

-- Incidência por data (o horário esperado vem da escala; o real, do ponto).
CREATE TABLE "incidencias_escala" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "funcionarioId" TEXT,
    "tipo" "TipoIncidenciaEscala" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horaSaida" TEXT,
    "horaEsperadaRetorno" TEXT,
    "horaReal" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "motivo" TEXT,
    "observacao" TEXT,
    "registradoPorId" TEXT,
    "registradoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidencias_escala_pkey" PRIMARY KEY ("id")
);

-- No máximo uma incidência por (colaborador, tipo, data).
CREATE UNIQUE INDEX "incidencias_escala_colaboradorId_tipo_data_key"
    ON "incidencias_escala"("colaboradorId", "tipo", "data");

-- Índices de consulta (perfil, ranking, sugestões do dia).
CREATE INDEX "incidencias_escala_colaboradorId_data_idx"
    ON "incidencias_escala"("colaboradorId", "data");
CREATE INDEX "incidencias_escala_tipo_data_idx"
    ON "incidencias_escala"("tipo", "data");
CREATE INDEX "incidencias_escala_data_idx"
    ON "incidencias_escala"("data");
