import { analisarFaltas } from './operadores.domain';
import { OperadoresService } from './operadores.service';
import {
  AusenciaNaoEncontradaError,
  JustificativaInvalidaError,
} from './operadores.errors';

/**
 * Justificativa de faltas: a taxa EFETIVA (ponderada) cai quando há faltas
 * justificadas, sem alterar a contagem crua; e o serviço grava/valida/limpa a
 * justificativa com auditoria.
 */
describe('Justificativa de faltas', () => {
  const INICIO = new Date(Date.UTC(2026, 2, 1));
  const FIM = new Date(Date.UTC(2026, 2, 28));
  const OP = { id: 'op1', nome: 'Ana', folgaDiaSemana: 0 };
  const dia = (d: number): Date => new Date(Date.UTC(2026, 2, d));

  it('taxa ponderada = taxa crua quando tudo está PENDENTE', () => {
    const ausencias = [dia(2), dia(3), dia(4), dia(5)].map((data) => ({
      pessoaId: 'op1',
      data,
    }));
    const r = analisarFaltas({
      operadores: [OP],
      ausencias,
      ausenciasAnterior: [],
      inicio: INICIO,
      fimEscala: FIM,
    });
    const det = r.porOperador[0];
    expect(det.quantidade).toBe(4);
    expect(det.justificadas).toBe(0);
    expect(det.taxaPonderada).toBe(det.taxa);
  });

  it('faltas justificadas por atestado quase não pesam (taxa ponderada << crua)', () => {
    const ausencias = [
      {
        pessoaId: 'op1',
        data: dia(2),
        statusJustificativa: 'JUSTIFICADA' as const,
        motivoJustificativa: 'ATESTADO_MEDICO' as const,
      },
      {
        pessoaId: 'op1',
        data: dia(3),
        statusJustificativa: 'JUSTIFICADA' as const,
        motivoJustificativa: 'ATESTADO_MEDICO' as const,
      },
      { pessoaId: 'op1', data: dia(4) },
      { pessoaId: 'op1', data: dia(5) },
    ];
    const r = analisarFaltas({
      operadores: [OP],
      ausencias,
      ausenciasAnterior: [],
      inicio: INICIO,
      fimEscala: FIM,
    });
    const det = r.porOperador[0];
    expect(det.quantidade).toBe(4); // contagem crua intacta
    expect(det.justificadas).toBe(2);
    expect(det.taxaPonderada).toBeLessThan(det.taxa);
  });

  // ---- Serviço ----
  interface AusFake {
    id: string;
    pessoaId: string;
    data: Date;
    statusJustificativa: string;
    motivoJustificativa: string | null;
    observacaoJustificativa: string | null;
    justificadaPorId: string | null;
    justificadaPorNome: string | null;
    justificadaEm: Date | null;
  }

  function criar(seed: Partial<AusFake> & { id: string }) {
    const linhas: AusFake[] = [
      {
        pessoaId: 'p1',
        data: new Date(Date.UTC(2026, 2, 2)),
        statusJustificativa: 'PENDENTE',
        motivoJustificativa: null,
        observacaoJustificativa: null,
        justificadaPorId: null,
        justificadaPorNome: null,
        justificadaEm: null,
        ...seed,
      },
    ];
    const prisma = {
      ausencia: {
        findUnique: ({ where: { id } }: any) =>
          Promise.resolve(linhas.find((l) => l.id === id) ?? null),
        update: ({ where: { id }, data }: any) => {
          const l = linhas.find((x) => x.id === id)!;
          Object.assign(l, data);
          return Promise.resolve({ ...l });
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { service: new OperadoresService(prisma as any), linhas };
  }

  it('justificar sem motivo é rejeitado (400)', async () => {
    const { service } = criar({ id: 'a1' });
    await expect(
      service.justificarAusencia('a1', { status: 'JUSTIFICADA' }, {}),
    ).rejects.toBeInstanceOf(JustificativaInvalidaError);
  });

  it('404 quando a ausência não existe', async () => {
    const { service } = criar({ id: 'a1' });
    await expect(
      service.justificarAusencia(
        'inexistente',
        { status: 'JUSTIFICADA', motivo: 'ABONADA' },
        {},
      ),
    ).rejects.toBeInstanceOf(AusenciaNaoEncontradaError);
  });

  it('grava a justificativa com motivo e auditoria (quem/quando)', async () => {
    const { service, linhas } = criar({ id: 'a1' });
    await service.justificarAusencia(
      'a1',
      {
        status: 'JUSTIFICADA',
        motivo: 'ATESTADO_MEDICO',
        observacao: 'atestado 2 dias',
      },
      { id: 'g1', nome: 'Gestor' },
    );
    expect(linhas[0].statusJustificativa).toBe('JUSTIFICADA');
    expect(linhas[0].motivoJustificativa).toBe('ATESTADO_MEDICO');
    expect(linhas[0].justificadaPorNome).toBe('Gestor');
    expect(linhas[0].justificadaEm).toBeInstanceOf(Date);
  });

  it('reabrir (PENDENTE) limpa motivo e auditoria', async () => {
    const { service, linhas } = criar({
      id: 'a1',
      statusJustificativa: 'JUSTIFICADA',
      motivoJustificativa: 'ABONADA',
      justificadaPorNome: 'Gestor',
      justificadaEm: new Date(),
    });
    await service.justificarAusencia(
      'a1',
      { status: 'PENDENTE' },
      { id: 'g1', nome: 'Gestor' },
    );
    expect(linhas[0].statusJustificativa).toBe('PENDENTE');
    expect(linhas[0].motivoJustificativa).toBeNull();
    expect(linhas[0].justificadaPorNome).toBeNull();
    expect(linhas[0].justificadaEm).toBeNull();
  });
});
