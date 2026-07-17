import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  Colaborador,
  FuncaoColaborador,
  TipoContrato,
  TurnoColaborador,
} from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  ColaboradoresService,
  LoginColaborador,
} from './colaboradores.service';
import {
  PerfilColaboradorResposta,
  PerfilColaboradorService,
} from './perfil-colaborador.service';
import {
  PurgaInativosService,
  ResumoPurgaInativos,
} from './purga-inativos.service';
import {
  AdicionarIdentificadorDto,
  CadastrarColaboradorDto,
  EditarColaboradorDto,
  ListarColaboradoresDto,
  PerfilColaboradorDto,
} from './dto/colaboradores.dto';

/**
 * Controller do Cadastro Unificado de Colaboradores. É uma área administrativa
 * (gestor), por isso usa a mesma funcionalidade da gestão de operadores
 * (`OPERADORES_CRUD`). A listagem é liberada a quem já vê o quadro/escala
 * (`OPERADORES_AUSENCIAS`).
 */
@Controller('colaboradores')
@Funcionalidade('OPERADORES_CRUD')
export class ColaboradoresController {
  constructor(
    private readonly service: ColaboradoresService,
    private readonly perfilService: PerfilColaboradorService,
    private readonly purga: PurgaInativosService,
  ) {}

  /**
   * Purga AGORA todos os colaboradores inativos (mesma ação do cron do dia 1º).
   * Destrutivo e irreversível: exige `confirmacao: "PURGAR"`. Só desenvolvedor
   * (`ADMIN_DADOS`). O cron mensal roda sozinho; este endpoint é para rodar sob
   * demanda. Preserva os totais de arrecadação/APAE.
   */
  @Post('purga-inativos')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('ADMIN_DADOS')
  async purgarInativos(
    @Body() body: { confirmacao?: string },
  ): Promise<ResumoPurgaInativos> {
    if (body?.confirmacao !== 'PURGAR') {
      throw new BadRequestException(
        'Confirmação ausente. Envie { "confirmacao": "PURGAR" }.',
      );
    }
    return this.purga.purgarInativos();
  }

  /** Cadastra um colaborador (operador por padrão). */
  @Post()
  async cadastrar(
    @Body() dto: CadastrarColaboradorDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Colaborador> {
    return this.service.cadastrar(
      {
        nome: dto.nome,
        matricula: dto.matricula,
        login: dto.login,
        usuarioId: dto.usuarioId,
        senha: dto.senha,
        gerenteDesenvolvedor: dto.gerenteDesenvolvedor,
        funcao: dto.funcao as FuncaoColaborador | undefined,
        genero: dto.genero,
        turno: dto.turno as TurnoColaborador | undefined,
        entradaSemana: dto.entradaSemana,
        saidaSemana: dto.saidaSemana,
        entradaFds: dto.entradaFds,
        saidaFds: dto.saidaFds,
        folgaDiaSemana: dto.folgaDiaSemana,
        grupoDomingo: dto.grupoDomingo,
        entradaDom: dto.entradaDom,
        saidaDom: dto.saidaDom,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato as TipoContrato | undefined,
        tipoContratoJornadaId: dto.tipoContratoJornadaId,
      },
      usuario.perfil,
    );
  }

  /** Lista os colaboradores (busca/filtros). Liberado a quem vê a escala. */
  @Get()
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async listar(@Query() q: ListarColaboradoresDto): Promise<Colaborador[]> {
    return this.service.listar({
      busca: q.busca,
      funcao: q.funcao as FuncaoColaborador | undefined,
      turno: q.turno as TurnoColaborador | undefined,
      ativo: q.ativo === undefined ? undefined : q.ativo === 'true',
    });
  }

  /**
   * Contas de acesso (logins) disponíveis para vincular a um colaborador, com
   * a indicação de quais já estão em uso. Restrito ao gestor (OPERADORES_CRUD).
   */
  @Get('logins')
  async logins(): Promise<LoginColaborador[]> {
    return this.service.listarLogins();
  }

  /** Detalhe de um colaborador. Liberado a quem vê a escala. */
  @Get(':id')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async obter(@Param('id') id: string): Promise<Colaborador> {
    return this.service.obter(id);
  }

  /**
   * Perfil inteligente do colaborador no período (score, indicadores com
   * ranking/tendência, faltas com gráficos, resumo e insígnias). Sem `inicio`/
   * `fim`, usa o mês corrente. Liberado a quem vê a escala.
   */
  @Get(':id/perfil')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async perfil(
    @Param('id') id: string,
    @Query() q: PerfilColaboradorDto,
  ): Promise<PerfilColaboradorResposta> {
    const agora = new Date();
    const inicio = q.inicio
      ? new Date(q.inicio)
      : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const fim = q.fim ? new Date(q.fim) : agora;
    return this.perfilService.perfil(id, inicio, fim);
  }

  /** Edita um colaborador. */
  @Patch(':id')
  async editar(
    @Param('id') id: string,
    @Body() dto: EditarColaboradorDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Colaborador> {
    return this.service.editar(
      id,
      {
        nome: dto.nome,
        matricula: dto.matricula,
        login: dto.login,
        usuarioId: dto.usuarioId,
        senha: dto.senha,
        gerenteDesenvolvedor: dto.gerenteDesenvolvedor,
        funcao: dto.funcao as FuncaoColaborador | undefined,
        genero: dto.genero,
        turno: dto.turno as TurnoColaborador | undefined,
        entradaSemana: dto.entradaSemana,
        saidaSemana: dto.saidaSemana,
        entradaFds: dto.entradaFds,
        saidaFds: dto.saidaFds,
        folgaDiaSemana: dto.folgaDiaSemana,
        grupoDomingo: dto.grupoDomingo,
        entradaDom: dto.entradaDom,
        saidaDom: dto.saidaDom,
        dataAdmissao: dto.dataAdmissao,
        tipoContrato: dto.tipoContrato as TipoContrato | undefined,
        tipoContratoJornadaId: dto.tipoContratoJornadaId,
        ativo: dto.ativo,
      },
      usuario.perfil,
    );
  }

  /** Inativa um colaborador (preserva histórico). */
  @Post(':id/inativar')
  @HttpCode(HttpStatus.OK)
  async inativar(@Param('id') id: string): Promise<Colaborador> {
    return this.service.inativar(id);
  }

  /** Reativa um colaborador. */
  @Post(':id/reativar')
  @HttpCode(HttpStatus.OK)
  async reativar(@Param('id') id: string): Promise<Colaborador> {
    return this.service.reativar(id);
  }

  /**
   * Associa um código "solto" (matrícula/login do arquivo) a este colaborador,
   * resolvendo os lançamentos antes "não reconhecidos" (fila). Gestor.
   */
  @Post(':id/identificadores')
  @HttpCode(HttpStatus.OK)
  async adicionarIdentificador(
    @Param('id') id: string,
    @Body() dto: AdicionarIdentificadorDto,
  ): Promise<{ ok: true }> {
    await this.service.adicionarIdentificador(id, dto.valor);
    return { ok: true };
  }
}
