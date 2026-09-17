import { Controller, Get, Param, Query } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { ItemEscalaConsolidada } from './escala.domain';
import { EscalaService } from './escala.service';

/**
 * Controller da escala de trabalho dos fiscais (Req 4.3.6): a escala consolidada
 * de um dia, resolvida a partir da ficha de cada colaborador.
 *
 * ## As rotas que deixaram de existir (ADR 0026)
 *
 * - **POST `/escala`** gravava uma hora por dia da semana na cópia semanal. A hora
 *   cobrada passou a ser a da ficha, então essa gravação não teria mais efeito
 *   nenhum — e uma rota que aceita um horário sem que ele valha em lugar algum é
 *   pior do que rota nenhuma. O horário se edita na ficha do colaborador.
 * - **POST `/escala/:funcionarioId/especial`** criava exceções de horário que
 *   venciam a ficha, sem validade e sem tela (etapa 1).
 * - **GET `/escala/:funcionarioId/efetiva`** lia a cópia semanal e não tinha
 *   nenhum consumidor.
 */
@Controller('escala')
export class EscalaController {
  constructor(private readonly escalaService: EscalaService) {}

  /**
   * Escala consolidada por dia da semana (Req 4.3.6). Aceita
   * `?data=YYYY-MM-DD` opcional: com a data concreta valem o feriado, a posição
   * no rodízio de domingo (G1/G2/G3) e as férias do dia; sem ela, a resposta é o
   * turno típico daquele dia da semana.
   */
  @Get('consolidada/:diaSemana')
  @Funcionalidade('ESCALA_VISUALIZAR')
  async consolidada(
    @Param('diaSemana') diaSemana: string,
    @Query('data') data?: string,
  ): Promise<ItemEscalaConsolidada[]> {
    return this.escalaService.escalaConsolidada(Number(diaSemana), data);
  }
}
