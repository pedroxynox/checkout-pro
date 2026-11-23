import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CicloFechadoError } from '../ciclo-folha/ciclo-folha.errors';
import {
  INICIO_RODIZIO_5X2,
  PADRAO_RODIZIO_5X2,
} from '../escala-domingo/rodizio-folgas.domain';
import { REGRAS_PADRAO, RegrasContrato } from '../ponto/ponto.domain';
import {
  AutorJornada,
  DadosVigenciaJornada,
  JornadaColaboradorService,
} from './jornada-colaborador.service';
import { JornadaVigenciaService } from './jornada-vigencia.service';

/**
 * Escrita da jornada pela ficha (spec `jornada-5x2`, Fase 4, design §3.2 e §6)
 * sobre um banco em memória: validação (400), ciclo fechado (409), troca de
 * contrato só com ADMIN_DADOS (403), auditoria, upsert por data, remoção e a
 * leitura (vigente, histórico, próximas folgas).
 */

const C_6X1 = 'contrato-6x1';
const C_5X2 = 'contrato-5x2';
const C_INATIVO = 'contrato-inativo';
const MIN = 60_000;

const REGRAS_5X2: RegrasContrato = {
  ...REGRAS_PADRAO,
  cargaBaseMs: () => 528 * MIN,
  cargaFeriadoMs: 528 * MIN,
  intervaloMaximoMs: 170 * MIN,
  folgasPorSemana: 2,
  folgasFixasPadrao: [],
  permiteFolgaSabado: false,
};

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Ciclo 26/10–25/11 aberto; o anterior (até 25/10) fechado. */
const INICIO_CICLO_ABERTO = dia('2026-10-26');

const ADMIN: AutorJornada = { login: 'dono', podeTrocarContrato: true };
const SUPERVISOR: AutorJornada = {
  login: 'supervisor',
  podeTrocarContrato: false,
};

const semana5x2 = (entrada = '06:50', saida = '16:38') =>
  [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => ({ diaSemana, entrada, saida }));

interface Vigencia {
  id: string;
  colaboradorId: string;
  vigenteDesde: Date;
  tipoContratoJornadaId: string;
  grupo: string | null;
  folgasFixas: number[];
  motivo: string | null;
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoPor: string | null;
  atualizadoEm: Date;
}

