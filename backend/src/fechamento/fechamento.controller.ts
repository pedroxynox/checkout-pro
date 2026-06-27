import { Controller, Get, Query } from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { FechamentoService } from './fechamento.service';
import { ResumoFechamento } from './fechamento.domain';

/** Filtro (data de referência) do resumo do fechamento. */
export class ResumoFechamentoDto {
  @IsOptional()
  @IsISO8601()
  data?: string;
}

/**
 * Controller do Fechamento do dia. Expõe o resumo inteligente (estado dos
 * arquivos + checklists, pendências e alertas) para a tela de Fechamento.
 * Liberado a quem vê o fechamento (supervisor/gerente).
 */
@Controller('fechamento')
@Funcionalidade('FECHAMENTO')
export class FechamentoController {
  constructor(private readonly service: FechamentoService) {}

  /** Resumo inteligente do dia (padrão: hoje). */
  @Get('resumo')
  resumo(
    @Query() dto: ResumoFechamentoDto,
  ): Promise<ResumoFechamento & { dataISO: string }> {
    return this.service.resumo(dto.data ? new Date(dto.data) : new Date());
  }
}
