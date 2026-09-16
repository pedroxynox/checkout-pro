import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  CompensacaoHorasService,
  CompensacaoPainel,
  CompensacaoView,
} from './compensacao-horas.service';
import {
  AprovarCompensacaoDto,
  RecusarSugestaoDto,
} from './dto/compensacao-horas.dto';

/** Interpreta o parâmetro de ciclo (deslocamento): 0 = atual, -1 = anterior… */
function deslocamentoDe(ciclo?: string): number {
  const n = Number(ciclo);
  if (!Number.isInteger(n) || n > 0 || n < -24) return 0;
  return n;
}

/**
 * Compensação de horas (ADR 0021) — seção da Central de Jornada.
 *
 * ## Permissão
 *
 * Tudo aqui exige **`OPERADORES_AUSENCIAS`**, a mesma permissão do botão
 * "Débito" da Central de Jornada. É deliberado, e a razão é a definição do
 * próprio dono do projeto: *débito é compensação*. As duas operações são o mesmo
 * conceito — usar horas de 50% para cobrir tempo não trabalhado — em duas
 * direções no tempo. Criar uma funcionalidade nova no catálogo afirmaria que
 * conceder compensação é um poder distinto de marcar débito, e não é.
 */
@Controller('compensacao-horas')
@Funcionalidade('OPERADORES_AUSENCIAS')
export class CompensacaoHorasController {
  constructor(private readonly service: CompensacaoHorasService) {}

  /**
   * Painel da seção: carteira de 50% do time, dias mais fracos do ciclo,
   * liberações sugeridas, coberturas de falta sugeridas e o que já foi decidido.
   */
  @Get()
  painel(@Query('ciclo') ciclo?: string): Promise<CompensacaoPainel> {
    return this.service.painel(deslocamentoDe(ciclo));
  }

  /** Concede uma compensação (revalida tudo antes de gravar). */
  @Post('aprovar')
  @HttpCode(HttpStatus.OK)
  aprovar(
    @Body() dto: AprovarCompensacaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    return this.service.aprovar(dto, usuario);
  }

  /** Descarta uma sugestão, para ela não voltar na próxima consulta. */
  @Post('recusar')
  @HttpCode(HttpStatus.OK)
  recusar(
    @Body() dto: RecusarSugestaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    return this.service.recusar(dto, usuario);
  }

  /** Desfaz uma compensação concedida (a linha fica no histórico). */
  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  cancelar(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CompensacaoView> {
    return this.service.cancelar(id, usuario);
  }
}
