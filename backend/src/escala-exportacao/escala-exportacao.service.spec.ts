/**
 * Montagem da escala publicada: todo o time numa lista, com feriado, férias,
 * exceção de horário e ausência aplicados sobre o turno do cadastro.
 *
 * O foco é o que o módulo acrescenta ao Quadro de Operadores: cobrir TODAS as
 * funções e aplicar as regras do dia. As regras de horário em si são exercitadas
 * em `escala-publicada.domain.spec.ts` e `escala-domingo.domain.spec.ts`.
 */
import { PrismaService } from '../prisma/prisma.service';
import { EscalaDomingoService } from '../escala-domingo/escala-domingo.service';
import { FeriasService } from '../ferias/ferias.service';
import { EscalaExportacaoService } from './escala-exportacao.service';

interface ColaboradorFake {
  id: string;
  nome: string;
  funcao: string;
  turno: string | null;
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  entradaDom: string | null;
  saidaDom: string | null;
  ativo: boolean;
}

function colaborador(p: Partial<ColaboradorFake> = {}): ColaboradorFake {
  return {
    id: 'c1',
    nome: 'Ana Souza',
    funcao: 'OPERADOR',
    turno: 'ABERTURA',
    folgaDiaSemana: 1, // segunda
    grupoDomingo: 'G2',
    entradaSemana: '07:00',
    saidaSemana: '15:20',
    entradaFds: '08:00',
    saidaFds: '17:20',
    entradaDom: '09:00',
    saidaDom: '16:20',
    ativo: true,
    ...p,
  };
}

function criarServico(cenario: {
  colaboradores?: ColaboradorFake[];
  feriados?: { data: Date; nome: string }[];
  especiais?: {
    colaboradorId: string;
    diaSemana: number;
    entrada: string | null;
    saida: string | null;
    folga: boolean;
  }[];
  ausencias?: {
    pessoaId: string;
    data: Date;
    atestadoId: string | null;
    motivoJustificativa: string | null;
  }[];
  ferias?: string[];
  ancora?: { data: Date; ordem: ('G1' | 'G2' | 'G3')[] } | null;
}): EscalaExportacaoService {
  const prisma = {
    colaborador: {
      findMany: ({ where }: { where: { funcao: { in: string[] } } }) =>
        Promise.resolve(
          (cenario.colaboradores ?? [colaborador()]).filter(
            (c) => c.ativo && where.funcao.in.includes(c.funcao),
          ),
        ),
    },
    feriado: {
      findMany: () => Promise.resolve(cenario.feriados ?? []),
    },
    escalaEntry: {
      findMany: () => Promise.resolve(cenario.especiais ?? []),
    },
    ausencia: {
      findMany: () => Promise.resolve(cenario.ausencias ?? []),
    },
  } as unknown as PrismaService;

  const escalaDomingo = {
    obterAncora: () =>
      Promise.resolve(
        cenario.ancora === undefined
          ? {
              data: new Date('2026-07-19T00:00:00.000Z'),
              ordem: ['G1', 'G3', 'G2'],
            }
          : cenario.ancora,
      ),
  } as unknown as EscalaDomingoService;

  const ferias = {
    colaboradoresDeFeriasNoDia: () =>
      Promise.resolve(new Set(cenario.ferias ?? [])),
  } as unknown as FeriasService;

  return new EscalaExportacaoService(prisma, escalaDomingo, ferias);
}

