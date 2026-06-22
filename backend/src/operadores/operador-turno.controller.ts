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
import { OperadorTurno } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  GradeOperadoresDto,
  ImportarTurnosDto,
  TurnoOperadorDto,
} from './dto/operadores.dto';
import {
  GradeSemana,
  OperadorTurnoService,
} from './operador-turno.service';

/**
 * Quadro de Operadores (escala fixa visual). A grade e a lista são liberadas a
 * quem lança ausências (`OPERADORES_AUSENCIAS`); criar/editar/importar/remover
 * é administrativo (`OPERADORES_CRUD`).
 */
@Controller('quadro-operadores')
@Funcionalidade('OPERADORES_AUSENCIAS')
export class OperadorTurnoController {
  constructor(private readonly service: OperadorTurnoService) {}

  /** Grade semanal (Seg–Sáb) com status por dia e cobertura. */
  @Get('grade')
  grade(@Query() dto: GradeOperadoresDto): Promise<GradeSemana> {
    return this.service.grade(dto.data ? new Date(dto.data) : new Date());
  }

  /** Lista os operadores (turno fixo). */
  @Get('turnos')
  listar(): Promise<OperadorTurno[]> {
    return this.service.listar();
  }

  /** Cria ou atualiza (por nome) um operador. */
  @Post('turnos')
  @Funcionalidade('OPERADORES_CRUD')
  salvar(@Body() dto: TurnoOperadorDto): Promise<OperadorTurno> {
    return this.service.salvar(dto);
  }

  /** Importa em massa (upsert por nome). */
  @Post('turnos/importar')
  @Funcionalidade('OPERADORES_CRUD')
  @HttpCode(HttpStatus.OK)
  importar(@Body() dto: ImportarTurnosDto): Promise<{ salvos: number }> {
    return this.service.importar(dto.turnos);
  }

  /** Inativa um operador. */
  @Delete('turnos/:id')
  @Funcionalidade('OPERADORES_CRUD')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.service.remover(id);
  }
}
