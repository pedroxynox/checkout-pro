-- Dedup do aviso "bateu ponto em dia marcado como FOLGA".
--
-- O registro em dia de folga passou a ser PERMITIDO: na prática ele quase sempre
-- significa que a folga da pessoa mudou e o cadastro não foi atualizado, e
-- recusar o ponto deixava a pessoa trabalhar sem registro enquanto o erro de
-- cadastro seguia invisível. Agora o ponto entra e o gestor é avisado.
--
-- Esta tabela é a trava do aviso: UMA notificação por pessoa e dia, mesmo com
-- quatro batidas no mesmo dia, reinícios do servidor ou várias instâncias. O
-- índice único é o que garante a atomicidade (reserva -> envia), o mesmo padrão
-- de `alertas_atraso_enviados` e `alertas_tac_enviados`.
--
-- `resolvidoEm` marca o momento em que a divergência deixou de existir (o gestor
-- corrigiu a escala e o dia não é mais folga). Guardar em vez de apagar serve a
-- dois propósitos: avisar "resolvido" uma única vez, e deixar rastro de que a
-- correção aconteceu.
CREATE TABLE "avisos_ponto_em_folga" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "dia" TIMESTAMP(3) NOT NULL,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvidoEm" TIMESTAMP(3),

    CONSTRAINT "avisos_ponto_em_folga_pkey" PRIMARY KEY ("id")
);

-- A trava: uma linha por pessoa/dia.
CREATE UNIQUE INDEX "avisos_ponto_em_folga_pessoaId_dia_key"
    ON "avisos_ponto_em_folga"("pessoaId", "dia");

-- A varredura busca os avisos ainda não resolvidos do ciclo aberto.
CREATE INDEX "avisos_ponto_em_folga_resolvidoEm_dia_idx"
    ON "avisos_ponto_em_folga"("resolvidoEm", "dia");
