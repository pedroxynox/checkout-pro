import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegistroImportacao } from '@prisma/client';
import { ArquivoUpload } from '../common/arquivo-upload';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  HistoricoImportacoesDto,
  StatusDiaDto,
  UploadImportacaoDto,
} from './dto/importacoes.dto';
import { TipoArquivo } from './importacoes.domain';
import { parseCsv, parseXlsx } from './importacoes.parser';
import { ImportacoesService, ResultadoImportacao } from './importacoes.service';

/**
 * Controller do Modulo_Importacoes (Req 1.1–1.4). Expõe o upload e parsing dos
 * arquivos diários (CSV/XLSX), validação de colunas, vinculação por nome,
 * status do dia, pendentes e histórico. As importações pertencem ao conjunto
 * operacional liberado ao fiscal (`@Funcionalidade('IMPORTACOES')`).
 */
@Controller('importacoes')
@Funcionalidade('IMPORTACOES')
export class ImportacoesController {
  constructor(private readonly importacoesService: ImportacoesService) {}

  /**
   * Recebe um arquivo (CSV/XLSX) de um dos quatro tipos, valida as colunas
   * obrigatórias (Req 1.1.6) e importa as linhas, vinculando por nome e
   * registrando os não reconhecidos (Req 1.1.7, 1.1.8).
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @Query() dto: UploadImportacaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoImportacao> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }

    const { cabecalho, linhas } = this.parsearArquivo(arquivo);

    // Lança ColunaAusenteError (-> 400) quando faltar coluna obrigatória.
    this.importacoesService.validarColunas(dto.tipo, cabecalho);

    const dataReferencia = dto.dataReferencia
      ? new Date(dto.dataReferencia)
      : this.dataReferenciaPadrao(linhas);

    return this.importacoesService.importar(
      dto.tipo,
      linhas,
      usuario?.sub ?? null,
      dataReferencia,
    );
  }

  /** Status ("importado"/"pendente") de cada tipo no dia (Req 1.2). */
  @Get('status')
  async statusDoDia(
    @Query() dto: StatusDiaDto,
  ): Promise<Record<TipoArquivo, 'importado' | 'pendente'>> {
    return this.importacoesService.statusDoDia(new Date(dto.data));
  }

  /** Tipos de arquivo ainda pendentes no dia (Req 1.4.1). */
  @Get('pendentes')
  async pendentes(@Query() dto: StatusDiaDto): Promise<TipoArquivo[]> {
    return this.importacoesService.verificarPendentesFimDoDia(
      new Date(dto.data),
    );
  }

  /** Histórico de importações, opcionalmente filtrado por intervalo (Req 1.3). */
  @Get('historico')
  async historico(
    @Query() dto: HistoricoImportacoesDto,
  ): Promise<RegistroImportacao[]> {
    const intervalo =
      dto.inicio && dto.fim
        ? { inicio: new Date(dto.inicio), fim: new Date(dto.fim) }
        : undefined;
    return this.importacoesService.historico(intervalo);
  }

  /** Faz o parsing do arquivo conforme a extensão/tipo MIME (CSV ou XLSX). */
  private parsearArquivo(arquivo: ArquivoUpload): {
    cabecalho: string[];
    linhas: ReturnType<typeof parseCsv>['linhas'];
  } {
    const nome = arquivo.originalname.toLowerCase();
    const ehXlsx =
      nome.endsWith('.xlsx') ||
      nome.endsWith('.xls') ||
      arquivo.mimetype.includes('spreadsheet') ||
      arquivo.mimetype.includes('excel');
    if (ehXlsx) {
      return parseXlsx(arquivo.buffer);
    }
    return parseCsv(arquivo.buffer.toString('utf-8'));
  }

  /** Data de referência padrão: a data da primeira linha, ou hoje. */
  private dataReferenciaPadrao(
    linhas: ReturnType<typeof parseCsv>['linhas'],
  ): Date {
    const primeira = linhas.find((l) => !Number.isNaN(l.data.getTime()));
    return primeira ? primeira.data : new Date();
  }
}
