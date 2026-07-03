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
import { DefinirMetaDto, ListarMetasDto } from './dto/metas.dto';
import { MetaMensalView, MetasService } from './metas.service';

/**
 * Controller das Metas mensais (Centro de Controle ▸ Metas). Restrito ao gestor
 * (OPERADORES_CRUD), igual ao restante do Centro de Controle: lista as metas de
 * um mês e permite defini-las uma a uma.
 */
@Controller('metas')
@Funcionalidade('OPERADORES_CRUD')
export class MetasController {
  constructor(private readonly metasService: MetasService) {}

  /** Lista as metas dos indicadores para o mês informado (AAAA-MM). */
  @Get()
  listar(@Query() dto: ListarMetasDto): Promise<MetaMensalView[]> {
    return this.metasService.listar(dto.anoMes);
  }

  /** Define (cria/atualiza) a meta de um indicador no mês. */
  @Post()
  @HttpCode(HttpStatus.OK)
  definir(
    @Body() dto: DefinirMetaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MetaMensalView> {
    return this.metasService.definir(
      dto.tipo,
      dto.anoMes,
      dto.meta,
      usuario?.sub,
    );
  }
}
