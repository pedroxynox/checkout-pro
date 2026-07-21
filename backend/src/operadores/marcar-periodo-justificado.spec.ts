import { marcarPeriodoJustificado } from './marcar-periodo-justificado';

/**
 * Primitiva compartilhada do "período justificado" (usada pela ausência a prazo
 * e pelo atestado): cria uma falta por dia corrido do intervalo e CONVERTE (não
 * duplica) os dias que já tinham falta, gravando os mesmos `dados` em ambos.
 */
describe('marcarPeriodoJustificado', () => {
  const dia = (d: number): Date => new Date(Date.UTC(2026, 6, d));

  function txFake() {
    const criadas: Record<string, unknown>[] = [];
    const atualizadas: { id: string; data: Record<string, unknown> }[] = [];
    const tx = {
      ausencia: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: (args: any) => {
          criadas.push(args.data);
          return Promise.resolve({});
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: (args: any) => {
          atualizadas.push({ id: args.where.id, data: args.data });
          return Promise.resolve({});
        },
      },
    };
    return { tx, criadas, atualizadas };
  }

  it('cria um dia por data e converte os que já existem (sem duplicar)', async () => {
    const { tx, criadas, atualizadas } = txFake();
    const idPorDia = new Map<number, string>([
      [dia(21).getTime(), 'existente-21'],
    ]);
    const r = await marcarPeriodoJustificado(tx as never, {
      pessoaId: 'col-1',
      inicio: dia(20),
      fim: dia(22),
      autor: { id: 'u1', nome: 'Gestor' },
      idPorDia,
      dados: {
        colaboradorId: 'col-1',
        statusJustificativa: 'JUSTIFICADA',
        motivoJustificativa: 'LICENCA',
        aPrazo: true,
      },
    });

    // 20 e 22 são novos; 21 já existia → convertido.
    expect(r).toEqual({ criadas: 2, atualizadas: 1 });
    expect(atualizadas.map((u) => u.id)).toEqual(['existente-21']);
    expect(criadas).toHaveLength(2);
    // Tanto o create quanto o update recebem os MESMOS `dados`.
    expect(atualizadas[0].data).toMatchObject({
      colaboradorId: 'col-1',
      aPrazo: true,
      motivoJustificativa: 'LICENCA',
    });
    for (const c of criadas) {
      expect(c).toMatchObject({
        pessoaId: 'col-1',
        colaboradorId: 'col-1',
        aPrazo: true,
        registradaPorId: 'u1',
      });
    }
  });
});
