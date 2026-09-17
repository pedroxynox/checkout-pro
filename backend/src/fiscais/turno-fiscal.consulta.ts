/**
 * A leitura das fichas dos fiscais — o lado com banco de `turno-fiscal.ts`.
 *
 * Resolver o turno de um fiscal exige três tabelas: `Fiscal` (a identidade que a
 * batida do ponto usa), `Usuario` (a conta que liga uma à outra) e `Colaborador`
 * (a ficha, que é a fonte do horário). Sete caminhos precisam desse trio, e
 * quando cada um o montava por conta própria bastava um `select` esquecido para
 * que um deles resolvesse um turno pela metade.
 *
 * Aqui é uma consulta só, com o `select` completo, usada por todos.
 */

import { PrismaService } from '../prisma/prisma.service';
import { entradaEsperadaNoDia } from '../escala-domingo/escala-domingo.domain';
import {
  FiscalComFicha,
  SELECT_FICHA_TURNO,
  dataDeReferencia,
  fiscaisComFicha,
} from './turno-fiscal';

/**
 * Todos os fiscais com a sua ficha resolvida, em ordem de nome. Fiscais sem
 * ficha ficam de fora (ver `fiscaisComFicha`).
 *
 * A quarta consulta merece explicação: lê da cópia semanal **apenas o vínculo**
 * `funcionarioId → colaboradorId`, nunca um horário. Esse vínculo foi gravado
 * quando a conta de acesso do fiscal ainda existia, e é o único jeito de
 * reconhecer a ficha de quem teve a conta desvinculada depois. É um resquício, e
 * some com a tabela na etapa 3 — o que a etapa 3 tem de resolver antes é dar ao
 * vínculo Fiscal → Colaborador um lugar próprio.
 */
export async function carregarFiscaisComFicha(
  prisma: PrismaService,
  incluirInativos = false,
): Promise<FiscalComFicha[]> {
  const [fiscais, usuarios, fichas, vinculos] = await Promise.all([
    prisma.fiscal.findMany({
      select: { id: true, nome: true, usuarioId: true },
    }),
    prisma.usuario.findMany({ select: { id: true, login: true } }),
    prisma.colaborador.findMany({ select: SELECT_FICHA_TURNO }),
    prisma.escalaEntry.findMany({
      where: { colaboradorId: { not: null } },
      select: { funcionarioId: true, colaboradorId: true },
    }),
  ]);
  const vinculosGravados = new Map<string, string>();
  for (const v of vinculos) {
    if (v.colaboradorId) vinculosGravados.set(v.funcionarioId, v.colaboradorId);
  }
  return fiscaisComFicha(fiscais, usuarios, fichas, {
    vinculosGravados,
    incluirInativos,
  });
}

/**
 * Hora de entrada prevista por fiscal e dia da semana (`Fiscal.id` → diaSemana →
 * "HH:mm"), derivada da ficha. Dias de folga e dias sem horário cadastrado ficam
 * fora do mapa.
 *
 * É um retrato por **dia da semana**, não por data: não há feriado nem posição no
 * rodízio de domingo a considerar, e por isso o domingo de quem está no rodízio
 * não aparece. Serve aos relatórios que olham a semana inteira de uma vez (o
 * ranking de pontualidade e os alertas de padrão); quem precisa de um dia concreto
 * usa a escala consolidada.
 */
export async function entradasPrevistasPorFiscal(
  prisma: PrismaService,
  incluirInativos = true,
): Promise<Map<string, Map<number, string>>> {
  const comFicha = await carregarFiscaisComFicha(prisma, incluirInativos);
  const out = new Map<string, Map<number, string>>();
  for (const f of comFicha) {
    const porDia = new Map<number, string>();
    for (let dia = 0; dia <= 6; dia++) {
      const entrada = entradaEsperadaNoDia(
        f.ficha,
        dataDeReferencia(dia),
        null,
      );
      if (entrada) porDia.set(dia, entrada);
    }
    if (porDia.size > 0) out.set(f.fiscalId, porDia);
  }
  return out;
}
