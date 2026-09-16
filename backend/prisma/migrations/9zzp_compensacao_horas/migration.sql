-- COMPENSAÇÃO DE HORAS (ADR 0021).
--
-- Primeira tabela de exceção de escala POR DATA: até aqui a escala era por dia
-- da semana (`escala_entries`) e a folga fixa vivia na ficha do colaborador, de
-- modo que não havia onde registrar "esta pessoa, NESTE dia, trabalha menos
-- para consumir o próprio saldo de horas de 50%".
--
-- Mudança puramente ADITIVA: cria dois tipos e uma tabela nova, sem alterar
-- nenhuma coluna existente. Nada no sistema muda de comportamento até a
-- primeira compensação ser aprovada — uma tabela vazia é indistinguível do
-- estado anterior para o cálculo da jornada.
--
-- Não existe estado "SUGERIDA": as sugestões são calculadas a cada consulta,
-- como todo número de jornada neste sistema, e só a DECISÃO do gestor é
-- gravada.

CREATE TYPE "StatusCompensacao" AS ENUM ('APROVADA', 'RECUSADA', 'CANCELADA');

CREATE TYPE "OrigemCompensacao" AS ENUM ('SUGESTAO', 'MANUAL');

CREATE TABLE "compensacoes_horas" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    -- minutosCompensados + minutosTrabalhados = carga do dia. Em MINUTOS, a
    -- unidade em que o gestor pensa (e sem BigInt na serialização).
    "minutosCompensados" INTEGER NOT NULL,
    "minutosTrabalhados" INTEGER NOT NULL,
    "horaInicio" TEXT,
    "horaFim" TEXT,
    -- Jornada curta encerra sem intervalo (até 4h50 no contrato 6x1): muda o
    -- que se espera do ponto no dia (duas batidas em vez de quatro).
    "semIntervalo" BOOLEAN NOT NULL DEFAULT true,
    "status" "StatusCompensacao" NOT NULL,
    "origem" "OrigemCompensacao" NOT NULL DEFAULT 'SUGESTAO',
    -- Retrato da justificativa no instante da decisão: venda e cobertura mudam
    -- com o tempo, e sem o retrato não há como explicar meses depois por que
    -- aquele dia foi escolhido.
    "motivo" TEXT,
    "vendaPrevista" DECIMAL(14,2),
    "fonteVendaPrevista" TEXT,
    "saldo50MinNaEpoca" INTEGER,
    "coberturaNoDia" INTEGER,
    "criadoPor" TEXT,
    "criadoPorNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoPor" TEXT,
    "decididoPorNome" TEXT,
    "decididoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensacoes_horas_pkey" PRIMARY KEY ("id")
);

-- Uma decisão por pessoa por dia: reaprovar, recusar ou cancelar ATUALIZA a
-- linha, em vez de acumular decisões contraditórias para o mesmo dia.
CREATE UNIQUE INDEX "compensacoes_horas_colaboradorId_data_key" ON "compensacoes_horas"("colaboradorId", "data");

-- A jornada carrega as compensações de um ciclo por intervalo de datas.
CREATE INDEX "compensacoes_horas_data_idx" ON "compensacoes_horas"("data");

-- O painel filtra as aprovadas do período.
CREATE INDEX "compensacoes_horas_status_data_idx" ON "compensacoes_horas"("status", "data");
