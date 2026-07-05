import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { ResetOperacionalDto } from './dto/reset-operacional.dto';
import { ResetOperacionalService } from './reset-operacional.service';
import { ResumoDeReinicio } from './reset-operacional.domain';

/**
 * Controller do reinício operacional (`admin/reset-operacional`).
 *
 * Protegido pela funcionalidade `ADMIN_DADOS` (via `@Funcionalidade` +
 * `PerfilGuard`): sem permissão = 403, sem apagar nada. O body exige o marcador
 * de confirmação explícita (`confirmacao: "ZERAR"`).
 *
 * Requisitos 1.1, 1.2, 1.3, 1.4, 8.2.
 */
@Controller('admin/reset-operacional')
export class ResetOperacionalController {
  constructor(private readonly service: ResetOperacionalService) {}

  /** Dispara o reinício operacional e devolve o `Resumo_de_Reinicio`. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('ADMIN_DADOS')
  reiniciar(@Body() dto: ResetOperacionalDto): Promise<ResumoDeReinicio> {
    return this.service.reiniciar(dto);
  }
}
