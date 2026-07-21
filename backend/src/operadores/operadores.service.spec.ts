import { OperadoresService } from './operadores.service';
import { Prisma } from '@prisma/client';
import {
  AtestadoMedicoViaFluxoProprioError,
  AusenciaDuplicadaError,
  PeriodoAusenciaInvalidoError,
} from './operadores.errors';
import { CicloFechadoError } from '../ciclo-folha/ciclo-folha.errors';

/** Início do dia (00:00 UTC) como timestamp — para casar por dia civil. */
function diaUtc(data: Date): number {
  return Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

/**
 * Testes de exemplo (unitários) do `OperadoresService`. Usam um
 * `PrismaService` falso (em memória) exercitando os efeitos colaterais sem
 * banco de dados.
 *
 * O cadastro/edição/listagem de operadores pelo model simples `Operador` foi
 * removido (operadores agora vêm do Cadastro Unificado de Colaboradores), então
 * este spec cobre apenas ausências (Req 6.2/6.3) e a classificação/contagem por
 * turno (Req 6.6).
 */
describe('OperadoresService', () => {
  interface AusenciaFake {
    id: string;
    pessoaId: string;
    colaboradorId?: string | null;
    data: Date;
  }

  function criarServico(cicloFolha?: unknown): OperadoresService {
    const ausencias: AusenciaFake[] = [];
    let seq = 0;

    const prismaFake = {
      ausencia: {
        findMany: (args?: {
          where?: {
            pessoaId?: string;
            data?: { gte?: Date; lte?: Date };
          };
        }) => {
          let lista = [...ausencias];
          const pessoaId = args?.where?.pessoaId;
          if (pessoaId !== undefined) {
            lista = lista.filter((a) => a.pessoaId === pessoaId);
          }
          const gte = args?.where?.data?.gte;
          const lte = args?.where?.data?.lte;
          if (gte !== undefined) {
            lista = lista.filter((a) => a.data.getTime() >= gte.getTime());
          }
          if (lte !== undefined) {
            lista = lista.filter((a) => a.data.getTime() <= lte.getTime());
          }
          return Promise.resolve(lista);
        },
        create: ({
          data: { pessoaId, colaboradorId, data },
        }: {
          data: { pessoaId: string; colaboradorId?: string | null; data: Date };
        }) => {
          const nova: AusenciaFake = {
            id: `au${++seq}`,
            pessoaId,
            colaboradorId: colaboradorId ?? null,
            data,
          };
          ausencias.push(nova);
          return Promise.resolve(nova);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: any;
        }) => {
          const a = ausencias.find((x) => x.id === id);
          if (a) Object.assign(a, data);
          return Promise.resolve(a ?? {});
        },
        delete: ({ where: { id } }: { where: { id: string } }) => {
          const idx = ausencias.findIndex((a) => a.id === id);
          if (idx >= 0) {
            ausencias.splice(idx, 1);
          }
          return Promise.resolve({});
        },
        findUnique: ({
          where,
        }: {
          where: {
            id?: string;
            pessoaId_data?: { pessoaId: string; data: Date };
          };
        }) => {
          if (where.id !== undefined) {
            return Promise.resolve(
              ausencias.find((a) => a.id === where.id) ?? null,
            );
          }
          if (where.pessoaId_data) {
            const { pessoaId, data } = where.pessoaId_data;
            const dia = diaUtc(data);
            return Promise.resolve(
              ausencias.find(
                (a) => a.pessoaId === pessoaId && diaUtc(a.data) === dia,
              ) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      },
      // Colaborador (para a ausência a prazo): folga aos domingos (dia 0).
      // A folga NÃO deve mais ser ignorada — todos os dias corridos contam.
      colaborador: {
        findUnique: () => Promise.resolve({ nome: 'Teste', folgaDiaSemana: 0 }),
      },
      // Transação: no fake, executa o callback com o próprio cliente falso
      // (as escritas usam `tx.ausencia.*`, que aqui é o mesmo `prismaFake`).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: (tx: any) => any) => fn(prismaFake),
    };

    return new OperadoresService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prismaFake as any,
      undefined,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cicloFolha as any,
    );
  }

  it('bloqueia registrar ausência num ciclo de folha fechado', async () => {
    const cicloFolha = {
      exigirCicloAberto: jest.fn().mockRejectedValue(new CicloFechadoError()),
    };
    const service = criarServico(cicloFolha);
    await expect(
      service.registrarAusencia('p1', new Date(Date.UTC(2026, 5, 10))),
    ).rejects.toBeInstanceOf(CicloFechadoError);
  });

  describe('ausência a prazo (por período)', () => {
    it('cria falta justificada por dia e converte dias que já tinham falta', async () => {
      const service = criarServico();
      // Já existe uma falta (pendente) no meio do período.
      await service.registrarAusencia('p1', new Date(Date.UTC(2026, 2, 10)));

      const r = await service.registrarAusenciaPeriodo(
        'p1',
        new Date(Date.UTC(2026, 2, 9)),
        new Date(Date.UTC(2026, 2, 11)),
        { motivo: 'LICENCA', observacao: 'Licença de 3 dias' },
        { id: 'u1', nome: 'Gestor' },
      );

      expect(r.criadas).toBe(2); // dias 9 e 11 (novos)
      expect(r.atualizadas).toBe(1); // dia 10 (já existia → justificado)
      expect(r.dias).toBe(3);
    });

    it('conta TODOS os dias corridos, inclusive a folga (domingo)', async () => {
      const service = criarServico();
      // 14 a 19 de março/2026 = 6 dias corridos. O dia 15 é DOMINGO (folga do
      // colaborador no mock), mas deve contar mesmo assim (regra do usuário).
      const r = await service.registrarAusenciaPeriodo(
        'p1',
        new Date(Date.UTC(2026, 2, 14)),
        new Date(Date.UTC(2026, 2, 19)),
        { motivo: 'LICENCA', observacao: 'Licença de 6 dias' },
        { id: 'u1', nome: 'Gestor' },
      );

      expect(r.dias).toBe(6); // 14,15,16,17,18,19 — a folga (15) também conta
      expect(r.criadas).toBe(6);
      expect(r.atualizadas).toBe(0);
    });

    it('rejeita período com a data final antes da inicial', async () => {
      const service = criarServico();
      await expect(
        service.registrarAusenciaPeriodo(
          'p1',
          new Date(Date.UTC(2026, 2, 11)),
          new Date(Date.UTC(2026, 2, 9)),
          { motivo: 'LICENCA' },
        ),
      ).rejects.toBeInstanceOf(PeriodoAusenciaInvalidoError);
    });

    it('rejeita ATESTADO_MEDICO (deve usar o fluxo de Atestados)', async () => {
      const service = criarServico();
      await expect(
        service.registrarAusenciaPeriodo(
          'p1',
          new Date(Date.UTC(2026, 2, 9)),
          new Date(Date.UTC(2026, 2, 11)),
          { motivo: 'ATESTADO_MEDICO' },
        ),
      ).rejects.toBeInstanceOf(AtestadoMedicoViaFluxoProprioError);
    });
  });

  describe('ausências', () => {
    it('registra e permite remover uma ausência', async () => {
      const service = criarServico();
      const ausencia = await service.registrarAusencia(
        'p1',
        new Date(Date.UTC(2024, 2, 10)),
      );
      expect(ausencia.pessoaId).toBe('p1');
      // Fase 4: a falta do operador já nasce vinculada à ficha canônica
      // (pessoaId do operador é o próprio Colaborador.id).
      expect((ausencia as { colaboradorId?: string | null }).colaboradorId).toBe(
        'p1',
      );
      await expect(
        service.removerAusencia(ausencia.id),
      ).resolves.toBeUndefined();
    });

    it('rejeita ausência duplicada para a mesma pessoa e dia', async () => {
      const service = criarServico();
      const dia = new Date(Date.UTC(2024, 2, 10));
      await service.registrarAusencia('p1', dia);
      await expect(
        service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 10))),
      ).rejects.toBeInstanceOf(AusenciaDuplicadaError);
    });

    it('permite ausências em dias diferentes para a mesma pessoa', async () => {
      const service = criarServico();
      await service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 10)));
      await expect(
        service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 11))),
      ).resolves.toBeDefined();
    });

    it('trata a corrida de escrita (P2002) como duplicidade', async () => {
      // findUnique não acha (corrida entre a checagem e o create), mas o banco
      // recusa pela unicidade @@unique([pessoaId, data]) → AusenciaDuplicadaError.
      const prismaFake = {
        ausencia: {
          findUnique: () => Promise.resolve(null),
          create: () =>
            Promise.reject(
              new Prisma.PrismaClientKnownRequestError('dup', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            ),
        },
      };
      const service = new OperadoresService(
        prismaFake as never,
        undefined,
        undefined,
        undefined,
      );
      await expect(
        service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 10))),
      ).rejects.toBeInstanceOf(AusenciaDuplicadaError);
    });

    it('gera relatório filtrado por período e ordenado de forma decrescente', async () => {
      const service = criarServico();
      // p1: 3 ausências no período; p2: 1 ausência no período; 1 fora.
      await service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 1)));
      await service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 5)));
      await service.registrarAusencia('p1', new Date(Date.UTC(2024, 2, 9)));
      await service.registrarAusencia('p2', new Date(Date.UTC(2024, 2, 3)));
      await service.registrarAusencia('p2', new Date(Date.UTC(2024, 5, 1))); // fora

      const relatorio = await service.relatorioAusencias({
        inicio: new Date(Date.UTC(2024, 2, 1)),
        fim: new Date(Date.UTC(2024, 2, 31)),
      });

      expect(relatorio).toEqual([
        { pessoaId: 'p1', quantidade: 3 },
        { pessoaId: 'p2', quantidade: 1 },
      ]);
    });
  });

  describe('classificação e contagem por turno', () => {
    it('classifica os horários de entrada nas fronteiras corretas', () => {
      const service = criarServico();
      expect(service.classificarTurnoOperador('07:30')).toBe('ABERTURA');
      expect(service.classificarTurnoOperador('09:59')).toBe('ABERTURA');
      expect(service.classificarTurnoOperador('10:00')).toBe('INTERMEDIARIO');
      expect(service.classificarTurnoOperador('12:59')).toBe('INTERMEDIARIO');
      expect(service.classificarTurnoOperador('13:00')).toBe('FECHAMENTO');
      expect(service.classificarTurnoOperador('18:00')).toBe('FECHAMENTO');
    });

    it('conta operadores por turno excluindo folga/férias/desligados', () => {
      const service = criarServico();
      const contagem = service.contagemPorTurno([
        { operadorId: 'a', entrada: '08:00' },
        { operadorId: 'b', entrada: '09:30' },
        { operadorId: 'c', entrada: '11:00' },
        { operadorId: 'd', entrada: '14:00' },
        { operadorId: 'e', entrada: '13:30', folga: true },
        { operadorId: 'f', entrada: '08:00', ferias: true },
        { operadorId: 'g', entrada: '15:00', desligado: true },
        { operadorId: 'h', entrada: null },
      ]);

      expect(contagem).toEqual({
        abertura: 2,
        intermediario: 1,
        fechamento: 1,
        total: 4,
      });
    });
  });
});
