/**
 * A ÚNICA leitura das exceções de horário da escala.
 *
 * Existia byte por byte igual em dois serviços (`EscalaExportacaoService` e
 * `OperadorTurnoService`) — as duas telas que decidem "o que esta pessoa faz
 * neste dia". Já foi trabalho unificar a DECISÃO em `montarLinhaEscala` depois de
 * as duas discordarem em produção (o quadro mostrava 08:00 onde a escala mostrava
 * 07:00); deixar dois carregamentos do mesmo INGREDIENTE é manter aberta a porta
 * pela qual aquele bug entrou.
 *
 * É uma função livre, e não um serviço, porque o único ingrediente é o Prisma —
 * dependência **obrigatória** nos dois chamadores. Injetá-la de forma opcional
 * criaria um modo silencioso "exceções de horário ignoradas", pior do que a
 * duplicação que se está removendo.
 */
import { PrismaService } from '../prisma/prisma.service';
import { HorarioEspecialDia } from './escala-publicada.domain';

/**
 * Exceções de horário por pessoa e dia da semana (`colaboradorId|diaSemana`).
 *
 * Só as marcadas como `especial`: são as que existem justamente para prevalecer
 * sobre o turno do cadastro. Entradas sem `colaboradorId` (escalas antigas, sem
 * vínculo com a ficha) são ignoradas — sem a ficha não há como saber com segurança
 * de quem é a exceção, e aplicá-la no palpite seria pior do que não aplicar.
 */
export async function carregarHorariosEspeciais(
  prisma: PrismaService,
): Promise<Map<string, HorarioEspecialDia>> {
  const entries = await prisma.escalaEntry.findMany({
    where: { especial: true, colaboradorId: { not: null } },
    select: {
      colaboradorId: true,
      diaSemana: true,
      entrada: true,
      saida: true,
      folga: true,
    },
  });
  const mapa = new Map<string, HorarioEspecialDia>();
  for (const e of entries) {
    mapa.set(`${e.colaboradorId}|${e.diaSemana}`, {
      entrada: e.entrada ?? null,
      saida: e.saida ?? null,
      folga: e.folga,
    });
  }
  return mapa;
}
