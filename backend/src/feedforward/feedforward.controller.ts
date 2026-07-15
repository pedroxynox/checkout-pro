import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArquivoUpload } from '../common/arquivo-upload';
import { opcoesUploadImagem } from '../common/upload-options';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { OBJECT_STORAGE, ObjectStorage } from '../storage/object-storage';
import {
  FeedforwardService,
  PontoFeedforwardView,
  RodadaFeedforward,
} from './feedforward.service';
import { CriarFeedforwardDto, RevisarPontoDto } from './dto/feedforward.dto';

/**
 * Controller do Feedforward (acompanhamento de desenvolvimento no perfil do
 * colaborador). A visualização exige `FEEDFORWARD_VISUALIZAR` e a gestão
 * (criar rodada, enviar foto, revisar ponto, remover) exige `FEEDFORWARD_GERIR`
 * — ambos liberados a supervisores e gerentes.
 */
@Controller('feedforward')
export class FeedforwardController {
  constructor(
    private readonly service: FeedforwardService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Histórico de rodadas de um colaborador. */
  @Get('colaborador/:colaboradorId')
  @Funcionalidade('FEEDFORWARD_VISUALIZAR')
  listarDoColaborador(
    @Param('colaboradorId') colaboradorId: string,
  ): Promise<RodadaFeedforward[]> {
    return this.service.listarDoColaborador(colaboradorId);
  }

  /** Cria uma rodada de feedforward (com os pontos a melhorar). */
  @Post()
  @Funcionalidade('FEEDFORWARD_GERIR')
  criar(
    @Body() dto: CriarFeedforwardDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RodadaFeedforward> {
    return this.service.criar(dto, {
      id: usuario?.sub,
      nome: usuario?.nome ?? usuario?.login,
    });
  }

  /**
   * Envia a foto do formulário preenchido à mão (grava no object storage e
   * guarda a URL na rodada). Valida que o arquivo é uma imagem.
   */
  @Post(':id/foto')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('FEEDFORWARD_GERIR')
  @UseInterceptors(FileInterceptor('file', opcoesUploadImagem))
  async enviarFoto(
    @Param('id') id: string,
    @UploadedFile() arquivo: ArquivoUpload | undefined,
  ): Promise<RodadaFeedforward> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }
    if (!(arquivo.mimetype ?? '').startsWith('image/')) {
      throw new BadRequestException('O arquivo enviado não é uma imagem.');
    }
    const salvo = await this.storage.salvar({
      conteudo: arquivo.buffer,
      nomeOriginal: arquivo.originalname,
      mimeType: arquivo.mimetype,
      prefixo: 'feedforward',
    });
    return this.service.definirFoto(id, salvo.url);
  }

  /** Revisa um ponto (atingido / não atingido). */
  @Patch('ponto/:pontoId/revisar')
  @Funcionalidade('FEEDFORWARD_GERIR')
  revisarPonto(
    @Param('pontoId') pontoId: string,
    @Body() dto: RevisarPontoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PontoFeedforwardView> {
    return this.service.revisarPonto(
      pontoId,
      dto.status,
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
      dto.observacao,
    );
  }

  /** Remove uma rodada de feedforward (e seus pontos). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Funcionalidade('FEEDFORWARD_GERIR')
  async remover(@Param('id') id: string): Promise<void> {
    await this.service.remover(id);
  }
}
