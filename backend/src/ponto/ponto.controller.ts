import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  EditarBatidaDto,
  LerPapelitoDto,
  RegistrarBatidaDto,
} from './dto/ponto.dto';
import { JornadaDiaResposta, PessoaPonto, PontoService } from './ponto.service';
import { PontoOcrService, RespostaLeituraPapelito } from './ponto-ocr.service';

/**
 * API do Registro de Ponto (leitor de papelito) — Fase A.
 *
 * Registrar/editar/remover batidas exige `PONTO_REGISTRAR` (o fiscal pode
 * fazer isso para qualquer colaborador). Ver o painel exige `PONTO_VISUALIZAR`.
 */
@Controller('ponto')
export class PontoController {
  constructor(
    private readonly service: PontoService,
    private readonly ocr: PontoOcrService,
  ) {}

  /**
   * Lê o papelito (Fase B): recebe o texto já lido (ML Kit no Android) OU a
   * imagem (OCR no nosso servidor, para a web) e devolve nome/data/hora e os
   * colaboradores sugeridos, para o usuário confirmar antes de gravar.
   */
  @Post('ocr')
  @Funcionalidade('PONTO_REGISTRAR')
  lerPapelito(@Body() dto: LerPapelitoDto): Promise<RespostaLeituraPapelito> {
    return this.ocr.lerPapelito(dto);
  }

  /** Busca pessoas (fiscais) por nome para escolher de quem é o papelito. */
  @Get('pessoas')
  @Funcionalidade('PONTO_REGISTRAR')
  buscarPessoas(@Query('busca') busca?: string): Promise<PessoaPonto[]> {
    return this.service.buscarPessoas(busca);
  }

  /** Batidas + jornada calculada de um dia. */
  @Get('dia')
  @Funcionalidade('PONTO_VISUALIZAR')
  jornadaDoDia(
    @Query('pessoaId') pessoaId: string,
    @Query('tipoPessoa') tipoPessoa?: string,
    @Query('data') data?: string,
  ): Promise<JornadaDiaResposta> {
    return this.service.jornadaDoDia(
      pessoaId,
      tipoPessoa ?? 'FISCAL',
      data ? new Date(data) : new Date(),
    );
  }

  /** Registra uma batida (hora do papelito) para um colaborador. */
  @Post('batidas')
  @Funcionalidade('PONTO_REGISTRAR')
  registrarBatida(
    @Body() dto: RegistrarBatidaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<JornadaDiaResposta> {
    return this.service.registrarBatida(dto, usuario);
  }

  /** Corrige uma batida (hora e/ou tipo). */
  @Patch('batidas/:id')
  @Funcionalidade('PONTO_REGISTRAR')
  editarBatida(
    @Param('id') id: string,
    @Body() dto: EditarBatidaDto,
  ): Promise<JornadaDiaResposta> {
    return this.service.editarBatida(id, dto);
  }

  /** Remove uma batida e reclassifica o dia. */
  @Delete('batidas/:id')
  @Funcionalidade('PONTO_REGISTRAR')
  removerBatida(@Param('id') id: string): Promise<JornadaDiaResposta> {
    return this.service.removerBatida(id);
  }
}
