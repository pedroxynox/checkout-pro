import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CheckoutReporte } from '@prisma/client';
import { ArquivoUpload } from '../common/arquivo-upload';
import { opcoesUploadImagem } from '../common/upload-options';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { OBJECT_STORAGE, ObjectStorage } from '../storage/object-storage';
import { ehImagem, extensaoImagemSegura } from '../checklist/checklist.domain';
import { CheckoutsService, TableroCheckouts } from './checkouts.service';
import { CriarReporteDto, DefinirQuantidadeDto } from './dto/checkouts.dto';

/**
 * Controller da seção Check-Outs. Reportar/ver exige `CHECKOUTS` (todo fiscal);
 * resolver exige `CHECKOUTS_GERENCIAR` (supervisão/gerência); alterar a
 * quantidade de caixas exige `OPERADORES_CRUD` (Centro de Controle —
 * gerente/administrador).
 *
 * As rotas estáticas (`config`, `reportes`) são declaradas antes de `:numero`
 * para não colidirem com o parâmetro.
 */
@Controller('checkouts')
export class CheckoutsController {
  constructor(
    private readonly service: CheckoutsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Tablero: quantidade de caixas + avarias abertas por caixa. */
  @Get()
  @Funcionalidade('CHECKOUTS')
  tablero(): Promise<TableroCheckouts> {
    return this.service.tablero();
  }

  /** Quantidade de check-outs configurada. */
  @Get('config')
  @Funcionalidade('CHECKOUTS')
  async config(): Promise<{ quantidade: number }> {
    return { quantidade: await this.service.obterQuantidade() };
  }

  /** Define a quantidade de check-outs (Centro de Controle — gerente/admin). */
  @Put('config')
  @Funcionalidade('OPERADORES_CRUD')
  async definirConfig(
    @Body() dto: DefinirQuantidadeDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ quantidade: number }> {
    const quantidade = await this.service.definirQuantidade(
      dto.quantidade,
      usuario?.login,
    );
    return { quantidade };
  }

  /** Lista reportes por status (`?status=ABERTO`), mais recentes primeiro. */
  @Get('reportes')
  @Funcionalidade('CHECKOUTS')
  listarReportes(@Query('status') status?: string): Promise<CheckoutReporte[]> {
    return this.service.listarReportes(status);
  }

  /** Marca um reporte como resolvido (gestão). */
  @Post('reportes/:id/resolver')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('CHECKOUTS_GERENCIAR')
  resolver(
    @Param('id') id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CheckoutReporte> {
    return this.service.resolver(id, usuario);
  }

  /** Reportes de um check-out específico (abertos primeiro). */
  @Get(':numero')
  @Funcionalidade('CHECKOUTS')
  reportesDoCheckout(
    @Param('numero', ParseIntPipe) numero: number,
  ): Promise<CheckoutReporte[]> {
    return this.service.reportesDoCheckout(numero);
  }

  /**
   * Registra uma avaria num check-out. Aceita uma foto OPCIONAL no campo
   * `file` (multipart) — se enviada, é validada como imagem e guardada.
   */
  @Post(':numero/reportes')
  @Funcionalidade('CHECKOUTS')
  @UseInterceptors(FileInterceptor('file', opcoesUploadImagem))
  async criarReporte(
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dto: CriarReporteDto,
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<CheckoutReporte> {
    let fotoUrl: string | null = null;
    if (arquivo) {
      const ref = { mimeType: arquivo.mimetype, nome: arquivo.originalname };
      if (!ehImagem(ref)) {
        throw new BadRequestException('O arquivo enviado não é uma imagem.');
      }
      const salvo = await this.storage.salvar({
        conteudo: arquivo.buffer,
        nomeOriginal: `avaria.${extensaoImagemSegura(ref)}`,
        mimeType: arquivo.mimetype,
        prefixo: 'checkouts',
      });
      fotoUrl = salvo.url;
    }

    return this.service.criarReporte(
      {
        checkoutNumero: numero,
        equipamento: dto.equipamento,
        descricao: dto.descricao,
        fotoUrl,
      },
      usuario,
    );
  }
}
