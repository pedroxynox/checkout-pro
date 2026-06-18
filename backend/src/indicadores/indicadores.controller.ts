import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { VendaDiaria } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  AcumuladoDto,
  IndicadorCorDto,
  PercentualDto,
  RankingFiscaisDto,
  RankingOperadoresDto,
  RegistrarVendaDto,
} from './dto/indicadores.dto';
import { RankingItem, StatusCor } from './indicadores.domain';
import { IndicadoresService } from './indicadores.service';

/**
 * Controller do Modulo_Indicadores (Req 2.1–2.5): Painel de Vendas, indicador
 * percentual e classificação de cor, e rankings de operadores/fiscais.
 *
 * O registro/alteração de vendas é administrativo (gerente). A visualização de
 * indicadores e do painel é liberada ao fiscal — por isso cada handler declara
 * a sua própria funcionalidade.
 */
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly indicadoresService: IndicadoresService) {}

  /** Registra o valor de vendas de um dia (Req 2.1.1) — administrativo. */
  @Post('vendas')
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  async registrarVenda(@Body() dto: RegistrarVendaDto): Promise<VendaDiaria> {
    return this.indicadoresService.registrarVenda(
      new Date(dto.data),
      dto.valor,
    );
  }

  /** Altera o valor de vendas já informado para um dia (Req 2.1.5). */
  @Put('vendas')
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  async alterarVenda(@Body() dto: RegistrarVendaDto): Promise<VendaDiaria> {
    return this.indicadoresService.alterarVenda(new Date(dto.data), dto.valor);
  }

  /** Acumulado de vendas do período (dia/semana/mês) (Req 2.1.2, 2.1.3). */
  @Get('vendas/acumulado')
  @Funcionalidade('PAINEL_VENDAS_VISUALIZAR')
  async acumulado(@Query() dto: AcumuladoDto): Promise<{ total: number }> {
    const total = await this.indicadoresService.acumulado(
      new Date(dto.data),
      dto.periodo,
    );
    return { total };
  }

  /** Indicador percentual avulso (Req 2.2.1, 2.3.1). */
  @Post('percentual')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INDICADORES_VISUALIZAR')
  percentual(@Body() dto: PercentualDto): { percentual: number } {
    return {
      percentual: this.indicadoresService.percentual(
        dto.totalIndicador,
        dto.totalVendas,
      ),
    };
  }

  /** Classificação de cor de um indicador conforme a meta (Req 2.2–2.5). */
  @Post('cor')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('INDICADORES_VISUALIZAR')
  cor(@Body() dto: IndicadorCorDto): { cor: StatusCor } {
    const config = this.indicadoresService.configPadrao(
      dto.indicador,
      dto.limiteAmarelo,
    );
    return { cor: this.indicadoresService.statusCor(dto.valor, config) };
  }

  /** Ranking de operadores por tipo de registro no período (Req 2.2.6 etc.). */
  @Get('ranking/operadores')
  @Funcionalidade('INDICADORES_VISUALIZAR')
  async rankingOperadores(
    @Query() dto: RankingOperadoresDto,
  ): Promise<RankingItem[]> {
    return this.indicadoresService.rankingOperadores(dto.tipo, {
      inicio: new Date(dto.inicio),
      fim: new Date(dto.fim),
    });
  }

  /** Ranking de fiscais por devoluções no período (Req 2.3.6). */
  @Get('ranking/fiscais')
  @Funcionalidade('INDICADORES_VISUALIZAR')
  async rankingFiscais(
    @Query() dto: RankingFiscaisDto,
  ): Promise<RankingItem[]> {
    return this.indicadoresService.rankingFiscais({
      inicio: new Date(dto.inicio),
      fim: new Date(dto.fim),
    });
  }
}