describe('EscalaExportacaoService.escalaDoDia', () => {
  it('cobre todo o time, na ordem supervisor → fiscal → operador', () => {
    // É a diferença central em relação ao Quadro de Operadores, que só mostra
    // operadores: uma escala publicada que esconde fiscais e supervisores está
    // incompleta para quem a recebe.
    const service = criarServico({
      colaboradores: [
        colaborador({ id: 'o1', nome: 'Operadora', funcao: 'OPERADOR' }),
        colaborador({ id: 'f1', nome: 'Fiscal', funcao: 'FISCAL' }),
        colaborador({ id: 's1', nome: 'Supervisora', funcao: 'SUPERVISOR' }),
      ],
    });

    return service.escalaDoDia('2026-07-21').then((escala) => {
      expect(escala.secoes.map((s) => s.funcao)).toEqual([
        'SUPERVISOR',
        'FISCAL',
        'OPERADOR',
      ]);
      expect(escala.totais.trabalhando).toBe(3);
    });
  });

  it('aplica o feriado: horário de domingo e nome no cabeçalho', async () => {
    const service = criarServico({
      feriados: [{ data: new Date('2026-07-21T00:00:00.000Z'), nome: 'Padroeira' }],
    });

    const escala = await service.escalaDoDia('2026-07-21');

    expect(escala.ehFeriado).toBe(true);
    expect(escala.nomeFeriado).toBe('Padroeira');
    expect(escala.secoes[0].linhas[0].entrada).toBe('09:00');
    expect(escala.secoes[0].linhas[0].saida).toBe('16:20');
  });

  it('mostra quem está de férias como FÉRIAS, não como falta', async () => {
    const service = criarServico({ ferias: ['c1'] });

    const escala = await service.escalaDoDia('2026-07-21');

    expect(escala.secoes[0].linhas[0].status).toBe('FERIAS');
    expect(escala.totais.ferias).toBe(1);
  });

  it('a exceção de horário do dia da semana prevalece', async () => {
    const service = criarServico({
      especiais: [
        {
          colaboradorId: 'c1',
          diaSemana: 2, // terça
          entrada: '13:00',
          saida: '21:20',
          folga: false,
        },
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21'); // terça

    expect(escala.secoes[0].linhas[0].entrada).toBe('13:00');
    expect(escala.secoes[0].linhas[0].horarioEspecial).toBe(true);
  });

  it('marca a falta do dia mantendo o turno que ficou descoberto', async () => {
    const service = criarServico({
      ausencias: [
        {
          pessoaId: 'c1',
          data: new Date('2026-07-21T00:00:00.000Z'),
          atestadoId: null,
          motivoJustificativa: null,
        },
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21');

    expect(escala.secoes[0].linhas[0].status).toBe('FALTA');
    expect(escala.secoes[0].linhas[0].entrada).toBe('07:00');
  });

  it('no domingo informa o grupo que folga pelo rodízio', async () => {
    const escala = await criarServico({}).escalaDoDia('2026-07-19');

    // Âncora 19/07 com ordem G1,G3,G2 → folga G1 nesse domingo.
    expect(escala.grupoFolgaDomingo).toBe('G1');
  });

  it('ignora colaboradores inativos', async () => {
    const service = criarServico({
      colaboradores: [colaborador({ id: 'c9', ativo: false })],
    });

    const escala = await service.escalaDoDia('2026-07-21');

    expect(escala.secoes).toHaveLength(0);
  });
});

describe('EscalaExportacaoService.escalaDaSemana', () => {
  it('devolve os sete dias de segunda a domingo, com uma célula por dia', async () => {
    const escala = await criarServico({}).escalaDaSemana('2026-07-22');

    expect(escala.inicioISO).toBe('2026-07-20');
    expect(escala.fimISO).toBe('2026-07-26');
    expect(escala.dias).toHaveLength(7);
    expect(escala.secoes[0].pessoas[0].celulas).toHaveLength(7);
  });

  it('cada célula reflete a regra do seu dia (folga na segunda, turno na terça)', async () => {
    const escala = await criarServico({}).escalaDaSemana('2026-07-22');
    const celulas = escala.secoes[0].pessoas[0].celulas;

    expect(celulas[0].status).toBe('FOLGA'); // segunda = folga fixa
    expect(celulas[1].entrada).toBe('07:00'); // terça
    expect(celulas[4].entrada).toBe('08:00'); // sexta usa fim de semana
    expect(celulas[6].entrada).toBe('09:00'); // domingo trabalhado (G2)
  });

  it('ordena as pessoas por nome dentro da função', async () => {
    // Na semana a ordem precisa ser estável: a pessoa vem procurar a sua linha,
    // e a hora de entrada muda de dia para dia.
    const service = criarServico({
      colaboradores: [
        colaborador({ id: 'c2', nome: 'Zeca' }),
        colaborador({ id: 'c1', nome: 'Ana' }),
      ],
    });

    const escala = await service.escalaDaSemana('2026-07-22');

    expect(escala.secoes[0].pessoas.map((p) => p.nome)).toEqual(['Ana', 'Zeca']);
  });
});
