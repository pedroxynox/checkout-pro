import { Injectable } from '@nestjs/common';
import {
  Colaborador,
  FuncaoColaborador,
  Perfil,
  Prisma,
  TurnoColaborador,
  TurnoFiscal,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcessosService } from '../acessos/acessos.service';
import {
  gerarEscalaSemanalFiscal,
  temEscalaDefinida,
} from '../fiscais/escala.domain';
import { normalizarLogin, normalizarMatricula } from './colaboradores.domain';
import {
  ColaboradorNaoEncontradoError,
  ContaAcessoExistenteError,
  LoginAppDuplicadoError,
  LoginAppInexistenteError,
  LoginColaboradorDuplicadoError,
  MatriculaColaboradorDuplicadaError,
  SenhaAcessoObrigatoriaError,
} from './colaboradores.errors';

/** Funções que têm acesso ao app (login). Operador NÃO entra no app. */
function perfilDaFuncao(
  funcao: FuncaoColaborador,
  gerenteDesenvolvedor?: boolean,
): Perfil | null {
  if (funcao === 'FISCAL') return 'FISCAL';
  if (funcao === 'SUPERVISOR') return 'SUPERVISOR';
  if (funcao === 'GESTOR') {
    return gerenteDesenvolvedor ? 'GERENTE_DESENVOLVEDOR' : 'GERENTE';
  }
  return null;
}

/** Mapeia o turno do colaborador para o turno do fiscal (3 turnos). */
function turnoFiscalDe(turno?: TurnoColaborador | null): TurnoFiscal {
  if (turno === 'ABERTURA' || turno === 'INTERMEDIARIO' || turno === 'FECHAMENTO') {
    return turno;
  }
  return 'INTERMEDIARIO';
}

/** Dados de cadastro/edição de um colaborador. */
export interface ColaboradorInput {
  nome: string;
  matricula: string;
  login?: string | null;
  funcao?: FuncaoColaborador;
  genero?: string | null;
  turno?: TurnoColaborador | null;
  entradaSemana?: string | null;
  saidaSemana?: string | null;
  entradaFds?: string | null;
  saidaFds?: string | null;
  folgaDiaSemana?: number | null;
  /**
   * Senha de acesso ao app. No cadastro de fiscal/supervisor/gerente é
   * obrigatória (cria a conta com login = matrícula). Na edição, quando
   * informada, redefine a senha.
   */
  senha?: string | null;
  /** Quando a função é GESTOR, define se é o gerente desenvolvedor (acesso total). */
  gerenteDesenvolvedor?: boolean;
  /**
   * Conta de acesso já existente a vincular (Usuario.id). Caminho secundário;
   * o normal é criar a conta pela senha. String vazia na edição = desvincular.
   */
  usuarioId?: string | null;
}

/** Um login (conta de acesso) disponível para vincular a um colaborador. */
export interface LoginColaborador {
  id: string;
  login: string;
  nome: string | null;
  perfil: string;
  /** Colaborador já vinculado a este login (null se livre). */
  colaboradorId: string | null;
  colaboradorNome: string | null;
}

export interface FiltroColaboradores {
  busca?: string;
  funcao?: FuncaoColaborador;
  turno?: TurnoColaborador;
  ativo?: boolean;
}

/**
 * Serviço do Cadastro Unificado de Colaboradores (Fase 4 do spec
 * `cadastro-colaboradores`). Cuida do CRUD do colaborador e dos seus
 * identificadores (`MATRICULA` e `LOGIN`), mantendo a unicidade. Os modelos
 * antigos (Operador/OperadorTurno/Fiscal) seguem intactos durante a transição.
 */
