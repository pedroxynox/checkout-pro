import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { EditarDataInicialDto } from './dto/data-inicial.dto';
import {
  DataInicialResultado,
  DataInicialService,
} from './data-inicial.service';

/**
 * Controller da Data_Inicial_Sistema (`config/data-inicial`).
 *
 * - `GET`: leitura autenticada para o app (limite inferior dos calendários).
 * - `PATCH`: edição restrita à funcionalidade `ADMIN_DADOS` (via `PerfilGuard`),
 *   registrando quem atualizou.
 *
 * Requisitos 5.3, 5.4, 5.5, 8.2.
 */
@Controller('config/data-inicial')
export class DataInicialController {
  constructor(private readonly service: DataInicialService) {}

  /** Data_Inicial_Sistema vigente (leitura para o app). */
  @Get()
  obter(): Promise<DataInicialResultado> {
    return this.service.obter();
  }

  /** Edita a Data_Inicial_Sistema (somente `ADMIN_DADOS`). */
  @Patch()
  @Funcionalidade('ADMIN_DADOS')
  editar(
    @Body() dto: EditarDataInicialDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<DataInicialResultado> {
    return this.service.editar(dto.dataInicial, usuario?.sub);
  }
}
