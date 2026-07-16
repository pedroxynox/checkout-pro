import { Body, Controller, Get, Put } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { DefinirAncoraDomingoDto } from './dto/escala-domingo.dto';
import {
  EscalaDomingoConfig,
  EscalaDomingoService,
} from './escala-domingo.service';

/**
 * Controller do rodízio de domingo (`config/escala-domingo`).
 *
 * - `GET`: leitura autenticada (âncora + preview dos próximos domingos).
 * - `PUT`: define o ponto de partida (restrito a `ESCALA_DOMINGO_CONFIG` — só
 *   administrador).
 */
@Controller('config/escala-domingo')
export class EscalaDomingoController {
  constructor(private readonly service: EscalaDomingoService) {}

  /** Configuração vigente do rodízio + preview dos próximos domingos. */
  @Get()
  obter(): Promise<EscalaDomingoConfig> {
    return this.service.obter();
  }

  /** Define o rodízio: referência + ordem do ciclo (somente administrador). */
  @Put()
  @Funcionalidade('ESCALA_DOMINGO_CONFIG')
  definir(
    @Body() dto: DefinirAncoraDomingoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<EscalaDomingoConfig> {
    return this.service.definir(dto.ancoraData, dto.ordem, usuario?.sub);
  }
}
