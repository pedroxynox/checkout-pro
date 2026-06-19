import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Ausencia, Operador } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  CadastrarOperadorDto,
  ContagemTurnoDto,
  PeriodoAusenciasDto,
  RegistrarAusenciaDto,
} from './dto/operadores.dto';
import { ContagemTurno, ItemRelatorioAusencia } from './operadores.domain';
import { OperadoresService } from './operadores.service';

/**
 * Controller do Modulo_Operadores (Req 6.1, 6.2, 6.3, 6.6). A gestão de
 * operadores e ausências é uma funcionalidade administrativa, restrita ao
 * gerente (`@Funcionalidade('OPERADORES_CRUD')` — não pertence ao conjunto
 * liberado ao fiscal).
 */
@Controller('operadores')
@Funcionalidade('OPERADORES_CRUD')
export class OperadoresController {
  constructor(private readonly operadoresService: OperadoresService) {}

  /** Cadastra um operador por nome (Req 6.1.1–6.1.3). */
  @Post()
  async cadastrar(@Body() dto: CadastrarOperadorDto): Promise<Operador> {
    return this.operadoresService.cadastrar(dto.nome);
  }

  /** Lista os operadores cadastrados (Req 6.1.5). Liberado a quem lança ausências. */
  @Get()
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async listar(): Promise<Operador[]> {
    return this.operadoresService.listar();
  }

  /** Edita o nome de um operador (Req 6.1.4). */
  @Patch(':id')
  async editarNome(
    @Param('id') id: string,
    @Body() dto: CadastrarOperadorDto,
  ): Promise<Operador> {
    return this.operadoresService.editarNome(id, dto.nome);
  }

  /** Registra uma ausência de uma pessoa numa data (Req 6.2.1–6.2.3). */
  @Post('ausencias')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async registrarAusencia(
    @Body() dto: RegistrarAusenciaDto,
  ): Promise<Ausencia> {
    return this.operadoresService.registrarAusencia(
      dto.pessoaId,
      new Date(dto.data),
    );
  }

  /** Remove uma ausência registrada (Req 6.2.4). */
  @Delete('ausencias/:id')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerAusencia(@Param('id') id: string): Promise<void> {
    await this.operadoresService.removerAusencia(id);
  }

  /** Relatório de ausências por pessoa, filtrado e ordenado (Req 6.3). */
  @Get('ausencias/relatorio')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async relatorioAusencias(
    @Query() periodo: PeriodoAusenciasDto,
  ): Promise<ItemRelatorioAusencia[]> {
    return this.operadoresService.relatorioAusencias({
      inicio: new Date(periodo.inicio),
      fim: new Date(periodo.fim),
    });
  }

  /** Contagem de operadores por turno no dia/escala informado (Req 6.6). */
  @Post('contagem-turno')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  @HttpCode(HttpStatus.OK)
  contagemPorTurno(@Body() dto: ContagemTurnoDto): ContagemTurno {
    return this.operadoresService.contagemPorTurno(
      dto.operadores.map((o) => ({
        operadorId: o.operadorId,
        entrada: o.entrada ?? null,
        folga: o.folga,
        ferias: o.ferias,
        desligado: o.desligado,
      })),
    );
  }
}
