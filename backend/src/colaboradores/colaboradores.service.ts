import { Injectable } from '@nestjs/common';
import {
  Colaborador,
  FuncaoColaborador,
  Perfil,
  Prisma,
  TipoContrato,
  TurnoColaborador,
  TurnoFiscal,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcessosService } from '../acessos/acessos.service';
import { inicioDoDia } from '../common/datas';
import {
  gerarEscalaSemanalFiscal,
  temEscalaDefinida,
} from '../fiscais/escala.domain';
import { Perfil as PerfilSolicitante } from '../acessos/acessos.domain';
import { normalizarLogin, normalizarMatricula } from './colaboradores.domain';
import {
  ColaboradorNaoEncontradoError,
  ContaAcessoExistenteError,
  LoginAppDuplicadoError,
  LoginAppInexistenteError,
  LoginColaboradorDuplicadoError,
  MatriculaColaboradorDuplicadaError,
  PermissaoInsuficienteFuncaoError,
  SenhaAcessoObrigatoriaError,
  TurnoObrigatorioError,
} from './colaboradores.errors';

/** Funções que têm acesso ao app (login). Operador NÃO entra no app. */
function perfilDaFuncao(
  funcao: FuncaoColaborador,
  gerenteDesenvolvedor?: boolean,
): Perfil | null {
  if (funcao === 'FISCAL') return 'FISCAL';
  if (funcao === 'SUPERVISOR') return 'SUPERVISOR';
  if (funcao === 'GESTOR') {
    return gerenteDesenvolvedor ? 'ADMINISTRADOR' : 'GERENTE';
  }
  return null;
}

/**
 * Garante que só o gerente desenvolvedor conceda acesso de nível gerencial.
 * Impede escalada de privilégios: quem administra colaboradores (ex.:
 * supervisor, que tem OPERADORES_CRUD) não pode criar/promover uma conta para
 * GESTOR (que vira GERENTE/ADMINISTRADOR) nem marcar
 * `gerenteDesenvolvedor`. Só o próprio ADMINISTRADOR pode fazê-lo.
 */
function validarPermissaoDeFuncao(
  perfilSolicitante: PerfilSolicitante | undefined,
  funcao: FuncaoColaborador,
  gerenteDesenvolvedor?: boolean,
): void {
  const concedeAcessoGerencial =
    funcao === 'GESTOR' || gerenteDesenvolvedor === true;
  if (concedeAcessoGerencial && perfilSolicitante !== 'ADMINISTRADOR') {
    throw new PermissaoInsuficienteFuncaoError();
  }
}

/**
 * Fiscal e operador trabalham num turno fixo (é o que agrupa a escala do dia),
 * então o turno é obrigatório para eles. Supervisor, gerente e administrador
 * não têm turno fixo.
 */
function funcaoExigeTurno(funcao: FuncaoColaborador): boolean {
  return funcao === 'FISCAL' || funcao === 'OPERADOR';
}

/** Garante o turno quando a função exige (fiscal/operador). */
function validarTurnoObrigatorio(
  funcao: FuncaoColaborador,
  turno: TurnoColaborador | null | undefined,
): void {
  if (funcaoExigeTurno(funcao) && !turno) {
    throw new TurnoObrigatorioError();
  }
}

/** Mapeia o turno do colaborador para o turno do fiscal (3 turnos). */
function turnoFiscalDe(turno?: TurnoColaborador | null): TurnoFiscal {
  if (
    turno === 'ABERTURA' ||
    turno === 'INTERMEDIARIO' ||
    turno === 'FECHAMENTO'
  ) {
    return turno;
  }
  return 'INTERMEDIARIO';
}

/**
 * Normaliza a data de admissão para meia-noite UTC (ou null quando ausente).
 * NÃO valida contra a Data_Inicial_Sistema: admissões históricas são legítimas.
 */
