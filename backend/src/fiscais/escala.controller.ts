import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EscalaEntry as EscalaEntryPrisma } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { CadastrarEscalaDto, EscalaEntryDto } from './dto/fiscais.dto';
import { EscalaEfetiva, ItemEscalaConsolidada } from './escala.domain';
import { EscalaService } from './escala.service';

/**
 * Controller da escala de trabalho (Req 4.3): cadastro de escala geral e de
 * horário especial individual (administrativo — gerente), além da resolução e
 * consolidação da escala efetiva (visualização — liberada ao fiscal).
 */
@Controller('escala')
export class EscalaController {
  constructor(private readonly escalaService: EscalaService) {}

  /** Cadastra a escala geral de um funcionário num dia (Req 4.3.1–4.3.4). */
  @Post()
  @Funcionalidade('ESCALA_EDITAR')
  async cadastrar(@Body() dto: CadastrarEscalaDto): Promise<EscalaEntryPrisma> {
    return this.escalaService.cadastrarEscala(dto);
  }

  /** Define um horário especial individual que prevalece (Req 4.3.5). */
  @Post(':funcionarioId/especial')
  @Funcionalidade('ESCALA_EDITAR')
  async definirEspecial(
    @Param('funcionarioId') funcionarioId: string,
    @Body() dto: EscalaEntryDto,
  ): Promise<EscalaEntryPrisma> {
    return this.escalaService.definirHorarioEspecial(funcionarioId, {
      funcionarioId,
      ...dto,
    });
  }

  /**
   * Escala consolidada por dia da semana (Req 4.3.6). Aceita `?data=YYYY-MM-DD`
   * opcional: quando a data é um domingo, a escala dos fiscais vem do rodízio de
   * grupos (G1/G2/G3), não da escala semanal.
   */
  @Get('consolidada/:diaSemana')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async consolidada(
    @Param('diaSemana') diaSemana: string,
    @Query('data') data?: string,
  ): Promise<ItemEscalaConsolidada[]> {
    return this.escalaService.escalaConsolidada(Number(diaSemana), data);
  }

  /** Escala efetiva de um funcionário num dia (Req 4.3.5). */
  @Get(':funcionarioId/efetiva')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async efetiva(
    @Param('funcionarioId') funcionarioId: string,
    @Query('diaSemana') diaSemana: string,
  ): Promise<{ efetiva: EscalaEfetiva }> {
    const efetiva = await this.escalaService.resolverEscalaEfetiva(
      funcionarioId,
      Number(diaSemana),
    );
    return { efetiva };
  }
}
