import { OperadoresService } from './operadores.service';
import {
  AusenciaDuplicadaError,
  NomeDuplicadoError,
} from './operadores.errors';

/**
 * Testes de exemplo (unitários) do `OperadoresService`. Usam um
 * `PrismaService` falso (em memória) exercitando os efeitos colaterais (CRUD de
 * operadores e ausências) sem banco de dados.
 *
 * Cobre os casos concretos de cadastro/edição/listagem e registro/remoção de
 * ausências (subtarefa 4.6) e a contagem/classificação por turno (Req 6.6).
 */
describe('OperadoresService', () => {
  interface OperadorFake {
    id: string;
    nome: string;
    ativo: boolean;
    criadoEm: Date;
  }
  interface AusenciaFake {
    id: string;
    pessoaId: string;
    data: Date;
  }

  function criarServico(): OperadoresService {
    const operadores: OperadorFake[] = [];
    const ausencias: AusenciaFake[] = [];
    let seq = 0;

    const prismaFake = {
      operador: {
        findMany: (args?: {
          where?: { id?: { not?: string } };
          orderBy?: { nome?: 'asc' | 'desc' };
        }) => {
          let lista = [...operadores];
          const not = args?.where?.id?.not;
          if (not !== undefined) {
            lista = lista.filter((o) => o.id !== not);
          }
          if (args?.orderBy?.nome) {
            const dir = args.orderBy.nome === 'asc' ? 1 : -1;
            lista.sort((a, b) => a.nome.localeCompare(b.nome) * dir);
          }
          return Promise.resolve(lista);
        },
        create: ({ data: { nome } }: { data: { nome: string } }) => {
          const novo: OperadorFake = {
            id: `op${++seq}`,
            nome,
            ativo: true,
            criadoEm: new Date(),
          };
          operadores.push(novo);
          return Promise.resolve(novo);
        },
        update: ({
          where: { id },
          data: { nome },
        }: {
          where: { id: string };
          data: { nome: string };
        }) => {
          const alvo = operadores.find((o) => o.id === id);
          if (!alvo) {
            return Promise.reject(new Error('Operador não encontrado'));
          }
          alvo.nome = nome;
          return Promise.resolve(alvo);
        },
      },
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
          data: { pessoaId, data },
        }: {
          data: { pessoaId: string; data: Date };
        }) => {
          const nova: AusenciaFake = { id: `au${++seq}`, pessoaId, data };
          ausencias.push(nova);
          return Promise.resolve(nova);
        },
        delete: ({ where: { id } }: { where: { id: string } }) => {
          const idx = ausencias.findIndex((a) => a.id === id);
          if (idx >= 0) {
            ausencias.splice(idx, 1);
          }
          return Promise.resolve({});
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new OperadoresService(prismaFake as any);
  }

  describe('cadastrar / editarNome / listar', () => {
    it('cadastra operadores e os lista ordenados por nome', async () => {
      const service = criarServico();
      await service.cadastrar('Carlos');
      await service.cadastrar('Ana');

      const lista = await service.listar();
      expect(lista.map((o) => o.nome)).toEqual(['Ana', 'Carlos']);
    });

    it('rejeita cadastro de nome idêntico lançando NomeDuplicadoError', async () => {
      const service = criarServico();
      await service.cadastrar('Maria');
      await expect(service.cadastrar('Maria')).rejects.toBeInstanceOf(
        NomeDuplicadoError,
      );
    });

    it('edita o nome de um operador existente', async () => {
      const service = criarServico();
      const op = await service.cadastrar('Joana');
      const atualizado = await service.editarNome(op.id, 'Joana Silva');
      expect(atualizado.nome).toBe('Joana Silva');
    });

    it('rejeita edição para um nome já usado por outro operador', async () => {
      const service = criarServico();
      await service.cadastrar('Pedro');
      const op2 = await service.cadastrar('Paulo');
      await expect(service.editarNome(op2.id, 'Pedro')).rejects.toBeInstanceOf(
        NomeDuplicadoError,
      );
    });

    it('permite editar mantendo o próprio nome (sem falso positivo de duplicidade)', async () => {
      const service = criarServico();
      const op = await service.cadastrar('Lucas');
      const atualizado = await service.editarNome(op.id, 'Lucas');
      expect(atualizado.nome).toBe('Lucas');
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