function normalizarAdmissao(
  valor: string | Date | null | undefined,
): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const d = inicioDoDia(new Date(valor));
  return Number.isNaN(d.getTime()) ? null : d;
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
  /** Grupo do rodízio de domingo ('G1'|'G2'|'G3'); null = fora do rodízio. */
  grupoDomingo?: string | null;
  /** Horário de domingo ("HH:mm"), por pessoa. */
  entradaDom?: string | null;
  saidaDom?: string | null;
  /** Data de admissão (base do módulo de Contratos). ISO ou Date; null limpa. */
  dataAdmissao?: string | Date | null;
  /** Tipo de contrato (regras de jornada). Ausente = mantém/usa o default. */
  tipoContrato?: TipoContrato;
  /**
   * Tipo de contrato de jornada data-driven (catálogo). undefined = não altera;
   * null = remove (volta ao padrão); string = atribui esse contrato.
   */
  tipoContratoJornadaId?: string | null;
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
  /**
   * Se o contrato de jornada informado NÃO trabalha domingo, o colaborador não
   * pode ficar no rodízio de domingo — devolve null. Caso contrário, mantém o
   * grupo informado.
   */
  private async grupoDomingoEfetivo(
    grupoDomingo: string | null,
    tipoContratoJornadaId?: string | null,
  ): Promise<string | null> {
    if (!grupoDomingo || !tipoContratoJornadaId) return grupoDomingo;
    const contrato = await this.prisma.tipoContratoJornada.findUnique({
      where: { id: tipoContratoJornadaId },
      select: { trabalhaDomingo: true },
    });
    return contrato && !contrato.trabalhaDomingo ? null : grupoDomingo;
  }

  async cadastrar(
    input: ColaboradorInput,
    perfilSolicitante?: PerfilSolicitante,
  ): Promise<Colaborador> {
    const matricula = normalizarMatricula(input.matricula);
    const login = input.login ? normalizarLogin(input.login) : undefined;
    const funcao = input.funcao ?? 'OPERADOR';
    validarPermissaoDeFuncao(
      perfilSolicitante,
      funcao,
      input.gerenteDesenvolvedor,
    );
    // Fiscal e operador precisam de turno fixo (agrupa a escala do dia).
    validarTurnoObrigatorio(funcao, input.turno ?? null);
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

    // Se o contrato não trabalha domingo, o colaborador não entra no rodízio.
    const grupoDomingoEfetivo = await this.grupoDomingoEfetivo(
      input.grupoDomingo ?? null,
      input.tipoContratoJornadaId,
    );

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
        grupoDomingo: grupoDomingoEfetivo,
        entradaDom: input.entradaDom ?? null,
        saidaDom: input.saidaDom ?? null,
        dataAdmissao: normalizarAdmissao(input.dataAdmissao),
        // Ausente → Prisma aplica o default (6x1 - 2x1).
        tipoContrato: input.tipoContrato,
        // Contrato de jornada data-driven (opcional). Sem ele, usa o padrão.
        tipoContratoJornada: input.tipoContratoJornadaId
          ? { connect: { id: input.tipoContratoJornadaId } }
          : undefined,
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
  private async sincronizarEscalaFiscal(
    colaborador: Colaborador,
  ): Promise<void> {
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
    perfilSolicitante?: PerfilSolicitante,
  ): Promise<Colaborador> {
    const atual = await this.prisma.colaborador.findUnique({ where: { id } });
    if (!atual) {
      throw new ColaboradorNaoEncontradoError();
    }

    // Impede escalada de privilégios: só o gerente desenvolvedor pode conceder
    // acesso de nível gerencial ao mudar a função/flag de um colaborador.
    if (
      input.funcao !== undefined ||
      input.gerenteDesenvolvedor !== undefined
    ) {
      validarPermissaoDeFuncao(
        perfilSolicitante,
        input.funcao ?? atual.funcao,
        input.gerenteDesenvolvedor,
      );
    }

    // Fiscal e operador precisam de turno fixo. Valida só quando a função ou o
    // turno mudam, para não travar a edição de outros campos de cadastros
    // antigos que ainda não têm turno.
    if (input.funcao !== undefined || input.turno !== undefined) {
      const funcaoEfetiva = input.funcao ?? atual.funcao;
      const turnoEfetivo =
        input.turno !== undefined ? input.turno : atual.turno;
      validarTurnoObrigatorio(funcaoEfetiva, turnoEfetivo ?? null);
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
    if (input.grupoDomingo !== undefined)
      data.grupoDomingo = input.grupoDomingo;
    if (input.entradaDom !== undefined) data.entradaDom = input.entradaDom;
    if (input.saidaDom !== undefined) data.saidaDom = input.saidaDom;
    if (input.dataAdmissao !== undefined)
      data.dataAdmissao = normalizarAdmissao(input.dataAdmissao);
    if (input.tipoContrato !== undefined)
      data.tipoContrato = input.tipoContrato;
    // Contrato de jornada data-driven: string atribui, null remove (volta ao padrão).
    if (input.tipoContratoJornadaId !== undefined)
      data.tipoContratoJornada = input.tipoContratoJornadaId
        ? { connect: { id: input.tipoContratoJornadaId } }
        : { disconnect: true };
    // Ao atribuir um contrato que NÃO trabalha domingo, o colaborador sai do
    // rodízio (grupoDomingo = null), mesmo que não tenha sido tocado no form.
    if (input.tipoContratoJornadaId) {
      const contrato = await this.prisma.tipoContratoJornada.findUnique({
        where: { id: input.tipoContratoJornadaId },
        select: { trabalhaDomingo: true },
      });
      if (contrato && !contrato.trabalhaDomingo) data.grupoDomingo = null;
    }
    if (input.ativo !== undefined) {
      data.ativo = input.ativo;
      // Marca/limpa a data de desligamento (base da janela de retenção da
      // purga mensal). Só marca na transição ativo -> inativo (não reinicia o
      // relógio se já estava inativo); reativar limpa a data.
      if (input.ativo === false && atual.ativo) {
        data.desligadoEm = new Date();
      } else if (input.ativo === true) {
        data.desligadoEm = null;
      }
    }

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
    if (
      input.senha !== undefined &&
      input.senha !== '' &&
      (senha?.length ?? 0) < 6
    ) {
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
    const porUsuario = new Map(
      vinculados.map((c) => [c.usuarioId as string, c]),
    );
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
   * Associa um código bruto (matrícula/login que veio do arquivo e não casava
   * com ninguém) a um colaborador, criando um identificador `MATRICULA`. Como a
   * resolução de todos os indicadores cai na matrícula em último caso, isso
   * passa a atribuir o histórico desse código ao colaborador (retroativo).
   * Idempotente: se o código já é dele, não faz nada; se é de outro, erro.
   */
  async adicionarIdentificador(
    colaboradorId: string,
    valor: string,
  ): Promise<void> {
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true },
    });
    if (!colaborador) throw new ColaboradorNaoEncontradoError();

    const m = normalizarMatricula(valor);
    const existente = await this.prisma.colaboradorIdentificador.findUnique({
      where: { tipo_valor: { tipo: 'MATRICULA', valor: m } },
      select: { colaboradorId: true },
    });
    if (existente) {
      if (existente.colaboradorId === colaboradorId) return; // já é dele
      throw new MatriculaColaboradorDuplicadaError(m);
    }
    await this.prisma.colaboradorIdentificador.create({
      data: { colaboradorId, tipo: 'MATRICULA', valor: m },
    });
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
    // Mantém `desligadoEm` coerente (base da janela de retenção da purga):
    // marca na transição ativo -> inativo; reativar limpa a data.
    const data: Prisma.ColaboradorUpdateInput = { ativo };
    if (ativo === false && atual.ativo) {
      data.desligadoEm = new Date();
    } else if (ativo === true) {
      data.desligadoEm = null;
    }
    return this.prisma.colaborador.update({ where: { id }, data });
  }
}
