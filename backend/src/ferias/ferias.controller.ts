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
import { FeriasColaborador } from '@prisma/client';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { ListarFeriasDto, RegistrarFeriasDto } from './dto/ferias.dto';
import { FeriasDetalhada, FeriasService } from './ferias.service';

/**
 * API do módulo de Férias (inativação NÃO rígida).
 *
 * Registrar/remover são operações de gestão de escala (`OPERADORES_CRUD`, como
 * inativar/reativar um colaborador); a listagem é liberada a quem já vê a
 * escala/quadro (`OPERADORES_AUSENCIAS`).
 */
@Controller('ferias')
export class FeriasController {
  constructor(private readonly ferias: FeriasService) {}

  /** Cadastra um período de férias para um colaborador (gestão). */
  @Post()
  @Funcionalidade('OPERADORES_CRUD')
  async registrar(
    @Body() dto: RegistrarFeriasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<FeriasColaborador> {
    return this.ferias.registrarFerias(
      dto.colaboradorId,
      new Date(dto.inicio),
      new Date(dto.fim),
      { observacao: dto.observacao },
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
    );
  }

  /**
   * Lista as férias (todas ou de um colaborador), com o nome e a marca de
   * vigência na data de referência (hoje por padrão). Liberado a quem vê a
   * escala.
   */
  @Get()
  @Funcionalidade('OPERADORES_AUSENCIAS')
  async listar(@Query() q: ListarFeriasDto): Promise<FeriasDetalhada[]> {
    return this.ferias.listarFerias({
      colaboradorId: q.colaboradorId,
      referencia: q.referencia ? new Date(q.referencia) : undefined,
    });
  }

  /** Remove (cancela) um período de férias (gestão). */
  @Delete(':id')
  @Funcionalidade('OPERADORES_CRUD')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id') id: string): Promise<void> {
    await this.ferias.removerFerias(id);
  }
}
