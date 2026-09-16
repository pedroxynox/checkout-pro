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
    /** Função; omitida = OPERADOR (o caso mais comum nos testes). */
    funcao?: string;
    /** Ativo; omitido = true. */
    ativo?: boolean;
  }
  interface Dec {
    colaboradorId: string;
    marco: 'MARCO_45' | 'MARCO_90';
    resultado: 'APROVADO' | 'REPROVADO';
  }

  function criar(colaboradores: Colab[], decisoes: Dec[] = []) {
    const upsert = jest.fn(() => Promise.resolve({}));
    const update = jest.fn(() => Promise.resolve({}));
    // As fichas com os padrões aplicados: o serviço lê `funcao` e `ativo`, e um
    // mock que os ignorasse não veria o filtro de escopo — que é justamente o
    // que o ADR 0024 mudou.
    const fichas = colaboradores.map((c) => ({
      ...c,
      funcao: c.funcao ?? 'OPERADOR',
      ativo: c.ativo ?? true,
    }));
    const prisma = {
      colaborador: {
        findMany: jest.fn(({ where }: any = {}) =>
          Promise.resolve(
            fichas.filter(
              (c) =>
                (where?.funcao?.in === undefined ||
                  where.funcao.in.includes(c.funcao)) &&
                (where?.ativo === undefined || c.ativo === where.ativo) &&
                (where?.dataAdmissao?.not === undefined ||
                  c.dataAdmissao !== null),
            ),
          ),
        ),
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(fichas.find((c) => c.id === where.id) ?? null),
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
      // 'venc' (42d) e 'exp' (10d) estão em EXPERIÊNCIA (ATENÇÃO), 'ok' (200d)
      // EFETIVADO (OK). Entre os de experiência, o desempate é por quem está
      // mais perto dos 90 dias: 'venc' (faltam 48) antes de 'exp' (faltam 80).
      expect(cards.map((c) => c.colaboradorId)).toEqual(['venc', 'exp', 'ok']);

      const soExp = await service.listar({ etiqueta: 'experiencia' }, HOJE);
      expect(soExp.every((c) => c.etiqueta === 'experiencia')).toBe(true);
      expect(soExp.map((c) => c.colaboradorId).sort()).toEqual(['exp', 'venc']);
    });
  });

  /**
   * REGRESSÃO (ADR 0024): o contrato de experiência é da PESSOA, não do cargo.
   *
   * O caso real: um operador promovido a fiscal **desapareceu da aba Contratos**
   * no instante em que a promoção foi salva, porque a listagem filtrava
   * `funcao: 'OPERADOR'`. Nada havia sido apagado — o prazo dele seguia correndo,
   * inalcançável pela tela. É o mesmo erro do ADR 0020: a função de hoje
   * decidindo o que aconteceu ontem.
   */
  describe('escopo da carteira', () => {
    const QUADRO: Colab[] = [
      {
        id: 'op',
        nome: 'Ana',
        matricula: '1',
        dataAdmissao: admissaoHa(30),
        funcao: 'OPERADOR',
      },
      {
        id: 'promovido',
        nome: 'Diones',
        matricula: '2',
        dataAdmissao: admissaoHa(30),
        funcao: 'FISCAL',
      },
      {
        id: 'sup',
        nome: 'Bruno',
        matricula: '3',
        dataAdmissao: admissaoHa(30),
        funcao: 'SUPERVISOR',
      },
    ];

    it('mantém na lista quem foi promovido a fiscal', async () => {
      const { service } = criar(QUADRO);

      const cards = await service.listar({}, HOJE);

      expect(cards.map((c) => c.colaboradorId).sort()).toEqual([
        'op',
        'promovido',
        'sup',
      ]);
    });

    it('leva o cargo no card, para distinguir quem é quem', async () => {
      // A lista passou a misturar áreas; sem o cargo, duas pessoas de setores
      // diferentes ficam indistinguíveis.
      const { service } = criar(QUADRO);

      const cards = await service.listar({}, HOJE);

      expect(
        cards.find((c) => c.colaboradorId === 'promovido')?.funcao,
      ).toBe('FISCAL');
    });

    it('deixa a GERÊNCIA fora: o cadastro não pede admissão para ela', async () => {
      // Não é uma questão de mérito — é que um gestor só poderia cair no balde
      // "definir admissão", pedindo uma ação que a tela não permite atender.
      const { service } = criar([
        ...QUADRO,
        {
          id: 'ger',
          nome: 'Carla',
          matricula: '4',
          dataAdmissao: null,
          funcao: 'GESTOR',
        },
      ]);

      const cards = await service.listar({}, HOJE);

      expect(cards.some((c) => c.colaboradorId === 'ger')).toBe(false);
    });

    it('não lista quem saiu do quadro', async () => {
      const { service } = criar([
        ...QUADRO,
        {
          id: 'fora',
          nome: 'Dora',
          matricula: '5',
          dataAdmissao: admissaoHa(30),
          funcao: 'FISCAL',
          ativo: false,
        },
      ]);

      const cards = await service.listar({}, HOJE);

      expect(cards.some((c) => c.colaboradorId === 'fora')).toBe(false);
    });

    it('o alerta de vencimento também alcança um promovido', async () => {
      // É a parte que mais doía: sem o alerta, a efetivação automática acontecia
      // sem que ninguém decidisse nada.
      const { service } = criar([
        {
          id: 'promovido',
          nome: 'Diones',
          matricula: '2',
          dataAdmissao: admissaoHa(85), // faltam 5 dias para os 90
          funcao: 'FISCAL',
        },
      ]);

      const alertas = await service.avaliarAlertasDoDia(HOJE);

      expect(alertas.map((a) => a.colaboradorId)).toEqual(['promovido']);
    });
  });

  describe('avaliarAlertasDoDia', () => {
    it('não gera alertas fora da janela de vencimento (nem "decisão em atraso")', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(42) }, // faltam 48 p/ 90
        { id: 'c2', nome: 'Bia', matricula: '2', dataAdmissao: admissaoHa(50) }, // faltam 40 p/ 90
        { id: 'c3', nome: 'Cid', matricula: '3', dataAdmissao: admissaoHa(95) }, // efetivado
      ]);
      const alertas = await service.avaliarAlertasDoDia(HOJE);
      expect(alertas).toHaveLength(0);
    });

    it('avisa 5 dias antes de completar 90 dias (vencimento do contrato)', async () => {
      const { service } = criar([
        { id: 'c1', nome: 'Ana', matricula: '1', dataAdmissao: admissaoHa(87) }, // faltam 3 p/ 90
      ]);
      const alertas = await service.avaliarAlertasDoDia(HOJE);
      expect(alertas).toHaveLength(1);
      expect(alertas[0].alerta).toEqual({
        tipo: 'VENCIMENTO',
        marco: 'MARCO_90',
        dias: 3,
      });
    });
  });
});
