import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  JustificarAusenciaDto,
  PeriodoAusenciasDto,
  RegistrarAusenciaDto,
  RegistrarAusenciaPeriodoDto,
  RemoverAusenciaPeriodoDto,
} from './dto/operadores.dto';
import { ContagemTurno, ItemRelatorioAusencia } from './operadores.domain';
import {
  AusenciaDetalhada,
  OperadoresService,
  ResultadoAusenciaPeriodo,
} from './operadores.service';

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
  'ADMINISTRADOR',
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
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /**
   * Ausência a prazo: ausenta um colaborador por um período, criando faltas
   * justificadas em cada dia da escala (folga é ignorada). Programar um período
   * que termina no futuro exige perfil gerente ou supervisor.
   */
  @Post('ausencias/periodo')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async registrarAusenciaPeriodo(
    @Body() dto: RegistrarAusenciaPeriodoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoAusenciaPeriodo> {
    const fimISO = dto.fim.slice(0, 10);
    const ehFutura = fimISO > hojeBrasiliaISO();
    if (
      ehFutura &&
      !PERFIS_AUTORIZA_FUTURO.includes(usuario?.perfil as string)
    ) {
      throw new ForbiddenException(
        'Apenas gerente ou supervisor pode programar uma ausência futura.',
      );
    }
    return this.operadoresService.registrarAusenciaPeriodo(
      dto.pessoaId,
      new Date(dto.inicio),
      new Date(dto.fim),
      { motivo: dto.motivo, observacao: dto.observacao },
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /**
   * Anula (desmarca) uma ausência a prazo inteira: remove os dias `aPrazo` da
   * pessoa no intervalo. Operação inversa do registro do período — restrita a
   * gerente/supervisor/administrador (mesmos perfis que programam o período).
   *
   * Declarada ANTES de `ausencias/:id` para a rota estática ter precedência
   * sobre o parâmetro.
   */
  @Delete('ausencias/periodo')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  @HttpCode(HttpStatus.OK)
  async removerAusenciaPeriodo(
    @Query() dto: RemoverAusenciaPeriodoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ removidas: number }> {
    if (!PERFIS_AUTORIZA_FUTURO.includes(usuario?.perfil as string)) {
      throw new ForbiddenException(
        'Apenas gerente ou supervisor pode cancelar uma ausência a prazo.',
      );
    }
    return this.operadoresService.removerAusenciaPeriodo(
      dto.pessoaId,
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }

  /**
   * Remove (exclui) uma falta registrada — usado para **rejeitar uma falta
   * lançada por engano** (ex.: escala desatualizada que marcou falta indevida),
   * para que não pese no colaborador. Diferente de "justificar/abonar" (que
   * mantém a falta com peso reduzido): aqui a ocorrência é apagada de vez.
   *
   * Restrito a gerente/supervisor/administrador (mesmos perfis que programam
   * ausências futuras) — o fiscal não exclui faltas.
   *
   * Obs.: se a falta era **automática** e o colaborador continua escalado no dia
   * sem bater ponto, a detecção pode remarcá-la; por isso a escala do dia deve
   * estar corrigida antes (ex.: marcar a folga) para a exclusão ser definitiva.
   */
  @Delete('ausencias/:id')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerAusencia(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    if (!PERFIS_AUTORIZA_FUTURO.includes(usuario?.perfil as string)) {
      throw new ForbiddenException(
        'Apenas gerente, supervisor ou administrador pode excluir uma falta.',
      );
    }
    await this.operadoresService.removerAusencia(id, usuario?.perfil as string);
  }

  /**
   * Justifica/reabre/injustifica uma falta DEPOIS do registro (abono). Liberado
   * a quem lança faltas — inclui o fiscal (`OPERADORES_AUSENCIAS`). Grava quem
   * justificou e quando (auditoria visível a toda a equipe).
   */
  @Patch('ausencias/:id/justificativa')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async justificarAusencia(
    @Param('id') id: string,
    @Body() dto: JustificarAusenciaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Ausencia> {
    return this.operadoresService.justificarAusencia(
      id,
      { status: dto.status, motivo: dto.motivo, observacao: dto.observacao },
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /**
   * Lista as faltas de um período com nome + justificativa (estado, motivo,
   * quem justificou). `?pendentes=true` traz só as pendentes de análise.
   * Alimenta o painel de justificativas (transparência para toda a equipe).
   */
  @Get('ausencias')
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async listarAusencias(
    @Query() periodo: PeriodoAusenciasDto,
    @Query('pendentes') pendentes?: string,
  ): Promise<AusenciaDetalhada[]> {
    return this.operadoresService.listarAusencias(
      { inicio: new Date(periodo.inicio), fim: new Date(periodo.fim) },
      pendentes === 'true',
    );
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