@Injectable()
export class ColaboradoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acessos: AcessosService,
  ) {}

  /**
   * Cadastra um colaborador. Para fiscal/supervisor/gerente, cria também a
   * conta de acesso ao app (login = matrícula, com a senha informada) e, no
   * caso de fiscal, o registro de fiscal (mantendo o painel/jornada/escala
   * funcionando). Operadores não recebem login (sem acesso ao app).
   */
  async cadastrar(input: ColaboradorInput): Promise<Colaborador> {
    const matricula = normalizarMatricula(input.matricula);
    const login = input.login ? normalizarLogin(input.login) : undefined;
    const funcao = input.funcao ?? 'OPERADOR';
    const perfilAcesso = perfilDaFuncao(funcao, input.gerenteDesenvolvedor);

    const jaMatricula = await this.prisma.colaborador.findUnique({
      where: { matricula },
    });
    if (jaMatricula) {
      throw new MatriculaColaboradorDuplicadaError(matricula);
    }
    if (login) {
      const jaLogin = await this.prisma.colaboradorIdentificador.findUnique({
        where: { tipo_valor: { tipo: 'LOGIN', valor: login } },
      });
      if (jaLogin) {
        throw new LoginColaboradorDuplicadoError(login);
      }
    }

    // Resolve a conta de acesso: vincula uma existente (caminho secundário) ou
    // cria uma nova com login = matrícula (caminho normal para quem entra no app).
    let usuarioId: string | null = null;
    if (input.usuarioId) {
      await this.garantirUsuarioVinculavel(input.usuarioId, null);
      usuarioId = input.usuarioId;
    } else if (perfilAcesso) {
      const senha = input.senha?.trim() ?? '';
      if (senha.length < 6) {
        throw new SenhaAcessoObrigatoriaError();
      }
      if (!(await this.acessos.loginDisponivel(matricula))) {
        throw new ContaAcessoExistenteError();
      }
      const senhaHash = await this.acessos.gerarHashSenha(senha);
      const conta = await this.prisma.usuario.create({
        data: {
          login: matricula,
          nome: input.nome.trim(),
          senhaHash,
          perfil: perfilAcesso,
        },
      });
      usuarioId = conta.id;
    }

    const colaborador = await this.prisma.colaborador.create({
      data: {
        matricula,
        nome: input.nome.trim(),
        funcao,
        genero: input.genero ?? null,
        turno: input.turno ?? null,
        entradaSemana: input.entradaSemana ?? null,
        saidaSemana: input.saidaSemana ?? null,
        entradaFds: input.entradaFds ?? null,
        saidaFds: input.saidaFds ?? null,
        folgaDiaSemana: input.folgaDiaSemana ?? null,
        usuarioId,
        identificadores: {
          create: [
            { tipo: 'MATRICULA', valor: matricula },
            ...(login ? [{ tipo: 'LOGIN' as const, valor: login }] : []),
          ],
        },
      },
    });

    // Fiscal: cria o registro que alimenta o painel/jornada/escala (uma vez).
    if (funcao === 'FISCAL' && usuarioId) {
      await this.garantirFiscal(usuarioId, input.nome.trim(), input.turno);
    }

    // Escala geral do fiscal a partir do cadastro (Opção A: fonte única).
    await this.sincronizarEscalaFiscal(colaborador);

    return colaborador;
  }

  /** Garante um registro de Fiscal para a conta (cria se ainda não existir). */
  private async garantirFiscal(
    usuarioId: string,
    nome: string,
    turno?: TurnoColaborador | null,
  ): Promise<void> {
    const existente = await this.prisma.fiscal.findFirst({
      where: { usuarioId },
    });
    if (existente) return;
    const mesmoNome = await this.prisma.fiscal.findUnique({ where: { nome } });
    if (mesmoNome) {
      // Já há um fiscal com esse nome: apenas garante o vínculo da conta.
      await this.prisma.fiscal.update({
        where: { id: mesmoNome.id },
        data: { usuarioId },
      });
      return;
    }
    await this.prisma.fiscal.create({
      data: { nome, turno: turnoFiscalDe(turno), usuarioId },
    });
  }

  /**
   * Sincroniza a escala semanal GERAL do fiscal a partir do cadastro (Opção A:
   * o Colaborador é a fonte única). Preserva os horários ESPECIAIS (exceções)
   * e o intervalo já cadastrado. Não faz nada se: não é fiscal, não tem conta/
   * registro de fiscal, ou ainda não tem escala definida no cadastro (evita
   * apagar a escala vinda do seed enquanto o gestor não a preenche aqui).
   */
  private async sincronizarEscalaFiscal(colaborador: Colaborador): Promise<void> {
    if (colaborador.funcao !== 'FISCAL' || !colaborador.usuarioId) return;
    const escala = {
      entradaSemana: colaborador.entradaSemana,
      saidaSemana: colaborador.saidaSemana,
      entradaFds: colaborador.entradaFds,
      saidaFds: colaborador.saidaFds,
      folgaDiaSemana: colaborador.folgaDiaSemana,
    };
    if (!temEscalaDefinida(escala)) return;
    const fiscal = await this.prisma.fiscal.findFirst({
      where: { usuarioId: colaborador.usuarioId },
      select: { id: true },
    });
    if (!fiscal) return;

    const dias = gerarEscalaSemanalFiscal(escala);
    // Preserva o intervalo já usado nas entradas gerais (ex.: 120 min do seed).
    const geraisAtuais = await this.prisma.escalaEntry.findMany({
      where: { funcionarioId: fiscal.id, especial: false },
      select: { intervaloMin: true },
    });
    const intervaloMin = geraisAtuais[0]?.intervaloMin ?? 0;

    await this.prisma.$transaction([
      // Remove apenas as entradas GERAIS; as exceções (especial) ficam intactas.
      this.prisma.escalaEntry.deleteMany({
        where: { funcionarioId: fiscal.id, especial: false },
      }),
      this.prisma.escalaEntry.createMany({
        data: dias.map((d) => ({
          funcionarioId: fiscal.id,
          colaboradorId: colaborador.id,
          diaSemana: d.diaSemana,
          entrada: d.entrada,
          saida: d.saida,
          intervaloMin,
          folga: d.folga,
          especial: false,
        })),
      }),
    ]);
  }

  /** Edita um colaborador, mantendo a unicidade de matrícula/login. */
  async editar(
    id: string,
    input: Partial<ColaboradorInput> & { ativo?: boolean },
  ): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) {
      throw new ColaboradorNaoEncontradoError();
    }

    const data: Prisma.ColaboradorUpdateInput = {};
    if (input.nome !== undefined) data.nome = input.nome.trim();
    if (input.genero !== undefined) data.genero = input.genero;
    if (input.funcao !== undefined) data.funcao = input.funcao;
    if (input.turno !== undefined) data.turno = input.turno;
    if (input.entradaSemana !== undefined)
      data.entradaSemana = input.entradaSemana;
    if (input.saidaSemana !== undefined) data.saidaSemana = input.saidaSemana;
    if (input.entradaFds !== undefined) data.entradaFds = input.entradaFds;
    if (input.saidaFds !== undefined) data.saidaFds = input.saidaFds;
    if (input.folgaDiaSemana !== undefined)
      data.folgaDiaSemana = input.folgaDiaSemana;
    if (input.ativo !== undefined) data.ativo = input.ativo;

    // Conta de acesso (login do app): string vazia/null = desvincular.
    if (input.usuarioId !== undefined) {
      const novoUsuario = input.usuarioId ? input.usuarioId : null;
      if (novoUsuario) {
        await this.garantirUsuarioVinculavel(novoUsuario, id);
      }
      data.usuarioId = novoUsuario;
    }

    // Matrícula (registro) — checa unicidade se mudar.
    let novaMatricula: string | undefined;
    if (input.matricula !== undefined) {
      const m = normalizarMatricula(input.matricula);
      if (m !== atual.matricula) {
        const ja = await this.prisma.colaborador.findUnique({
          where: { matricula: m },
        });
        if (ja && ja.id !== id) throw new MatriculaColaboradorDuplicadaError(m);
        data.matricula = m;
        novaMatricula = m;
      }
    }

    // Login — checa unicidade se informado (string vazia = remover).
    let novoLogin: string | null | undefined;
    if (input.login !== undefined) {
      novoLogin = input.login ? normalizarLogin(input.login) : null;
      if (novoLogin) {
        const jaLogin = await this.prisma.colaboradorIdentificador.findUnique({
          where: { tipo_valor: { tipo: 'LOGIN', valor: novoLogin } },
        });
        if (jaLogin && jaLogin.colaboradorId !== id) {
          throw new LoginColaboradorDuplicadoError(novoLogin);
        }
      }
    }

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const c = await tx.colaborador.update({ where: { id }, data });
      if (novaMatricula) {
        await tx.colaboradorIdentificador.deleteMany({
          where: { colaboradorId: id, tipo: 'MATRICULA' },
        });
        await tx.colaboradorIdentificador.create({
          data: { colaboradorId: id, tipo: 'MATRICULA', valor: novaMatricula },
        });
      }
      if (novoLogin !== undefined) {
        await tx.colaboradorIdentificador.deleteMany({
          where: { colaboradorId: id, tipo: 'LOGIN' },
        });
        if (novoLogin) {
          await tx.colaboradorIdentificador.create({
            data: { colaboradorId: id, tipo: 'LOGIN', valor: novoLogin },
          });
        }
      }
      return c;
    });

    // Conta de acesso: redefine a senha e/ou atualiza perfil/nome/login da
    // conta já vinculada. (Criar a conta na edição fica fora do escopo: o
    // normal é criá-la no cadastro.)
    await this.atualizarAcessoNaEdicao(atual, input, novaMatricula);

    // Mantém a escala geral do fiscal em sincronia com o cadastro (Opção A).
    await this.sincronizarEscalaFiscal(atualizado);

    return atualizado;
  }

  /** Atualiza a conta de acesso vinculada na edição (senha/perfil/nome/login). */
  private async atualizarAcessoNaEdicao(
    atual: Colaborador,
    input: Partial<ColaboradorInput>,
    novaMatricula?: string,
  ): Promise<void> {
    if (!atual.usuarioId) return;

    const senha = input.senha?.trim();
    if (input.senha !== undefined && input.senha !== '' && (senha?.length ?? 0) < 6) {
      throw new SenhaAcessoObrigatoriaError();
    }

    const funcao = input.funcao ?? atual.funcao;
    const perfilAcesso = perfilDaFuncao(funcao, input.gerenteDesenvolvedor);

    const upd: Prisma.UsuarioUpdateInput = {};
    if (perfilAcesso) upd.perfil = perfilAcesso;
    if (input.nome !== undefined) upd.nome = input.nome.trim();
    if (novaMatricula) {
      if (!(await this.acessos.loginDisponivel(novaMatricula))) {
        throw new ContaAcessoExistenteError();
      }
      upd.login = novaMatricula; // mantém login = matrícula
    }
    if (senha && senha.length >= 4) {
      upd.senhaHash = await this.acessos.gerarHashSenha(senha);
    }
    if (Object.keys(upd).length > 0) {
      await this.prisma.usuario.update({
        where: { id: atual.usuarioId },
        data: upd,
      });
    }
  }

  /** Lista os colaboradores, com busca e filtros opcionais. */
  async listar(filtro: FiltroColaboradores = {}): Promise<Colaborador[]> {
    const where: Prisma.ColaboradorWhereInput = {};
    if (filtro.funcao) where.funcao = filtro.funcao;
    if (filtro.turno) where.turno = filtro.turno;
    if (filtro.ativo !== undefined) where.ativo = filtro.ativo;
    if (filtro.busca && filtro.busca.trim()) {
      const b = filtro.busca.trim();
      where.OR = [
        { nome: { contains: b, mode: 'insensitive' } },
        { matricula: { contains: b } },
      ];
    }
    return this.prisma.colaborador.findMany({
      where,
      orderBy: [{ funcao: 'asc' }, { nome: 'asc' }],
    });
  }

  /** Detalhe de um colaborador (com seus identificadores). */
  async obter(
    id: string,
  ): Promise<Colaborador & { identificadores: unknown[] }> {
    const c = await this.prisma.colaborador.findUnique({
      where: { id },
      include: { identificadores: true },
    });
    if (!c) throw new ColaboradorNaoEncontradoError();
    return c;
  }

  /**
   * Lista as contas de acesso (logins) e a quem já estão vinculadas. Alimenta
   * o seletor "Conta de acesso" no cadastro do colaborador, deixando claro
   * quais logins estão livres e quais já pertencem a outra ficha.
   */
  async listarLogins(): Promise<LoginColaborador[]> {
    const [usuarios, vinculados] = await Promise.all([
      this.prisma.usuario.findMany({
        orderBy: [{ nome: 'asc' }, { login: 'asc' }],
        select: { id: true, login: true, nome: true, perfil: true },
      }),
      this.prisma.colaborador.findMany({
        where: { usuarioId: { not: null } },
        select: { id: true, nome: true, usuarioId: true },
      }),
    ]);
    const porUsuario = new Map(vinculados.map((c) => [c.usuarioId as string, c]));
    return usuarios.map((u) => {
      const vinculo = porUsuario.get(u.id);
      return {
        id: u.id,
        login: u.login,
        nome: u.nome,
        perfil: u.perfil,
        colaboradorId: vinculo?.id ?? null,
        colaboradorNome: vinculo?.nome ?? null,
      };
    });
  }

  /** Inativa um colaborador (preserva o histórico). */
  async inativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, false);
  }

  /** Reativa um colaborador. */
  async reativar(id: string): Promise<Colaborador> {
    return this.definirAtivo(id, true);
  }

  /**
   * Garante que a conta de acesso (Usuario) existe e não está vinculada a
   * outro colaborador. `selfId` é o colaborador em edição (ignorado na checagem
   * de duplicidade), ou null no cadastro.
   */
  private async garantirUsuarioVinculavel(
    usuarioId: string,
    selfId: string | null,
  ): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) {
      throw new LoginAppInexistenteError();
    }
    const outro = await this.prisma.colaborador.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (outro && outro.id !== selfId) {
      throw new LoginAppDuplicadoError();
    }
  }

  private async definirAtivo(id: string, ativo: boolean): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) throw new ColaboradorNaoEncontradoError();
    return this.prisma.colaborador.update({ where: { id }, data: { ativo } });
  }
}
