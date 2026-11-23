import { BadRequestException } from '@nestjs/common';
import { CicloFechadoError } from '../ciclo-folha/ciclo-folha.errors';
import {
  INICIO_RODIZIO_5X2,
  PADRAO_RODIZIO_5X2,
} from './rodizio-folgas.domain';
import { RodizioFolgasService } from './rodizio-folgas.service';

/**
 * `RodizioFolgasService` (tela do rodízio de folgas): leitura com avisos e
 * prévia, simulação sem gravar e gravação com as travas de dados inválidos e de
 * ciclo de folha fechado.
 */

const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** A linha semeada pela migração 9zzw. */
const SEMENTE = {
  id: 'rodizio-folgas-2026-11-23',
  vigenteDesde: INICIO_RODIZIO_5X2,
  semanasNoCiclo: 3,
  padrao: PADRAO_RODIZIO_5X2,
  criadoPor: 'migracao-9zzw',
  criadoEm: new Date('2026-11-22T20:00:00Z'),
  atualizadoPor: null,
  atualizadoEm: new Date('2026-11-22T20:00:00Z'),
};

function montar(
  opcoes: { linhas?: (typeof SEMENTE)[]; cicloFechado?: boolean } = {},
) {
  const linhas = [...(opcoes.linhas ?? [SEMENTE])];
  const prisma = {
    rodizioFolgasVigencia: {
      findMany: jest.fn(() =>
        Promise.resolve(
          [...linhas].sort(
            (a, b) => a.vigenteDesde.getTime() - b.vigenteDesde.getTime(),
          ),
        ),
      ),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { vigenteDesde: Date };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const atual = linhas.find(
            (l) => l.vigenteDesde.getTime() === where.vigenteDesde.getTime(),
          );
          if (atual) Object.assign(atual, update);
          else
            linhas.push({
              ...SEMENTE,
              ...create,
              id: `novo-${linhas.length}`,
            } as typeof SEMENTE);
          return Promise.resolve({});
        },
      ),
    },
  };
  // Rodízio antigo de domingo: G3 folgou 08/11, G2 15/11 e G1 22/11.
  const escalaDomingo = {
    obterAncora: jest.fn(() =>
      Promise.resolve({ data: dia('2026-11-08'), ordem: ['G3', 'G2', 'G1'] }),
    ),
  };
  const cicloFolha = {
    exigirCicloAberto: jest.fn(() =>
      opcoes.cicloFechado
        ? Promise.reject(new CicloFechadoError(['26/10 a 25/11/2026']))
        : Promise.resolve(),
    ),
  };
  const service = new RodizioFolgasService(
    prisma as never,
    escalaDomingo as never,
    cicloFolha as never,
  );
  return { service, prisma, cicloFolha, linhas };
}

describe('RodizioFolgasService.obter', () => {
  it('a vigência semeada vale a partir de 23/11, sem avisos', async () => {
    const { service } = montar();
    const antes = await service.obter(dia('2026-11-22'));
    expect(antes.vigente).toBeNull();
    expect(antes.vigencias).toHaveLength(1);
    expect(antes.vigencias[0]).toMatchObject({
      id: 'rodizio-folgas-2026-11-23',
      vigenteDesde: '2026-11-23',
      semanasNoCiclo: 3,
      criadoPor: 'migracao-9zzw',
      avisos: [],
    });
    const depois = await service.obter(dia('2026-11-23'));
    expect(depois.vigente?.id).toBe('rodizio-folgas-2026-11-23');
  });

  it('a prévia começa na semana de hoje e mostra o domingo antigo antes do rodízio', async () => {
    const { service } = montar();
    const { previa } = await service.obter(dia('2026-11-22'));
    expect(previa).toHaveLength(6);
    expect(previa[0].inicio).toBe('2026-11-16');
    expect(previa[0].dias[6]).toEqual({
      data: '2026-11-22',
      diaSemana: 0,
      grupos: ['G1'],
      fonte: 'DOMINGO_ANTIGO',
    });
    expect(previa[1]).toMatchObject({ inicio: '2026-11-23', semanaDoCiclo: 1 });
  });
});

