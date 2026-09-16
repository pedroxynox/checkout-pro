import { ColaboradoresService } from './colaboradores.service';
import { SenhaAcessoObrigatoriaError } from './colaboradores.errors';

/**
 * Regressão: ao promover um colaborador para uma função com acesso ao app
 * (ex.: operador -> fiscal) e informar a senha, a conta de acesso (login)
 * DEVE ser criada e vinculada. Antes, a edição só atualizava uma conta já
 * existente, então o operador promovido ficava sem login mesmo com senha.
 *
 * Usa um Prisma/Acessos falsos (em memória) para exercitar os efeitos
 * colaterais (criação da conta, vínculo e registro de fiscal) sem banco.
 */
interface Colaborador {
  funcao: string;
  turno: string | null;
  usuarioId: string | null;
  matricula?: string;
  nome?: string;
}

interface DadosUsuario {
  login: string;
  nome: string;
  senhaHash: string;
  perfil: string;
}

function montar(atual: Colaborador, fiscaisExistentes: { id: string }[] = []) {
    let usuarioCriado: DadosUsuario | null = null;
    let fiscalCriado: { nome: string } | null = null;
    let vinculo: { usuarioId: string | null } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let escalaApagada: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let usuarioAtualizado: any = null;

    const base = {
      id: 'c1',
      ativo: true,
      matricula: atual.matricula ?? '1001',
      nome: atual.nome ?? 'Ana',
      turno: atual.turno,
      funcao: atual.funcao,
      usuarioId: atual.usuarioId,
      entradaSemana: null,
      saidaSemana: null,
      entradaFds: null,
      saidaFds: null,
      folgaDiaSemana: null,
    };

    const prismaFake = {
      colaborador: {
        findUnique: () => Promise.resolve({ ...base }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: ({ data }: any) => {
          if (data.usuarioId !== undefined) vinculo = data;
          return Promise.resolve({ ...base, ...data });
        },
      },
      usuario: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          usuarioCriado = data;
          return Promise.resolve({ id: 'u-new', ...data });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: ({ data }: any) => {
          usuarioAtualizado = data;
          return Promise.resolve({ id: 'u1', ...data });
        },
      },
      fiscal: {
        findFirst: () => Promise.resolve(null),
        findUnique: () => Promise.resolve(null),
        // Identidades sob as quais a escala semanal pode ter sido gravada.
        findMany: () => Promise.resolve(fiscaisExistentes),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          fiscalCriado = data;
          return Promise.resolve({ id: 'f1', ...data });
        },
      },
      escalaEntry: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deleteMany: ({ where }: any) => {
          escalaApagada = where;
          return Promise.resolve({ count: 0 });
        },
        findMany: () => Promise.resolve([]),
        createMany: () => Promise.resolve({ count: 0 }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: (fn: any) =>
        fn({
          colaborador: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            update: ({ data }: any) => Promise.resolve({ ...base, ...data }),
          },
          colaboradorIdentificador: {
            deleteMany: () => Promise.resolve({ count: 0 }),
            create: () => Promise.resolve({}),
          },
        }),
    };

    const acessosFake = {
      loginDisponivel: () => Promise.resolve(true),
      gerarHashSenha: (s: string) => Promise.resolve(`hash:${s}`),
    };

    const service = new ColaboradoresService(
      prismaFake as never,
      acessosFake as never,
    );

    return {
      service,
      usuarioCriado: () => usuarioCriado,
      fiscalCriado: () => fiscalCriado,
      vinculo: () => vinculo,
    escalaApagada: () => escalaApagada,
    usuarioAtualizado: () => usuarioAtualizado,
  };
}

describe('ColaboradoresService — promoção cria o login (operador -> fiscal)', () => {
  it('cria a conta (login = matrícula, perfil FISCAL) e vincula ao colaborador', async () => {
    const c = montar({
      funcao: 'OPERADOR',
      turno: 'ABERTURA',
      usuarioId: null,
    });

    const res = await c.service.editar('c1', {
      funcao: 'FISCAL',
      senha: 'segredo123',
    });

    expect(c.usuarioCriado()).toMatchObject({
      login: '1001',
      perfil: 'FISCAL',
    });
    expect(c.usuarioCriado()?.senhaHash).toBe('hash:segredo123');
    expect(c.vinculo()).toEqual({ usuarioId: 'u-new' });
    expect(c.fiscalCriado()).toMatchObject({ nome: 'Ana' });
    expect(res.usuarioId).toBe('u-new');
  });

  it('recusa a promoção quando a senha não é informada (sem alterar o cadastro)', async () => {
    const c = montar({
      funcao: 'OPERADOR',
      turno: 'ABERTURA',
      usuarioId: null,
    });

    await expect(
      c.service.editar('c1', { funcao: 'FISCAL' }),
    ).rejects.toBeInstanceOf(SenhaAcessoObrigatoriaError);

    expect(c.usuarioCriado()).toBeNull();
    expect(c.vinculo()).toBeNull();
  });

  it('não cria login ao editar um operador que continua operador', async () => {
    const c = montar({
      funcao: 'OPERADOR',
      turno: 'ABERTURA',
      usuarioId: null,
    });

    await c.service.editar('c1', { nome: 'Ana Maria' });

    expect(c.usuarioCriado()).toBeNull();
    expect(c.vinculo()).toBeNull();
  });
});


/**
 * O outro lado da promoção, que não existia: **descer** de função (ADR 0023).
 *
 * `sincronizarEscalaFiscal` saía pela porta antes de qualquer limpeza quando a
 * função não era FISCAL, então a escala semanal de fiscal sobrevivia — e não é
 * inerte: continuava alimentando a regra de folga e a detecção automática de
 * falta de alguém que já não era fiscal, para sempre. E a conta de acesso ficava
 * com o perfil FISCAL, porque operador não tem perfil para sobrescrevê-lo.
 */
describe('ColaboradoresService — rebaixamento (fiscal -> operador)', () => {
  it('apaga a escala semanal de fiscal, por TODAS as identidades da pessoa', async () => {
    const c = montar(
      { funcao: 'FISCAL', turno: 'ABERTURA', usuarioId: 'u1' },
      [{ id: 'f-antigo' }],
    );

    await c.service.editar('c1', { funcao: 'OPERADOR', turno: 'ABERTURA' });

    const where = c.escalaApagada();
    // Só as GERAIS: as exceções são decisões humanas por dia.
    expect(where.especial).toBe(false);
    // A ficha, o id de operador da era anterior e o registro de fiscal antigo.
    expect(where.OR).toEqual([
      { colaboradorId: 'c1' },
      { funcionarioId: { in: ['c1', 'f-antigo'] } },
    ]);
  });

  it('encerra as sessões abertas, para o perfil antigo não seguir valendo', async () => {
    // O perfil que vale numa requisição vem do TOKEN: sem este bump a pessoa
    // continuaria com os poderes de fiscal até o token expirar.
    const c = montar(
      { funcao: 'FISCAL', turno: 'ABERTURA', usuarioId: 'u1' },
      [],
    );

    await c.service.editar('c1', { funcao: 'OPERADOR', turno: 'ABERTURA' });

    expect(c.usuarioAtualizado()).toMatchObject({
      tokenVersion: { increment: 1 },
    });
  });

  it('não encerra sessão quando a função não mudou', async () => {
    const c = montar(
      { funcao: 'FISCAL', turno: 'ABERTURA', usuarioId: 'u1' },
      [],
    );

    await c.service.editar('c1', { nome: 'Ana Maria' });

    expect(c.usuarioAtualizado()?.tokenVersion).toBeUndefined();
  });
});