function montar(opcoes: { semRodizio?: boolean } = {}) {
  const contratos = new Map([
    [C_6X1, { id: C_6X1, nome: '6x1', ativo: true }],
    [C_5X2, { id: C_5X2, nome: '5x2 44h', ativo: true }],
    [C_INATIVO, { id: C_INATIVO, nome: 'Velho', ativo: false }],
  ]);
  const fichas = [
    {
      id: 'ana',
      tipoContratoJornadaId: C_6X1,
      folgaDiaSemana: 3,
      grupoDomingo: 'G1',
      entradaSemana: '06:50',
      saidaSemana: '15:50',
      entradaFds: '06:50',
      saidaFds: '16:50',
      entradaDom: '07:00',
      saidaDom: '14:20',
    },
  ];
  let vigencias: Vigencia[] = [];
  let disponibilidade: {
    vigenciaId: string;
    diaSemana: number;
    entrada: string;
    saida: string;
  }[] = [];
  let seq = 0;

  const comDisp = (v: Vigencia) => ({
    ...v,
    disponibilidade: disponibilidade
      .filter((d) => d.vigenciaId === v.id)
      .map(({ diaSemana, entrada, saida }) => ({ diaSemana, entrada, saida })),
    tipoContratoJornada: { nome: contratos.get(v.tipoContratoJornadaId)!.nome },
  });
  const lte = (d: Date, filtro?: { lte?: Date; lt?: Date }) =>
    !filtro ||
    ((filtro.lte == null || d.getTime() <= filtro.lte.getTime()) &&
      (filtro.lt == null || d.getTime() < filtro.lt.getTime()));
  type Where = {
    id?: string;
    colaboradorId?: string;
    vigenteDesde?: { lte?: Date; lt?: Date };
  };
  const filtrar = (where: Where = {}) =>
    vigencias.filter(
      (v) =>
        (where.id == null || v.id === where.id) &&
        (where.colaboradorId == null ||
          v.colaboradorId === where.colaboradorId) &&
        lte(v.vigenteDesde, where.vigenteDesde),
    );
  const desc = (a: Vigencia, b: Vigencia) =>
    b.vigenteDesde.getTime() - a.vigenteDesde.getTime();

  const prisma = {
    colaborador: {
      findUnique: ({ where }: { where: { id: string } }) => {
        const f = fichas.find((x) => x.id === where.id);
        return Promise.resolve(
          f
            ? {
                ...f,
                tipoContratoJornada: {
                  nome: contratos.get(f.tipoContratoJornadaId)!.nome,
                },
              }
            : null,
        );
      },
      findMany: () => Promise.resolve(fichas),
    },
    tipoContratoJornada: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(contratos.get(where.id) ?? null),
    },
    jornadaVigencia: {
      findMany: ({ where }: { where?: Where } = {}) =>
        Promise.resolve(filtrar(where).sort(desc).map(comDisp)),
      findFirst: ({ where }: { where?: Where }) =>
        Promise.resolve(filtrar(where).sort(desc)[0] ?? null),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) =>
        Promise.resolve(comDisp(vigencias.find((v) => v.id === where.id)!)),
      upsert: (args: {
        where: {
          colaboradorId_vigenteDesde: {
            colaboradorId: string;
            vigenteDesde: Date;
          };
        };
        create: Partial<Vigencia>;
        update: Partial<Vigencia>;
      }) => {
        const { colaboradorId, vigenteDesde } =
          args.where.colaboradorId_vigenteDesde;
        const existente = vigencias.find(
          (v) =>
            v.colaboradorId === colaboradorId &&
            v.vigenteDesde.getTime() === vigenteDesde.getTime(),
        );
        if (existente) {
          Object.assign(existente, args.update, { atualizadoEm: new Date() });
          return Promise.resolve({ id: existente.id });
        }
        const nova: Vigencia = {
          id: `v${++seq}`,
          colaboradorId,
          vigenteDesde,
          tipoContratoJornadaId: '',
          grupo: null,
          folgasFixas: [],
          motivo: null,
          criadoPor: null,
          criadoEm: new Date(),
          atualizadoPor: null,
          atualizadoEm: new Date(),
          ...args.create,
        };
        vigencias.push(nova);
        return Promise.resolve({ id: nova.id });
      },
      delete: ({ where }: { where: { id: string } }) => {
        vigencias = vigencias.filter((v) => v.id !== where.id);
        disponibilidade = disponibilidade.filter(
          (d) => d.vigenciaId !== where.id,
        );
        return Promise.resolve({});
      },
    },
    disponibilidadeDia: {
      deleteMany: ({ where }: { where: { vigenciaId: string } }) => {
        disponibilidade = disponibilidade.filter(
          (d) => d.vigenciaId !== where.vigenciaId,
        );
        return Promise.resolve({});
      },
      createMany: ({ data }: { data: typeof disponibilidade }) => {
        disponibilidade.push(...data);
        return Promise.resolve({});
      },
    },
    rodizioFolgasVigencia: {
      findMany: () =>
        Promise.resolve(
          opcoes.semRodizio
            ? []
            : [
                {
                  id: 'r1',
                  vigenteDesde: INICIO_RODIZIO_5X2,
                  semanasNoCiclo: 3,
                  padrao: PADRAO_RODIZIO_5X2,
                },
              ],
        ),
    },
    escalaEntry: { findMany: () => Promise.resolve([]) },
    feriado: { findMany: () => Promise.resolve([]) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const tiposContrato = {
    regrasDoContrato: (id?: string | null) =>
      Promise.resolve(id === C_5X2 ? REGRAS_5X2 : REGRAS_PADRAO),
  };
  const cicloFolha = {
    exigirCicloAberto: (d: Date) =>
      d.getTime() < INICIO_CICLO_ABERTO.getTime()
        ? Promise.reject(new CicloFechadoError(['26/09–25/10']))
        : Promise.resolve(),
  };
  const jornada = new JornadaVigenciaService(
    prisma as never,
    tiposContrato as never,
  );
  const service = new JornadaColaboradorService(
    prisma as never,
    tiposContrato as never,
    jornada,
    cicloFolha as never,
  );
  return {
    service,
    vigencias: () => vigencias,
    disponibilidade: () => disponibilidade,
  };
}

