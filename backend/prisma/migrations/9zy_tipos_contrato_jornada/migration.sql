-- Catálogo de tipos de contrato de jornada (data-driven, editável pela gestão).
-- Aditiva: cria a tabela e semeia o contrato vigente "6x1 - 2x1" como
-- padrão/ativo, com os MESMOS valores usados hoje no código (em minutos).

CREATE TABLE "TipoContratoJornada" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "cargaBaseMinPorDia" INTEGER[],
    "diasComAdicional100" INTEGER[],
    "maxTrabalhoSemIntervaloMin" INTEGER NOT NULL,
    "intervaloMinimoMin" INTEGER NOT NULL,
    "intervaloMaximoMin" INTEGER NOT NULL,
    "limiteExtrasMin" INTEGER NOT NULL,
    "riscoTac1h30Min" INTEGER NOT NULL,
    "riscoTac1h40Min" INTEGER NOT NULL,
    "intervaloMinimoEntreBatidasMin" INTEGER NOT NULL DEFAULT 2,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TipoContratoJornada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TipoContratoJornada_nome_key" ON "TipoContratoJornada"("nome");

-- Semeia o contrato vigente (6x1 - 2x1). Carga base em minutos por dia da
-- semana (0=domingo): dom 7h20 (440), seg-qui 7h (420), sex-sáb 8h (480).
-- Domingo com adicional de 100%. TAC a 1h50 (110), intervalo 1h–3h (60/180),
-- risco preventivo 1h30/1h40 (90/100), duplicidade < 2 min.
INSERT INTO "TipoContratoJornada" (
    "id", "nome", "descricao", "ativo", "padrao",
    "cargaBaseMinPorDia", "diasComAdicional100",
    "maxTrabalhoSemIntervaloMin", "intervaloMinimoMin", "intervaloMaximoMin",
    "limiteExtrasMin", "riscoTac1h30Min", "riscoTac1h40Min",
    "intervaloMinimoEntreBatidasMin"
) VALUES (
    'c0000000-0000-4000-8000-000000000601',
    '6x1 - 2x1',
    'Contrato vigente: Seg-Qui 7h, Sex-Sáb 8h, domingo/feriado 7h20 a 100%, TAC a 1h50, intervalo fora da jornada.',
    true, true,
    ARRAY[440, 420, 420, 420, 420, 480, 480], ARRAY[0],
    290, 60, 180,
    110, 90, 100,
    2
);
