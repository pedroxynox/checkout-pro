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
describe('ColaboradoresService — promoção cria o login (operador -> fiscal)', () => {
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

  function montar(atual: Colaborador) {
    let usuarioCriado: DadosUsuario | null = null;
    let fiscalCriado: { nome: string } | null = null;
    let vinculo: { usuarioId: string | null } | null = null;

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
      },
      fiscal: {
        findFirst: () => Promise.resolve(null),
        findUnique: () => Promise.resolve(null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: ({ data }: any) => {
          fiscalCriado = data;
          return Promise.resolve({ id: 'f1', ...data });
        },
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
    };
  }

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
