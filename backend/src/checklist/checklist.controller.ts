import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Checklist } from '@prisma/client';
import { ArquivoUpload } from '../common/arquivo-upload';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { OBJECT_STORAGE, ObjectStorage } from '../storage/object-storage';
import { ArquivoNaoImagemError } from './checklist.errors';
import { JanelaExecucao, StatusChecklist, ehImagem } from './checklist.domain';
import { ChecklistService } from './checklist.service';
import { ChecklistDataDto, TipoChecklistParamDto } from './dto/checklist.dto';

/**
 * Controller do Modulo_Checklist (Req 5.1–5.3): disponibiliza o checklist
 * diário, recebe o upload da imagem (armazenada via object storage), expõe o
 * status, as janelas fixas e a regra de alerta. Liberado ao fiscal
 * (`@Funcionalidade('CHECKLIST')`).
 */
@Controller('checklist')
@Funcionalidade('CHECKLIST')
export class ChecklistController {
  constructor(
    private readonly checklistService: ChecklistService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Disponibiliza (cria se ausente) o checklist do dia (Req 5.1.1). */
  @Post(':tipo')
  async garantir(
    @Param() params: TipoChecklistParamDto,
    @Body() dto: ChecklistDataDto,
  ): Promise<Checklist> {
    return this.checklistService.garantirChecklistDoDia(
      params.tipo,
      dto.data ? new Date(dto.data) : new Date(),
    );
  }

  /**
   * Envia a imagem do checklist (Req 5.1.2–5.1.4): valida que é imagem, grava
   * no object storage e marca o checklist como "FEITO". Arquivo não-imagem
   * resulta em 400 (filtro de erros).
   */
  @Post(':tipo/imagem')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async enviarImagem(
    @Param() params: TipoChecklistParamDto,
    @Query() dto: ChecklistDataDto,
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<Checklist> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }

    const ref = { mimeType: arquivo.mimetype, nome: arquivo.originalname };
    // Valida antes de gravar para não persistir arquivos inválidos.
    if (!ehImagem(ref)) {
      throw new ArquivoNaoImagemError(arquivo.mimetype ?? arquivo.originalname);
    }

    const data = dto.data ? new Date(dto.data) : new Date();
    const salvo = await this.storage.salvar({
      conteudo: arquivo.buffer,
      nomeOriginal: arquivo.originalname,
      mimeType: arquivo.mimetype,
      prefixo: 'checklists',
    });

    return this.checklistService.enviarImagem(
      params.tipo,
      data,
      { ...ref, url: salvo.url },
      usuario?.sub ?? 'desconhecido',
    );
  }

  /** Status atual do checklist do dia (Req 5.1.5). */
  @Get(':tipo/status')
  async status(
    @Param() params: TipoChecklistParamDto,
    @Query() dto: ChecklistDataDto,
  ): Promise<{ status: StatusChecklist }> {
    const status = await this.checklistService.status(
      params.tipo,
      dto.data ? new Date(dto.data) : new Date(),
    );
    return { status };
  }

  /** Janela fixa de execução do checklist (Req 5.2). */
  @Get(':tipo/janela')
  janela(@Param() params: TipoChecklistParamDto): JanelaExecucao {
    return this.checklistService.janela(params.tipo);
  }
}