const corte: DadosVigenciaJornada = {
  aPartirDe: '2026-11-23',
  tipoContratoJornadaId: C_5X2,
  grupo: 'G1',
  folgasFixas: [],
  disponibilidade: semana5x2(),
  motivo: 'Fim do 6x1',
};

describe('JornadaColaboradorService.gravar', () => {
  it('cria a vigência com auditoria e devolve vigência e avisos', async () => {
    const { service, vigencias } = montar();
    const r = await service.gravar('ana', corte, ADMIN);

    expect(r.vigencia).toMatchObject({
      aPartirDe: '2026-11-23',
      tipoContratoJornadaId: C_5X2,
      tipoContratoNome: '5x2 44h',
      grupo: 'G1',
      folgasFixas: [],
      folgasFixasEfetivas: [],
      motivo: 'Fim do 6x1',
      criadoPor: 'dono',
      atualizadoPor: null,
    });
    // De segunda a domingo, os sete dias.
    expect(r.vigencia.disponibilidade.map((d) => d.diaSemana)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
    expect(r.avisos).toEqual([]);
    expect(vigencias()).toHaveLength(1);
  });

  it('avisa sem bloquear: dia sem horário e disponibilidade fora da carga', async () => {
    const { service } = montar();
    const disp = semana5x2().map((d) =>
      d.diaSemana === 2
        ? { diaSemana: 2, entrada: '', saida: '' }
        : d.diaSemana === 3
          ? { diaSemana: 3, entrada: '06:50', saida: '15:00' }
          : d,
    );
    const r = await service.gravar(
      'ana',
      { ...corte, disponibilidade: disp },
      ADMIN,
    );
    expect(r.avisos.map((a) => [a.tipo, a.diaSemana])).toEqual([
      ['DIA_SEM_HORARIO', 2],
      ['DISPONIBILIDADE_FORA_DA_CARGA', 3],
    ]);
    expect(r.vigencia.disponibilidade).toHaveLength(6);
  });

  it('mesma data substitui (upsert): troca a disponibilidade e marca quem alterou', async () => {
    const { service, vigencias, disponibilidade } = montar();
    await service.gravar('ana', corte, ADMIN);
    const r = await service.gravar(
      'ana',
      {
        ...corte,
        motivo: undefined,
        disponibilidade: semana5x2('07:00', '16:48'),
      },
      { login: 'supervisor', podeTrocarContrato: false },
    );
    expect(vigencias()).toHaveLength(1);
    expect(disponibilidade()).toHaveLength(7);
    expect(r.vigencia).toMatchObject({
      criadoPor: 'dono',
      atualizadoPor: 'supervisor',
      // Sem motivo novo, fica o da criação.
      motivo: 'Fim do 6x1',
    });
    expect(r.vigencia.disponibilidade[0]).toEqual({
      diaSemana: 1,
      entrada: '07:00',
      saida: '16:48',
    });
  });

  it.each<[string, Partial<DadosVigenciaJornada>, string]>([
    [
      'folgas fixas com grupo',
      { folgasFixas: [1] },
      'Quem tem grupo folga pelo rodízio; não informe folgas fixas.',
    ],
    ['grupo inválido', { grupo: 'G4' }, 'Grupo deve ser G1, G2 ou G3.'],
    [
      'folgas acima do contrato',
      { grupo: null, folgasFixas: [0, 1, 2] },
      'No máximo 2 folga(s) fixa(s) por semana neste contrato.',
    ],
    [
      'sábado sem permissão',
      { grupo: null, folgasFixas: [6] },
      'Este contrato não permite folga no sábado.',
    ],
    [
      'só a entrada',
      { disponibilidade: [{ diaSemana: 1, entrada: '06:50', saida: '' }] },
      'Na segunda, informe entrada e saída (ou deixe as duas vazias).',
    ],
    [
      'saída antes da entrada',
      { disponibilidade: [{ diaSemana: 1, entrada: '16:00', saida: '06:00' }] },
      'Na segunda, a saída deve ser depois da entrada.',
    ],
    [
      'horário fora de HH:mm',
      { disponibilidade: [{ diaSemana: 1, entrada: '6:50', saida: '16:38' }] },
      'Na segunda, entrada e saída devem ser HH:mm.',
    ],
  ])('400: %s', async (_nome, mudanca, erro) => {
    const { service, vigencias } = montar();
    const falha = service.gravar('ana', { ...corte, ...mudanca }, ADMIN);
    await expect(falha).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.gravar('ana', { ...corte, ...mudanca }, ADMIN),
    ).rejects.toThrow(erro);
    expect(vigencias()).toHaveLength(0);
  });

  it('400: grupo sem rodízio vigente na data', async () => {
    const { service } = montar({ semRodizio: true });
    await expect(service.gravar('ana', corte, ADMIN)).rejects.toThrow(
      'Não há rodízio de folgas valendo em 2026-11-23',
    );
    // Sem grupo, a mesma data passa.
    await expect(
      service.gravar(
        'ana',
        { ...corte, grupo: null, folgasFixas: [0, 1] },
        ADMIN,
      ),
    ).resolves.toBeDefined();
  });

  it('400: data inválida', async () => {
    const { service } = montar();
    await expect(
      service.gravar('ana', { ...corte, aPartirDe: 'amanhã' }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409: início num ciclo de folha fechado (R1.4)', async () => {
    const { service, vigencias } = montar();
    await expect(
      service.gravar('ana', { ...corte, aPartirDe: '2026-10-20' }, ADMIN),
    ).rejects.toBeInstanceOf(CicloFechadoError);
    expect(vigencias()).toHaveLength(0);
  });

  it('retroativa dentro do ciclo aberto é aceita (R1.5)', async () => {
    const { service } = montar();
    const r = await service.gravar(
      'ana',
      { ...corte, aPartirDe: '2026-10-26', grupo: null, folgasFixas: [0, 1] },
      ADMIN,
    );
    expect(r.vigencia.aPartirDe).toBe('2026-10-26');
  });

  it('404: colaborador inexistente', async () => {
    const { service } = montar();
    await expect(
      service.gravar('ninguem', corte, ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('contrato: só ADMIN_DADOS troca', () => {
    it('403 ao trocar o contrato do dia sem ADMIN_DADOS', async () => {
      const { service, vigencias } = montar();
      await expect(
        service.gravar('ana', corte, SUPERVISOR),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(vigencias()).toHaveLength(0);
    });

    it('sem contrato no corpo, herda o do dia (a ficha) e não exige ADMIN_DADOS', async () => {
      const { service } = montar();
      const r = await service.gravar(
        'ana',
        {
          ...corte,
          tipoContratoJornadaId: undefined,
          grupo: null,
          folgasFixas: [3],
        },
        SUPERVISOR,
      );
      expect(r.vigencia.tipoContratoJornadaId).toBe(C_6X1);
    });

    it('nova vigência depois de uma 5x2 herda o 5x2; mandar o mesmo contrato não é troca', async () => {
      const { service } = montar();
      await service.gravar('ana', corte, ADMIN);
      const r = await service.gravar(
        'ana',
        { ...corte, aPartirDe: '2026-11-30', grupo: 'G2' },
        SUPERVISOR,
      );
      expect(r.vigencia.tipoContratoJornadaId).toBe(C_5X2);
      expect(r.vigencia.grupo).toBe('G2');
    });

    it('400 ao trocar para um contrato inativo', async () => {
      const { service } = montar();
      await expect(
        service.gravar(
          'ana',
          { ...corte, tipoContratoJornadaId: C_INATIVO, grupo: null },
          ADMIN,
        ),
      ).rejects.toThrow('inativo');
    });

    it('400 com contrato inexistente', async () => {
      const { service } = montar();
      await expect(
        service.gravar('ana', { ...corte, tipoContratoJornadaId: 'x' }, ADMIN),
      ).rejects.toThrow('Tipo de contrato não encontrado.');
    });
  });
});

describe('JornadaColaboradorService.remover', () => {
  it('remover a única vigência devolve a pessoa ao 6x1 (R1.7)', async () => {
    const { service } = montar();
    const { vigencia } = await service.gravar(
      'ana',
      {
        ...corte,
        tipoContratoJornadaId: undefined,
        grupo: null,
        folgasFixas: [3],
      },
      SUPERVISOR,
    );
    const depois = await service.remover('ana', vigencia.id, SUPERVISOR);
    expect(depois.historico).toEqual([]);
    expect(depois.regimeHoje).toBe('LEGADO_6X1');
    expect(depois.contratoVigente).toEqual({
      id: C_6X1,
      nome: '6x1',
      desde: null,
    });
  });

  it('409 em ciclo fechado', async () => {
    const { service, vigencias } = montar();
    await service.gravar(
      'ana',
      { ...corte, aPartirDe: '2026-10-26', grupo: null, folgasFixas: [0, 1] },
      ADMIN,
    );
    // O ciclo fecha depois da gravação.
    const v = vigencias()[0];
    v.vigenteDesde = dia('2026-10-01');
    await expect(service.remover('ana', v.id, ADMIN)).rejects.toBeInstanceOf(
      CicloFechadoError,
    );
    expect(vigencias()).toHaveLength(1);
  });

  it('403 quando a remoção muda o contrato e quem remove não é ADMIN_DADOS', async () => {
    const { service, vigencias } = montar();
    const { vigencia } = await service.gravar('ana', corte, ADMIN);
    await expect(
      service.remover('ana', vigencia.id, SUPERVISOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(vigencias()).toHaveLength(1);
    await expect(
      service.remover('ana', vigencia.id, ADMIN),
    ).resolves.toBeDefined();
  });

  it('404 com vigência de outra pessoa ou inexistente', async () => {
    const { service } = montar();
    await expect(service.remover('ana', 'nada', ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('JornadaColaboradorService.obter', () => {
  it('sem vigência: regime legado, contrato da ficha, folgas do 6x1', async () => {
    const { service } = montar();
    const r = await service.obter('ana', dia('2026-11-23'));
    expect(r.regimeHoje).toBe('LEGADO_6X1');
    expect(r.vigente).toBeNull();
    expect(r.historico).toEqual([]);
    expect(r.contratoVigente).toEqual({ id: C_6X1, nome: '6x1', desde: null });
    // Folga fixa na quarta (ficha legada): 25/11 e 02/12.
    expect(r.proximasFolgas.map((f) => f.data)).toEqual([
      '2026-11-25',
      '2026-12-02',
    ]);
  });

  it('com G1 desde 23/11: vigente, desde quando e folgas do rodízio', async () => {
    const { service } = montar();
    await service.gravar('ana', corte, ADMIN);
    await service.gravar(
      'ana',
      { ...corte, aPartirDe: '2026-12-07', grupo: 'G2' },
      ADMIN,
    );
    const r = await service.obter('ana', dia('2026-11-23'));
    expect(r.regimeHoje).toBe('SEMANAL');
    expect(r.vigente?.aPartirDe).toBe('2026-11-23');
    // Histórico da mais nova para a mais antiga, com a futura.
    expect(r.historico.map((h) => h.aPartirDe)).toEqual([
      '2026-12-07',
      '2026-11-23',
    ]);
    expect(r.contratoVigente).toEqual({
      id: C_5X2,
      nome: '5x2 44h',
      desde: '2026-11-23',
    });
    // G1: semana 1 quinta+sexta, semana 2 terça+quarta (14 dias desde 23/11).
    expect(r.proximasFolgas).toEqual([
      { data: '2026-11-26', diaSemana: 4 },
      { data: '2026-11-27', diaSemana: 5 },
      { data: '2026-12-01', diaSemana: 2 },
      { data: '2026-12-02', diaSemana: 3 },
    ]);
  });

  it('"desde" do contrato atravessa vigências com o mesmo contrato', async () => {
    const { service } = montar();
    await service.gravar('ana', corte, ADMIN);
    await service.gravar(
      'ana',
      { ...corte, aPartirDe: '2026-11-30', grupo: 'G3' },
      ADMIN,
    );
    const r = await service.obter('ana', dia('2026-12-01'));
    expect(r.vigente?.aPartirDe).toBe('2026-11-30');
    expect(r.contratoVigente.desde).toBe('2026-11-23');
  });
});
