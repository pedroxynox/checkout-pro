import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { PedidosRecorrentesService } from './pedidos-recorrentes.service';

/**
 * Controller de Pedidos Recorrentes de Insumos.
 * Gestão do padrão de compras semanal/quinzenal.
 */
@Controller('insumos/pedidos-recorrentes')
@Funcionalidade('INSUMOS')
export class PedidosRecorrentesController {
  constructor(private readonly service: PedidosRecorrentesService) {}

  /** Sugestões pendentes (card "Pedido da semana"). */
  @Get('sugestoes')
  async sugestoesPendentes() {
    return this.service.listarPendentes();
  }

  /** Próximo pedido quinzenal (sacolas): quantos dias faltam. */
  @Get('proximo-quinzenal')
  async proximoQuinzenal() {
    return this.service.proximoPedidoQuinzenal();
  }

  /** Lista os pedidos recorrentes configurados. */
  @Get()
  async listar() {
    return this.service.listarPedidosRecorrentes();
  }

  /** Confirma sugestões (dá entrada no estoque). */
  @Post('confirmar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async confirmar(
    @Body() dto: { ids: string[]; ajustes?: Record<string, number> },
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    return this.service.confirmarSugestoes(dto.ids, dto.ajustes, usuario?.sub);
  }

  /** Ignora sugestões (descarta sem dar entrada). */
  @Post('ignorar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async ignorar(@Body() dto: { ids: string[] }) {
    await this.service.ignorarSugestoes(dto.ids);
    return { ok: true };
  }

  /** Configura um pedido recorrente. */
  @Post('configurar')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INSUMOS_GERENCIAR')
  async configurar(
    @Body()
    dto: {
      insumoId: string;
      quantidade: number;
      frequenciaDias: number;
      diaSugestao?: number;
    },
  ) {
    return this.service.configurar(
      dto.insumoId,
      dto.quantidade,
      dto.frequenciaDias,
      dto.diaSugestao,
    );
  }
}
