import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Insumo, MovimentoEstoque } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  CadastrarInsumoDto,
  ConsumoBobinaDto,
  ConsumoInsumoDto,
  RegistrarEntradaDto,
  RetiradaFardoDto,
} from './dto/insumos.dto';
import {
  InsumosService,
  InsumoComResumo,
  InsumoProativo,
  EntradaResumo,
} from './insumos.service';

/**
 * Controller do Modulo_Insumos (Req 3.1–3.3): cadastro de insumos, retirada de
 * fardo por código de barras, consumo de bobinas/insumos, saldo em tempo real,
 * alerta de estoque baixo e histórico de movimentos. Liberado ao fiscal
 * (`@Funcionalidade('INSUMOS')`).
 */
@Controller('insumos')
@Funcionalidade('INSUMOS')
export class InsumosController {
  constructor(private readonly insumosService: InsumosService) {}

  /** Lista os insumos ativos com o resumo de estoque (painel do almoxarifado). */
  @Get()
  async listar(): Promise<InsumoComResumo[]> {
    return this.insumosService.listarInsumos();
  }

  /** Painel proativo: insumos com predicción, nível, sugestão de reposição. */
  @Get('proativo')
  async proativo(): Promise<InsumoProativo[]> {
    return this.insumosService.listarProativo();
  }

  /** Registra consumo em embalagens inteiras (simplificado). */
  @Post('consumo-embalagem')
  @HttpCode(HttpStatus.OK)
  async consumoEmbalagem(
    @Body() dto: { insumoId: string; embalagens: number },
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ saldo: number }> {
    return this.insumosService.registrarConsumoEmbalagem(
      dto.insumoId,
      dto.embalagens,
      usuario?.sub,
    );
  }

  /** Lista as entradas recentes de estoque (Controle de requisição). */
  @Get('entradas')
  async entradas(): Promise<EntradaResumo[]> {
    return this.insumosService.listarEntradas();
  }

  /**
   * Registra uma entrada de estoque (Controle de requisição). Apenas
   * gerente/supervisor (`INSUMOS_GERENCIAR`).
   */
  @Post(':id/entrada')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async registrarEntrada(
    @Param('id') id: string,
    @Body() dto: RegistrarEntradaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ saldo: number }> {
    const saldo = await this.insumosService.registrarEntrada(
      id,
      dto.quantidade,
      dto.origem ?? 'ENTRADA',
      usuario?.sub,
      dto.data ? new Date(dto.data) : undefined,
    );
    return { saldo };
  }

  /** Cadastra um novo insumo com limite mínimo (Req 3.3.4). */
  @Post()
  async cadastrar(@Body() dto: CadastrarInsumoDto): Promise<Insumo> {
    return this.insumosService.cadastrarInsumo(
      dto.nome,
      dto.categoria,
      dto.limiteMinimo,
      dto.saldoInicial ?? 0,
    );
  }

  /** Saldo de estoque de um insumo em tempo real (Req 3.1.4). */
  @Get(':id/saldo')
  async saldo(@Param('id') id: string): Promise<{ saldo: number }> {
    return { saldo: await this.insumosService.saldo(id) };
  }

  /**
   * Registra a retirada de um fardo de sacolas pelo código de barras
   * (Req 3.1.1–3.1.3). Fardo não reconhecido resulta em 404 (filtro de erros).
   */
  @Post('fardos/retirada')
  @HttpCode(HttpStatus.OK)
  async retirarFardo(
    @Body() dto: RetiradaFardoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ saldo: number }> {
    const saldo = await this.insumosService.registrarRetiradaFardo({
      codigoBarras: dto.codigoBarras,
      insumoId: dto.insumoId,
      responsavelId: usuario?.sub,
      destino: dto.destino,
    });
    return { saldo };
  }

  /** Registra o consumo de bobinas de um PDV (Req 3.2.2). */
  @Post('bobinas/consumo')
  @HttpCode(HttpStatus.OK)
  async consumirBobina(
    @Body() dto: ConsumoBobinaDto,
  ): Promise<{ saldo: number }> {
    const saldo = await this.insumosService.registrarConsumoBobina(
      dto.insumoId,
      dto.pdvId,
      dto.quantidade,
    );
    return { saldo };
  }

  /** Registra o consumo de um insumo (Req 3.3.2). */
  @Post('consumo')
  @HttpCode(HttpStatus.OK)
  async consumirInsumo(
    @Body() dto: ConsumoInsumoDto,
  ): Promise<{ saldo: number }> {
    const saldo = await this.insumosService.registrarConsumoInsumo(
      dto.insumoId,
      dto.quantidade,
    );
    return { saldo };
  }

  /** Verifica se o estoque de um insumo está baixo (Req 3.1.5, 3.2.3, 3.3.3). */
  @Get(':id/estoque-baixo')
  async estoqueBaixo(
    @Param('id') id: string,
  ): Promise<{ estoqueBaixo: boolean }> {
    return {
      estoqueBaixo: await this.insumosService.verificarEstoqueBaixo(id),
    };
  }

  /** Histórico de movimentos/consumo de um insumo (Req 3.1.6, 3.2.4). */
  @Get(':id/historico')
  async historico(@Param('id') id: string): Promise<MovimentoEstoque[]> {
    return this.insumosService.historicoConsumo(id);
  }

  /**
   * Zera o estoque de todos os insumos (remove todos os movimentos). Operação
   * administrativa restrita ao gerente (`ADMIN_DADOS`).
   */
  @Delete('movimentos')
  @Funcionalidade('ADMIN_DADOS')
  async zerarEstoque(): Promise<{ removidos: number }> {
    return { removidos: await this.insumosService.zerarEstoque() };
  }
}
