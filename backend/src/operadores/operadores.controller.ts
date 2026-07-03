import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Ausencia } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  ContagemTurnoDto,
  PeriodoAusenciasDto,
  RegistrarAusenciaDto,
} from './dto/operadores.dto';
import { ContagemTurno, ItemRelatorioAusencia } from './operadores.domain';
import { OperadoresService } from './operadores.service';

/** Hoje (ISO yyyy-mm-dd) no fuso de Brasília. */
function hojeBrasiliaISO(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const g = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Perfis autorizados a programar ausência futura. */
const PERFIS_AUTORIZA_FUTURO = [
  'GERENTE',
  'GERENTE_DESENVOLVEDOR',
  'SUPERVISOR',
];

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

  /**
   * Registra uma ausência de uma pessoa numa data (Req 6.2.1–6.2.3). Marcar
   * uma ausência **futura** (programada) exige perfil gerente ou supervisor;
   * ausências de hoje/passado (registro de falta) são liberadas a quem lança
   * ausências.
   */
  @Post('ausencias')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async registrarAusencia(
    @Body() dto: RegistrarAusenciaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Ausencia> {
    const dataISO = dto.data.slice(0, 10);
    const ehFutura = dataISO > hojeBrasiliaISO();
    if (
      ehFutura &&
      !PERFIS_AUTORIZA_FUTURO.includes(usuario?.perfil as string)
    ) {
      throw new ForbiddenException(
        'Apenas gerente ou supervisor pode programar uma ausência futura.',
      );
    }
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
