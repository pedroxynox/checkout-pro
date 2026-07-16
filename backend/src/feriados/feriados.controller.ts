import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Feriado } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { CriarFeriadoDto } from './dto/feriados.dto';
import { FeriadosService, FeriadoView } from './feriados.service';

/**
 * Feriados (uso gerencial). Os nacionais são reconhecidos automaticamente; o
 * gestor cadastra os estaduais/municipais. Gate por CENTRAL_JORNADA (mesma
 * alçada da Central de Jornada, que consome esses feriados) — o fiscal, que só
 * acompanha a jornada da equipe (FISCAIS_JORNADA), NÃO gerencia feriados.
 */
@Controller('feriados')
@Funcionalidade('CENTRAL_JORNADA')
export class FeriadosController {
  constructor(private readonly service: FeriadosService) {}

  /** Lista os feriados do ano (nacionais + manuais). `ano` opcional (default: atual). */
  @Get()
  listar(@Query('ano') ano?: string): Promise<FeriadoView[]> {
    const n = Number(ano);
    const anoValido =
      Number.isInteger(n) && n >= 2000 && n <= 2100
        ? n
        : new Date().getUTCFullYear();
    return this.service.listarDoAno(anoValido);
  }

  /** Cadastra um feriado manual (estadual/municipal). */
  @Post()
  criar(
    @Body() dto: CriarFeriadoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Feriado> {
    return this.service.adicionar(dto, {
      sub: usuario?.sub,
      nome: usuario?.nome,
    });
  }

  /** Remove um feriado manual. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.service.remover(id);
  }
}