describe('RodizioFolgasService.simular', () => {
  it('mostra avisos e prévia desde a semana anterior, sem gravar', async () => {
    const { service, prisma } = montar();
    const r = await service.simular({
      vigenteDesde: '2027-01-04',
      semanasNoCiclo: 1,
      padrao: { G1: [[1, 2]], G2: [[1, 3]], G3: [[4, 5]] },
    });
    expect(r.vigencia.id).toBeNull();
    expect(r.vigencia.avisos.map((a) => a.tipo)).toEqual(
      expect.arrayContaining(['DIA_COM_VARIOS_GRUPOS', 'DIA_SEM_GRUPO']),
    );
    expect(r.previa[0].inicio).toBe('2026-12-28');
    expect(r.previa[0].semanaDoCiclo).toBe(3); // ainda o rodízio de 23/11
    expect(r.previa[1]).toMatchObject({
      inicio: '2027-01-04',
      semanaDoCiclo: 1,
    });
    expect(r.previa[1].dias[0].grupos).toEqual(['G1', 'G2']);
    expect(prisma.rodizioFolgasVigencia.upsert).not.toHaveBeenCalled();
  });

  it('recusa dados inválidos com todos os erros juntos', async () => {
    const { service } = montar();
    await expect(
      service.simular({
        vigenteDesde: '2027-01-03',
        semanasNoCiclo: 1,
        padrao: { G1: [[6, 1]], G2: [[1, 3]], G3: [[4]] },
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'O rodízio precisa começar numa segunda-feira. G1, semana 1: ninguém de grupo folga no sábado. G3, semana 1: escolha exatamente 2 dias de folga.',
      ),
    );
  });
});

describe('RodizioFolgasService.definir', () => {
  it('cria a vigência nova com o autor e devolve a configuração', async () => {
    const { service, prisma, cicloFolha } = montar();
    const r = await service.definir(
      {
        vigenteDesde: '2027-01-04',
        semanasNoCiclo: 3,
        padrao: PADRAO_RODIZIO_5X2,
      },
      'ADMIN',
    );
    expect(cicloFolha.exigirCicloAberto).toHaveBeenCalledWith(
      dia('2027-01-04'),
    );
    expect(prisma.rodizioFolgasVigencia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vigenteDesde: dia('2027-01-04') },
        create: expect.objectContaining({
          criadoPor: 'ADMIN',
          semanasNoCiclo: 3,
        }),
      }),
    );
    expect(r.vigencias.map((v) => v.vigenteDesde)).toEqual([
      '2026-11-23',
      '2027-01-04',
    ]);
  });

  it('a mesma data substitui a vigência (com quem alterou)', async () => {
    const { service, linhas } = montar();
    const outro = {
      G1: [
        [1, 0],
        [4, 5],
        [2, 3],
      ],
      G2: [
        [4, 5],
        [2, 3],
        [1, 0],
      ],
      G3: [
        [2, 3],
        [1, 0],
        [4, 5],
      ],
    };
    await service.definir(
      { vigenteDesde: '2026-11-23', semanasNoCiclo: 3, padrao: outro },
      'GERENTE',
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      padrao: outro,
      atualizadoPor: 'GERENTE',
    });
  });

  it('não grava num ciclo de folha fechado', async () => {
    const { service, prisma } = montar({ cicloFechado: true });
    await expect(
      service.definir({
        vigenteDesde: '2026-11-23',
        semanasNoCiclo: 3,
        padrao: PADRAO_RODIZIO_5X2,
      }),
    ).rejects.toBeInstanceOf(CicloFechadoError);
    expect(prisma.rodizioFolgasVigencia.upsert).not.toHaveBeenCalled();
  });
});
