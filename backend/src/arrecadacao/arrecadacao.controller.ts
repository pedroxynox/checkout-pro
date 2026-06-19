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
import { ArquivoUpload } from '../common/arquivo-upload';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  RankingArrecadacaoDto,
  ResumoArrecadacaoDto,
  UploadArrecadacaoDto,
} from './dto/arrecadacao.dto';
import { parseArrecadacao } from './arrecadacao.parser';
import {
  ArrecadacaoService,
  DetalheArrecadacao,
  ItemRankingArrecadacao,
  ResultadoUploadArrecadacao,
  ResumoArrecadacao,
} from './arrecadacao.service';

/**
 * Controller da arrecadação por operador (indicadores). Visualização liberada
 * a quem vê indicadores; o upload do arquivo exige a funcionalidade de
 * importações (fiscal do fechamento).
 */
@Controller('arrecadacao')
@Funcionalidade('INDICADORES_VISUALIZAR')
export class ArrecadacaoController {
  constructor(private readonly arrecadacaoService: ArrecadacaoService) {}

  /** Recebe o arquivo .txt de um tipo e importa as linhas do dia. */
  @Post('upload')
  @Funcionalidade('IMPORTACOES')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @Query() dto: UploadArrecadacaoDto,
  ): Promise<ResultadoUploadArrecadacao> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }
    const conteudo = arquivo.buffer.toString('utf-8');
    const linhas = parseArrecadacao(conteudo);
    const data = dto.data ? new Date(dto.data) : new Date();
    return this.arrecadacaoService.importar(dto.tipo, data, linhas);
  }

  /** Totais do dia/semana/mês de um tipo na data informada. */
  @Get('resumo')
  resumo(@Query() dto: ResumoArrecadacaoDto): Promise<ResumoArrecadacao> {
    return this.arrecadacaoService.resumo(dto.tipo, new Date(dto.data));
  }

  /** Ranking de operadores por valor no intervalo informado. */
  @Get('ranking')
  ranking(
    @Query() dto: RankingArrecadacaoDto,
  ): Promise<ItemRankingArrecadacao[]> {
    return this.arrecadacaoService.ranking(
      dto.tipo,
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }

  /** Detalhe de cada lançamento (operador, autorização, motivo, valor). */
  @Get('detalhes')
  detalhes(
    @Query() dto: RankingArrecadacaoDto,
  ): Promise<DetalheArrecadacao[]> {
    return this.arrecadacaoService.detalhes(
      dto.tipo,
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }
}
