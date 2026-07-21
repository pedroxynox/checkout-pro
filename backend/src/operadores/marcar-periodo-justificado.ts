import { Prisma } from '@prisma/client';

/** Um dia (00:00 UTC) em milissegundos (passo entre meias-noites, sem DST). */
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Campos gravados em CADA dia do período (justificativa + marcadores como
 * `aPrazo`, `colaboradorId` e — no atestado — `atestadoId`/`cid`). São os MESMOS
 * no create e no update. NÃO inclua `pessoaId`/`data` (o laço define) nem
 * `registradaPor*` (vêm do `autor`).
 */
export type DadosDiaPeriodo = Omit<
  Prisma.AusenciaUncheckedCreateInput,
  'pessoaId' | 'data' | 'registradaPorId' | 'registradaPorNome'
>;

/** Parâmetros de `marcarPeriodoJustificado`. */
export interface MarcarPeriodoJustificadoParams {
  pessoaId: string;
  /** Primeiro dia (00:00 UTC). */
  inicio: Date;
  /** Último dia (00:00 UTC), inclusive. */
  fim: Date;
  autor: { id?: string; nome?: string };
  /** Campos gravados em cada dia (justificativa + marcadores). */
  dados: DadosDiaPeriodo;
  /**
   * Faltas já existentes por dia no intervalo (timestamp de 00:00 UTC → id da
   * `Ausencia`), para CONVERTER em vez de duplicar. Vazio quando não há.
   */
  idPorDia: ReadonlyMap<number, string>;
}

/**
 * Marca uma falta JUSTIFICADA em CADA dia corrido de `[inicio, fim]`
 * (inclusive), convertendo os dias que já tinham falta em vez de duplicar.
 *
 * Roda DENTRO de uma transação (recebe o `tx`): a chamada é um único ato do
 * gestor (tudo-ou-nada). É a **fonte única** do "período justificado", usada
 * tanto pela ausência a prazo (`OperadoresService`) quanto pelo atestado
 * (`AtestadosService`) — antes o laço dia-a-dia era duplicado nos dois, com
 * risco de divergência (ex.: um gravar `colaboradorId` e o outro não).
 *
 * Devolve quantos dias foram criados e quantos convertidos.
 */
export async function marcarPeriodoJustificado(
  tx: Prisma.TransactionClient,
  params: MarcarPeriodoJustificadoParams,
): Promise<{ criadas: number; atualizadas: number }> {
  let criadas = 0;
  let atualizadas = 0;
  const fim = params.fim.getTime();
  for (let t = params.inicio.getTime(); t <= fim; t += UM_DIA_MS) {
    const existId = params.idPorDia.get(t);
    if (existId) {
      await tx.ausencia.update({ where: { id: existId }, data: params.dados });
      atualizadas += 1;
    } else {
      await tx.ausencia.create({
        data: {
          pessoaId: params.pessoaId,
          data: new Date(t),
          registradaPorId: params.autor.id ?? null,
          registradaPorNome: params.autor.nome ?? null,
          ...params.dados,
        },
      });
      criadas += 1;
    }
  }
  return { criadas, atualizadas };
}
