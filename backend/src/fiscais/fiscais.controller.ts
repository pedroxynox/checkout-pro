import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { DefinirStatusDto } from './dto/fiscais.dto';
import {
  FiscaisService,
  ItemFolga,
  ItemHorasExtras,
  ItemJornada,
  ItemPainel,
  ResumoStatus,
} from './fiscais.service';
import { Jornada } from './fiscais.domain';

/**
 * API do Modulo_Fiscais (controle de jornada).
 *
 * - Painel em tempo real: visível a quem acessa a área (FISCAIS_STATUS).
 * - Ações do próprio fiscal (auto-identificado pelo login): definir status e
 *   informar falta do dia.
 * - Log de jornada (tempos): apenas gestores (FISCAIS_JORNADA).
 */
@Controller('fiscais')
export class FiscaisController {
  constructor(private readonly service: FiscaisService) {}

  /** Painel de todos os fiscais com o status atual. */
  @Get('painel')
  @Funcionalidade('FISCAIS_STATUS')
  painel(): Promise<ItemPainel[]> {
    return this.service.painel();
  }

  /** Resumo do próprio fiscal (status + jornada); null se o usuário não for fiscal. */
  @Get('eu')
  meuResumo(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.service.meuResumo(usuario.sub);
  }

  /** O fiscal define o próprio status (Disponível / Intervalo / Fora de expediente). */
  @Post('eu/status')
  @HttpCode(HttpStatus.OK)
  async definirMeuStatus(
    @Body() dto: DefinirStatusDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResumoStatus & Jornada> {
    const fiscal = await this.service.meuFiscal(usuario.sub);
    return this.service.definirStatus(fiscal.id, dto.status);
  }

  /** O fiscal informa a própria falta do dia atual. */
  @Post('eu/falta')
  @HttpCode(HttpStatus.NO_CONTENT)
  async informarFalta(
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    const fiscal = await this.service.meuFiscal(usuario.sub);
    await this.service.registrarFalta(fiscal.id);
  }

  /** Log de jornada do dia (tempos por fiscal) — apenas gestores. */
  @Get('jornada')
  @Funcionalidade('FISCAIS_JORNADA')
  jornada(@Query('data') data?: string): Promise<ItemJornada[]> {
    return this.service.jornadaDoDia(data ? new Date(data) : new Date());
  }

  /** Acumulado de horas extras do mês (por fiscal) — apenas gestores. */
  @Get('horas-extras-mes')
  @Funcionalidade('FISCAIS_JORNADA')
  horasExtrasMes(@Query('mes') mes?: string): Promise<ItemHorasExtras[]> {
    return this.service.horasExtrasMes(mes ? new Date(mes) : undefined);
  }

  /** Lista de fiscais que estão de folga hoje. */
  @Get('folga-hoje')
  @Funcionalidade('FISCAIS_STATUS')
  folgaHoje(): Promise<ItemFolga[]> {
    return this.service.folgaHoje();
  }

  /** Histórico semanal do próprio fiscal (últimos 7 dias). */
  @Get('eu/historico-semanal')
  async historicoSemanal(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.service.historicoSemanal(usuario.sub);
  }

  /** Ranking do mês (puntualidade) — apenas gestores. */
  @Get('ranking-mes')
  @Funcionalidade('FISCAIS_JORNADA')
  rankingMes() {
    return this.service.rankingMes();
  }

  /** Previsão de horas extras do mês — apenas gestores. */
  @Get('previsao-extras')
  @Funcionalidade('FISCAIS_JORNADA')
  previsaoExtras() {
    return this.service.previsaoExtras();
  }

  /** Contexto de escala para integração com Cluby. */
  @Get('contexto-escala')
  async contextoEscala() {
    return this.service.contextoEscala();
  }
}
