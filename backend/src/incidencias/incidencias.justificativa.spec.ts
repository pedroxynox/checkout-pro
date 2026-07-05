import { IncidenciasService } from './incidencias.service';
import {
  DadosIncidenciaInvalidosError,
  IncidenciaNaoEncontradaError,
} from './incidencias.errors';

/**
 * Justificativa de incidências: `contarIncidenciasPonderadas` é PONDERADO
 * (justificados pesam menos) e o serviço grava/valida a justificativa.
 */
describe('Justificativa de não-retorno', () => {
  describe('contarIncidenciasPonderadas (ponderado)', () => {
    it('soma pesos: PENDENTE=1, JUSTIFICADO por atestado=0.02', async () => {
      const linhas = [
        { statusJustificativa: 'PENDENTE', motivoJustificativa: null },
        {
          statusJustificativa: 'JUSTIFICADA',
          motivoJustificativa: 'ATESTADO_MEDICO',
        },
      ];
      const prisma = {
        incidenciaEscala: {
          findMany: () => Promise.resolve(linhas),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const service = new IncidenciasService(prisma as any);
      const total = await service.contarIncidenciasPonderadas(
        'c1',
        new Date(Date.UTC(2026, 6, 1)),
        new Date(Date.UTC(2026, 7, 1)),
      );
      expect(total).toBeCloseTo(1.02, 5);
    });
  });

  describe('justificar', () => {
    function criar(seed: Record<string, unknown> = {}) {
      const linhas = [
        {
          id: 'i1',
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
        incidenciaEscala: {
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
      return { service: new IncidenciasService(prisma as any), linhas };
    }

    it('rejeita justificar sem motivo (400)', async () => {
      const { service } = criar();
      await expect(
        service.justificar('i1', { status: 'JUSTIFICADA' }, {}),
      ).rejects.toBeInstanceOf(DadosIncidenciaInvalidosError);
    });

    it('404 quando não existe', async () => {
      const { service } = criar();
      await expect(
        service.justificar(
          'x',
          { status: 'JUSTIFICADA', motivo: 'ABONADA' },
          {},
        ),
      ).rejects.toBeInstanceOf(IncidenciaNaoEncontradaError);
    });

    it('grava justificativa com auditoria e reabre limpando', async () => {
      const { service, linhas } = criar();
      await service.justificar(
        'i1',
        { status: 'JUSTIFICADA', motivo: 'ABONADA' },
        { id: 'g1', nome: 'Gestor' },
      );
      expect(linhas[0].statusJustificativa).toBe('JUSTIFICADA');
      expect(linhas[0].justificadaPorNome).toBe('Gestor');

      await service.justificar(
        'i1',
        { status: 'PENDENTE' },
        { id: 'g1', nome: 'Gestor' },
      );
      expect(linhas[0].statusJustificativa).toBe('PENDENTE');
      expect(linhas[0].motivoJustificativa).toBeNull();
      expect(linhas[0].justificadaPorNome).toBeNull();
    });
  });
});
