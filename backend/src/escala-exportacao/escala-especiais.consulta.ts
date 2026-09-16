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
import { carregarColaboradorPorFiscalId } from '../fiscais/identidades.consulta';
import { HorarioEspecialDia } from './escala-publicada.domain';

/**
 * Exceções de horário por pessoa e dia da semana (`colaboradorId|diaSemana`).
 *
 * Só as marcadas como `especial`: são as que existem justamente para prevalecer
 * sobre o turno do cadastro.
 *
 * ## As entradas sem `colaboradorId`
 *
 * Antes eram simplesmente ignoradas, porque "sem a ficha não há como saber de
 * quem é a exceção". A premissa estava errada: **há** como saber. Um fiscal tem
 * duas identidades, e a linha guarda a outra (`funcionarioId` = `Fiscal.id`); o
 * vínculo `Fiscal → Colaborador` a traduz, com a mesma regra que o resto do
 * sistema usa em runtime (conta de acesso e, em fallback, matrícula).
 *
 * O que se perdia não era pouco: uma convocação ou uma dispensa gravadas antes de
 * o vínculo existir desapareciam da escala publicada — o documento que a equipe
 * recebe — enquanto a regra de folga continuava a enxergá-las pelo
 * `funcionarioId`. Duas superfícies, duas respostas sobre o mesmo dia.
 *
 * A tradução só é feita quando existe alguma linha órfã, para o caminho comum não
 * pagar duas consultas que não usa. Quando as duas chaves apontam para o mesmo
 * par pessoa/dia, vence a linha que traz o `colaboradorId` gravado: é o vínculo
 * explícito, não o inferido.
 */
export async function carregarHorariosEspeciais(
  prisma: PrismaService,
): Promise<Map<string, HorarioEspecialDia>> {
  const entries = await prisma.escalaEntry.findMany({
    where: { especial: true },
    select: {
      funcionarioId: true,
      colaboradorId: true,
      diaSemana: true,
      entrada: true,
      saida: true,
      folga: true,
    },
  });

  const orfas = entries.filter((e) => !e.colaboradorId);
  const donoPorFiscalId = orfas.length
    ? await carregarColaboradorPorFiscalId(prisma)
    : new Map<string, string>();

  const mapa = new Map<string, HorarioEspecialDia>();
  const registrar = (colaboradorId: string, e: (typeof entries)[number]) => {
    mapa.set(`${colaboradorId}|${e.diaSemana}`, {
      entrada: e.entrada ?? null,
      saida: e.saida ?? null,
      folga: e.folga,
    });
  };

  // Órfãs primeiro; as de vínculo explícito sobrescrevem em caso de empate.
  for (const e of orfas) {
    const dono = donoPorFiscalId.get(e.funcionarioId);
    if (dono) registrar(dono, e);
  }
  for (const e of entries) {
    if (e.colaboradorId) registrar(e.colaboradorId, e);
  }
  return mapa;
}
