import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EscalaEntry as EscalaEntryPrisma } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { CadastrarEscalaDto } from './dto/fiscais.dto';
import { EscalaEfetiva, ItemEscalaConsolidada } from './escala.domain';
import { EscalaService } from './escala.service';

/**
 * Controller da escala de trabalho (Req 4.3): cadastro da escala geral
 * (administrativo — gerente) e resolução/consolidação da escala efetiva
 * (visualização — liberada ao fiscal).
 *
 * **Não existe mais rota de horário especial.** Ela gravava uma exceção por dia
 * da semana que prevalecia sobre a ficha, sem validade e sem nenhuma tela que a
 * exibisse ou apagasse. O horário passou a ser sempre o da ficha (ADR 0026).
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
