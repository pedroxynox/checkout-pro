import { Controller, Get, Query } from '@nestjs/common';
import { OperadorTurno } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { GradeOperadoresDto, PeriodoAusenciasDto } from './dto/operadores.dto';
import {
  AnaliticaFaltas,
  AoVivoOperadores,
  DiaOperadores,
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

  /** Roster de um único dia (ordenado por entrada, folga ao fim). Padrão: hoje. */
  @Get('dia')
  dia(@Query() dto: GradeOperadoresDto): Promise<DiaOperadores> {
    return this.service.diaOperadores(
      dto.data ? new Date(dto.data) : undefined,
    );
  }

  /** Tablero "ao vivo": quem deveria estar no caixa agora. */
  @Get('ao-vivo')
  aoVivo(): Promise<AoVivoOperadores> {
    return this.service.aoVivo();
  }

  /** Analítica de faltas num período (ranking + dia que mais se falta). */
  @Get('faltas/analitica')
  analiticaFaltas(
    @Query() periodo: PeriodoAusenciasDto,
  ): Promise<AnaliticaFaltas> {
    return this.service.analiticaFaltas(
      new Date(periodo.inicio),
      new Date(periodo.fim),
    );
  }

  /** Analítica de "não retorno do intervalo" (mesma inteligência das faltas). */
  @Get('nao-retornos/analitica')
  analiticaNaoRetornos(
    @Query() periodo: PeriodoAusenciasDto,
  ): Promise<AnaliticaFaltas> {
    return this.service.analiticaNaoRetornos(
      new Date(periodo.inicio),
      new Date(periodo.fim),
    );
  }

  /** Lista os operadores (turno fixo). Fonte: Cadastro Unificado de Colaboradores. */
  @Get('turnos')
  listar(): Promise<OperadorTurno[]> {
    return this.service.listar();
  }
}
