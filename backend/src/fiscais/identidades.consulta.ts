/**
 * As IDENTIDADES de uma pessoa, num lugar só.
 *
 * Um fiscal existe duas vezes no banco: a **ficha** (`Colaborador.id`, a fonte
 * canônica) e o registro legado de **fiscal** (`Fiscal.id`, por onde ele bate
 * ponto e por onde a escala semanal é gravada). É a dívida registrada no
 * [ADR 0020](../../../docs/02-arquitetura/decisoes/0020-mudanca-de-funcao-preserva-o-ponto.md),
 * e enquanto ela existir **toda** consulta sobre ponto, ausência, escala ou folga
 * tem de cobrir as duas chaves.
 *
 * Esta carga existe porque o mesmo par de consultas mais a mesma inversão do
 * mapa estavam copiados em três serviços (Central de Jornada, Compensação de
 * horas e — faltando, que foi o bug — a escala publicada). O ingrediente
 * duplicado é a porta pela qual o esquecimento entra: a escala publicada
 * perguntava à regra de folga por **uma** identidade só, e a folga escrita sob a
 * outra ficava invisível justamente no documento que a equipe lê.
 *
 * Função livre, e não serviço injetado, pelo mesmo motivo de
 * `escala-especiais.consulta.ts`: o único ingrediente é o Prisma, e injetá-la de
 * forma opcional criaria um modo silencioso "identidades ignoradas" — pior do que
 * a duplicação que se está removendo.
 */
import { PrismaService } from '../prisma/prisma.service';
import { mapearFiscalColaborador } from './colaborador-vinculo';

/**
 * `Colaborador.id` → ids de fiscal que pertencem àquela ficha (por conta de
 * acesso ou, em fallback, por matrícula — a MESMA regra do runtime).
 *
 * Normalmente zero ou um id por ficha; pode haver mais de um quando registros
 * `Fiscal` duplicados foram criados ao longo do tempo, e é exatamente por isso
 * que o valor é uma lista: descartar o duplicado silenciosamente é perder de
 * vista a escala que ele carrega.
 */
export async function carregarFiscalIdsPorColaborador(
  prisma: PrismaService,
): Promise<Map<string, string[]>> {
  const [fiscais, usuarios, colaboradores] = await Promise.all([
    prisma.fiscal.findMany({
      select: { id: true, nome: true, usuarioId: true },
    }),
    prisma.usuario.findMany({ select: { id: true, login: true } }),
    prisma.colaborador.findMany({
      select: { id: true, nome: true, matricula: true, usuarioId: true },
    }),
  ]);

  const porColaborador = new Map<string, string[]>();
  for (const [fiscalId, vinculo] of mapearFiscalColaborador(
    fiscais,
    usuarios,
    colaboradores,
  )) {
    const atuais = porColaborador.get(vinculo.colaboradorId) ?? [];
    atuais.push(fiscalId);
    porColaborador.set(vinculo.colaboradorId, atuais);
  }
  return porColaborador;
}

/**
 * O inverso: `Fiscal.id` → `Colaborador.id`. Serve para descobrir de **quem** é
 * uma linha antiga que só guarda o `funcionarioId`.
 */
export async function carregarColaboradorPorFiscalId(
  prisma: PrismaService,
): Promise<Map<string, string>> {
  const porColaborador = await carregarFiscalIdsPorColaborador(prisma);
  const porFiscal = new Map<string, string>();
  for (const [colaboradorId, fiscalIds] of porColaborador) {
    for (const fiscalId of fiscalIds) porFiscal.set(fiscalId, colaboradorId);
  }
  return porFiscal;
}

/**
 * Todas as identidades de uma ficha, para passar às consultas que aceitam lista
 * (`FolgaService.ehFolga`, buscas de ponto e de ausência).
 */
export function identidadesDaFicha(
  colaboradorId: string,
  fiscalIdsPorColaborador: Map<string, string[]>,
): string[] {
  return [colaboradorId, ...(fiscalIdsPorColaborador.get(colaboradorId) ?? [])];
}
