import { ContratosService } from './contratos.service';
import {
  AdmissaoNaoDefinidaError,
  ColaboradorContratoNaoEncontradoError,
  DadosContratoInvalidosError,
  DecisaoMarcoInvalidaError,
} from './contratos.errors';
import { adicionarDias } from './contratos.domain';

/**
 * Testes de wiring do `ContratosService` com Prisma mockado. A matemática do
 * ciclo de vida é validada à parte pelos property tests; aqui exercitamos os
 * efeitos colaterais (persistência), as validações e a ordenação dos cards.
 */
describe('ContratosService', () => {
  interface Colab {
    id: string;
    nome: string;
    matricula: string;
    dataAdmissao: Date | null;
  }
  interface Dec {
    colaboradorId: string;
    marco: 'MARCO_45' | 'MARCO_90';
    resultado: 'APROVADO' | 'REPROVADO';
  }

  function criar(colaboradores: Colab[], decisoes: Dec[] = []) {
    const upsert = jest.fn(() => Promise.resolve({}));
    const update = jest.fn(() => Promise.resolve({}));
    const prisma = {
      colaborador: {
        findMany: jest.fn(({ where }: any = {}) =>
          Promise.resolve(
            colaboradores.filter((c) =>
              where?.dataAdmissao?.not !== undefined
                ? c.dataAdmissao !== null
                : true,
            ),
          ),
        ),
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(colaboradores.find((c) => c.id === where.id) ?? null),
        ),
        update,
      },
      decisaoContrato: {
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            decisoes.filter((d) =>
              where.colaboradorId.in.includes(d.colaboradorId),
            ),
          ),
        ),
        upsert,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ContratosService(prisma as any);
    return { service, upsert, update, prisma };
  }

  const HOJE = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01
  const admissaoHa = (dias: number): Date => adicionarDias(HOJE, -dias);

  describe('definirAdmissao', () => {
    it('rejeita data inválida com 400', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: null },
      ]);
      await expect(
        service.definirAdmissao('c1', 'não-é-data'),
      ).rejects.toBeInstanceOf(DadosContratoInvalidosError);
    });

    it('rejeita colaborador inexistente com 404', async () => {
      const { service } = criar([]);
      await expect(
        service.definirAdmissao('x', '2026-01-01'),
      ).rejects.toBeInstanceOf(ColaboradorContratoNaoEncontradoError);
    });

    it('persiste a admissão normalizada à meia-noite UTC', async () => {
      const { service, update } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: null },
      ]);
      await service.definirAdmissao('c1', '2026-05-10T15:30:00.000Z');
      expect(update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { dataAdmissao: new Date(Date.UTC(2026, 4, 10)) },
      });
    });
  });

  describe('registrarDecisao', () => {
    it('exige data de admissão (400)', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: null },
      ]);
      await expect(
        service.registrarDecisao('c1', 'MARCO_45', 'APROVADO'),
      ).rejects.toBeInstanceOf(AdmissaoNaoDefinidaError);
    });

    it('bloqueia decidir o marco de 90 antes de aprovar o de 45 (409)', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(50) },
      ]);
      await expect(
        service.registrarDecisao('c1', 'MARCO_90', 'APROVADO'),
      ).rejects.toBeInstanceOf(DecisaoMarcoInvalidaError);
    });

    it('grava a decisão do marco de 45 (upsert por colaborador+marco)', async () => {
      const { service, upsert } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(46) },
      ]);
      await service.registrarDecisao('c1', 'MARCO_45', 'APROVADO', {
        id: 'g1',
        nome: 'Gestor',
      });
      expect(upsert).toHaveBeenCalledTimes(1);
      const arg = (upsert.mock.calls[0] as any[])[0];
      expect(arg.where.colaboradorId_marco).toEqual({
        colaboradorId: 'c1',
        marco: 'MARCO_45',
      });
      expect(arg.create.resultado).toBe('APROVADO');
      expect(arg.create.decididoPorNome).toBe('Gestor');
    });

    it('permite decidir o marco de 90 quando o de 45 está aprovado', async () => {
      const { service, upsert } = criar(
        [
          {
            id: 'c1',
            nome: 'Ana',
            matricula: '1',
            dataAdmissao: admissaoHa(85),
          },
        ],
        [{ colaboradorId: 'c1', marco: 'MARCO_45', resultado: 'APROVADO' }],
      );
      await service.registrarDecisao('c1', 'MARCO_90', 'APROVADO');
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('listar', () => {
    it('ordena por urgência (crítico primeiro) e filtra por etiqueta', async () => {
      const colaboradores: Colab[] = [
        {
          id: 'ok',
          nome: 'Zeca',
          matricula: '1',
          dataAdmissao: admissaoHa(200),
        }, // efetivado (OK)
        {
          id: 'venc',
          nome: 'Bia',
          matricula: '2',
          dataAdmissao: admissaoHa(42),
        }, // vence em 3 (CRÍTICO)
        {
          id: 'exp',
          nome: 'Ana',
          matricula: '3',
          dataAdmissao: admissaoHa(10),
        }, // experiência (ATENÇÃO)
      ];
      // 'ok' precisa do marco de 90 aprovado para ser EFETIVADO limpo (senão
      // seria efetivado por decurso = crítico). 200 dias > 90.
      const decisoes: Dec[] = [
        { colaboradorId: 'ok', marco: 'MARCO_45', resultado: 'APROVADO' },
        { colaboradorId: 'ok', marco: 'MARCO_90', resultado: 'APROVADO' },
      ];
      const { service } = criar(colaboradores, decisoes);
      const cards = await service.listar({}, HOJE);
      expect(cards.map((c) => c.colaboradorId)).toEqual(['venc', 'exp', 'ok']);

      const soExp = await service.listar({ etiqueta: 'experiencia' }, HOJE);
      expect(soExp.every((c) => c.etiqueta === 'experiencia')).toBe(true);
      expect(soExp.map((c) => c.colaboradorId).sort()).toEqual(['exp', 'venc']);
    });
  });

  describe('avaliarAlertasDoDia', () => {
    it('retorna alerta de vencimento quando faltam <= 5 dias', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(42) }, // faltam 3 p/ 45
      ]);
      const alertas = await service.avaliarAlertasDoDia(HOJE);
      expect(alertas).toHaveLength(1);
      expect(alertas[0].alerta).toEqual({
        tipo: 'VENCIMENTO',
        marco: 'MARCO_45',
        dias: 3,
      });
    });

    it('retorna decisão em atraso quando o marco venceu sem decisão', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(50) }, // passou do 45
      ]);
      const alertas = await service.avaliarAlertasDoDia(HOJE);
      expect(alertas[0].alerta.tipo).toBe('DECISAO_ATRASO');
      expect(alertas[0].alerta.marco).toBe('MARCO_45');
      expect(alertas[0].alerta.dias).toBe(5);
    });
  });
});
