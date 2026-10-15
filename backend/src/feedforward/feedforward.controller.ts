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
import {
  CriarFeedforwardDto,
  EditarFeedforwardDto,
  EditarPontoDto,
  PontoFeedforwardDto,
  ProrrogarPontoDto,
  RevisarPontoDto,
} from './dto/feedforward.dto';

/**
 * Controller do Feedforward (acompanhamento de desenvolvimento no perfil do
 * colaborador). A visualização exige `FEEDFORWARD_VISUALIZAR` e a gestão
 * (criar/editar rodada, enviar foto, adicionar/editar/prorrogar/revisar/remover
 * ponto, remover rodada) exige `FEEDFORWARD_GERIR`
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

  /** Edita os dados de uma rodada (data, textos e nota). */
  @Patch(':id')
  @Funcionalidade('FEEDFORWARD_GERIR')
  editar(
    @Param('id') id: string,
    @Body() dto: EditarFeedforwardDto,
  ): Promise<RodadaFeedforward> {
    return this.service.editar(id, dto);
  }

  /** Adiciona um ponto a melhorar (com prazo) a uma rodada existente. */
  @Post(':id/pontos')
  @Funcionalidade('FEEDFORWARD_GERIR')
  adicionarPonto(
    @Param('id') id: string,
    @Body() dto: PontoFeedforwardDto,
  ): Promise<PontoFeedforwardView> {
    return this.service.adicionarPonto(id, dto);
  }

  /** Edita a descrição de um ponto pendente. */
  @Patch('ponto/:pontoId')
  @Funcionalidade('FEEDFORWARD_GERIR')
  editarPonto(
    @Param('pontoId') pontoId: string,
    @Body() dto: EditarPontoDto,
  ): Promise<PontoFeedforwardView> {
    return this.service.editarPonto(pontoId, dto.descricao);
  }

  /** Prorroga o prazo de um ponto pendente (com auditoria). */
  @Patch('ponto/:pontoId/prorrogar')
  @Funcionalidade('FEEDFORWARD_GERIR')
  prorrogarPonto(
    @Param('pontoId') pontoId: string,
    @Body() dto: ProrrogarPontoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<PontoFeedforwardView> {
    return this.service.prorrogarPonto(
      pontoId,
      dto.prazo,
      { id: usuario?.sub, nome: usuario?.nome ?? usuario?.login },
      dto.motivo,
    );
  }

  /** Remove um ponto pendente. */
  @Delete('ponto/:pontoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Funcionalidade('FEEDFORWARD_GERIR')
  async removerPonto(@Param('pontoId') pontoId: string): Promise<void> {
    await this.service.removerPonto(pontoId);
  }

  /** Remove uma rodada de feedforward (e seus pontos). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Funcionalidade('FEEDFORWARD_GERIR')
  async remover(@Param('id') id: string): Promise<void> {
    await this.service.remover(id);
  }
}
