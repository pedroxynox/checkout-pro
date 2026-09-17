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
import { FolgaService } from '../escala-domingo/folga.service';
import { FeriasService } from '../ferias/ferias.service';
import { EscalaExportacaoService } from './escala-exportacao.service';

interface ColaboradorFake {
  id: string;
  nome: string;
  /** Chave do vínculo com o registro de fiscal, em fallback ao `usuarioId`. */
  matricula: string;
  /** Conta de acesso: é por ela que ficha e registro de fiscal se reconhecem. */
  usuarioId: string | null;
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
    matricula: '0001',
    usuarioId: null,
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

/**
 * Uma entrada da escala semanal. `funcionarioId` é obrigatório porque é a chave
 * REAL da tabela: a escala de um fiscal é gravada sob o `Fiscal.id`, e
 * `colaboradorId` (o vínculo com a ficha) pode estar vazio nas linhas antigas —
 * era justamente por elas que a escala publicada não enxergava a folga.
 */
interface EntradaEscalaFake {
  funcionarioId: string;
  colaboradorId: string | null;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  folga: boolean;
  especial: boolean;
}

function criarServico(cenario: {
  colaboradores?: ColaboradorFake[];
  feriados?: { data: Date; nome: string }[];
  escala?: EntradaEscalaFake[];
  /** Registros `Fiscal` (a segunda identidade de um fiscal). */
  fiscais?: { id: string; nome: string; usuarioId: string | null }[];
  usuarios?: { id: string; login: string }[];
  ausencias?: {
    pessoaId: string;
    data: Date;
    atestadoId: string | null;
    motivoJustificativa: string | null;
  }[];
  ferias?: string[];
  ancora?: { data: Date; ordem: ('G1' | 'G2' | 'G3')[] } | null;
  folga?: FolgaService;
}): EscalaExportacaoService {
  const colaboradores = cenario.colaboradores ?? [colaborador()];
  const prisma = {
    colaborador: {
      // `where` é opcional de propósito: a carga de identidades lê TODAS as
      // fichas (uma pessoa rebaixada continua tendo um registro de fiscal, e a
      // escala velha dele é exatamente o que precisa ser encontrado).
      findMany: ({ where }: { where?: { funcao: { in: string[] } } } = {}) =>
        Promise.resolve(
          colaboradores.filter(
            (c) => !where || (c.ativo && where.funcao.in.includes(c.funcao)),
          ),
        ),
    },
    feriado: {
      findMany: () => Promise.resolve(cenario.feriados ?? []),
    },
    escalaEntry: {
      findMany: ({ where }: { where?: { especial?: boolean } } = {}) =>
        Promise.resolve(
          (cenario.escala ?? []).filter(
            (e) =>
              where?.especial === undefined || e.especial === where.especial,
          ),
        ),
    },
    ausencia: {
      findMany: () => Promise.resolve(cenario.ausencias ?? []),
    },
    fiscal: {
      findMany: () => Promise.resolve(cenario.fiscais ?? []),
    },
    usuario: {
      findMany: () => Promise.resolve(cenario.usuarios ?? []),
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

  return new EscalaExportacaoService(
    prisma,
    escalaDomingo,
    ferias,
    cenario.folga ?? new FolgaService(prisma, escalaDomingo),
  );
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
      feriados: [
        { data: new Date('2026-07-21T00:00:00.000Z'), nome: 'Padroeira' },
      ],
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

  it('um resquício de exceção NÃO muda o horário da ficha', async () => {
    const service = criarServico({
      escala: [
        {
          funcionarioId: 'c1',
          colaboradorId: 'c1',
          diaSemana: 2, // terça
          entrada: '13:00',
          saida: '21:20',
          folga: false,
          especial: true,
        },
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21'); // terça

    // A ficha diz 07:00–15:20, e é ela que vale (ADR 0026). A linha `especial`
    // de 13:00 é ignorada — antes ela prevalecia, e era a origem do "horário que
    // aparece na escala e não existe na ficha".
    expect(escala.secoes[0].linhas[0].entrada).toBe('07:00');
    expect(escala.secoes[0].linhas[0].saida).toBe('15:20');
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

    expect(escala.secoes[0].pessoas.map((p) => p.nome)).toEqual([
      'Ana',
      'Zeca',
    ]);
  });
});

/**
 * Um fiscal tem DUAS identidades: a ficha (`Colaborador.id`) e o registro legado
 * (`Fiscal.id`), que é a chave sob a qual a escala semanal é gravada. A escala
 * publicada perguntava à regra de folga por **uma** só, e o que estava escrito sob
 * a outra ficava invisível justamente no documento que a equipe lê (ADR 0023).
 */
describe('EscalaExportacaoService · as duas identidades de um fiscal', () => {
  /** Fiscal cuja ficha e registro legado se reconhecem pela conta de acesso. */
  const FISCAL_COM_VINCULO = {
    colaboradores: [
      colaborador({
        id: 'col-f',
        nome: 'Yara Lima',
        funcao: 'FISCAL',
        usuarioId: 'u-f',
        folgaDiaSemana: null, // a ficha não afirma folga
      }),
    ],
    fiscais: [{ id: 'fiscal-f', nome: 'Yara Lima', usuarioId: 'u-f' }],
    usuarios: [{ id: 'u-f', login: '0001' }],
  };

  it('enxerga a folga gravada só sob o id de fiscal, sem vínculo na linha', async () => {
    const service = criarServico({
      ...FISCAL_COM_VINCULO,
      escala: [
        {
          funcionarioId: 'fiscal-f',
          colaboradorId: null, // linha antiga, sem vínculo com a ficha
          diaSemana: 2,
          entrada: null,
          saida: null,
          folga: true,
          especial: false,
        },
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21'); // terça

    expect(escala.secoes[0].linhas[0].status).toBe('FOLGA');
  });

  it('exceção sem vínculo na linha também é ignorada', async () => {
    // Este caso já custou duas correções: primeiro a exceção era descartada, depois
    // passou a ser aplicada ao dono certo pelo vínculo Fiscal → ficha. Agora ela
    // não se aplica a ninguém — o horário é o da ficha, e ponto (ADR 0026).
    const service = criarServico({
      ...FISCAL_COM_VINCULO,
      escala: [
        {
          funcionarioId: 'fiscal-f',
          colaboradorId: null,
          diaSemana: 2,
          entrada: '13:00',
          saida: '21:20',
          folga: false,
          especial: true,
        },
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21'); // terça

    expect(escala.secoes[0].linhas[0].entrada).toBe('07:00');
  });

  it('a folga da ficha continua valendo, e a linha velha não soma um segundo dia', async () => {
    // O caso da Yannelyt, visto pela escala publicada: ficha na quinta, linha
    // geral antiga na quarta. Só a quinta é folga.
    const service = criarServico({
      ...FISCAL_COM_VINCULO,
      colaboradores: [
        colaborador({
          id: 'col-f',
          nome: 'Yara Lima',
          funcao: 'FISCAL',
          usuarioId: 'u-f',
          folgaDiaSemana: 4, // quinta
        }),
      ],
      escala: [
        {
          funcionarioId: 'fiscal-f',
          colaboradorId: null,
          diaSemana: 3, // quarta
          entrada: null,
          saida: null,
          folga: true,
          especial: false,
        },
      ],
    });

    const quarta = await service.escalaDoDia('2026-07-22');
    const quinta = await service.escalaDoDia('2026-07-23');

    expect(quarta.secoes[0].linhas[0].status).toBe('TRABALHA');
    expect(quinta.secoes[0].linhas[0].status).toBe('FOLGA');
  });
});

/**
 * Sem dia de folga na ficha, a pessoa é escalada os sete dias e pode receber
 * falta automática num dia em que estava descansando. Era o defeito mais
 * silencioso do conjunto: a Escala mostrava "trabalha" e ninguém tinha como
 * saber que faltava um dado (ADR 0023).
 */
describe('EscalaExportacaoService · aviso de ficha sem folga', () => {
  it('lista quem está sem dia de folga no cadastro, com nome e função', async () => {
    const service = criarServico({
      colaboradores: [
        colaborador({ id: 'c1', nome: 'Ana Souza', folgaDiaSemana: 1 }),
        colaborador({
          id: 'c2',
          nome: 'Diones Alves',
          funcao: 'FISCAL',
          folgaDiaSemana: null,
        }),
      ],
    });

    const escala = await service.escalaDoDia('2026-07-21');

    expect(escala.semFolgaNoCadastro).toEqual([
      { colaboradorId: 'c2', nome: 'Diones Alves', funcao: 'FISCAL' },
    ]);
  });

  it('não avisa nada quando todo o time tem o dia preenchido', async () => {
    const escala = await criarServico({}).escalaDoDia('2026-07-21');

    expect(escala.semFolgaNoCadastro).toEqual([]);
  });

  it('o mesmo aviso acompanha a grade da semana', async () => {
    // A grade semanal é a tela que o gestor abre para planejar; se o aviso só
    // existisse no dia, ele o veria justamente quando já não dá para agir.
    const service = criarServico({
      colaboradores: [
        colaborador({ id: 'c2', nome: 'Diones Alves', folgaDiaSemana: null }),
      ],
    });

    const escala = await service.escalaDaSemana('2026-07-22');

    expect(escala.semFolgaNoCadastro.map((p) => p.nome)).toEqual([
      'Diones Alves',
    ]);
  });
});
