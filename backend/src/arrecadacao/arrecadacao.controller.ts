import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArquivoUpload } from '../common/arquivo-upload';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  PeriodoArrecadacaoDto,
  RankingArrecadacaoDto,
  ResumoArrecadacaoDto,
  SemMovimentoArrecadacaoDto,
  StatusArrecadacaoDto,
  UploadArrecadacaoDto,
} from './dto/arrecadacao.dto';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import { parseArrecadacao } from './arrecadacao.parser';
import {
  ArrecadacaoService,
  DetalheArrecadacao,
  ItemNaoReconhecido,
  ItemRankingArrecadacao,
  ResultadoUploadArrecadacao,
  ResumoArrecadacao,
  ResumoNaoReconhecido,
  StatusArrecadacao,
} from './arrecadacao.service';
import {
  Comparativo,
  IndicadoresInteligenteService,
  PontoTendencia,
  ProjecaoMes,
} from './indicadores-inteligente.service';
import { TipoArrecadacao } from './arrecadacao.domain';

/**
 * Controller da arrecadação por operador (indicadores). Visualização liberada
 * a quem vê indicadores; o upload do arquivo exige a funcionalidade de
 * importações (fiscal do fechamento).
 */
@Controller('arrecadacao')
@Funcionalidade('INDICADORES_VISUALIZAR')
export class ArrecadacaoController {
  constructor(
    private readonly arrecadacaoService: ArrecadacaoService,
    private readonly inteligente: IndicadoresInteligenteService,
  ) {}

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

  /** Status (enviado / sem movimento / pendente) de cada tipo no dia. */
  @Get('status')
  @Funcionalidade('FECHAMENTO', 'IMPORTACOES')
  status(@Query() dto: StatusArrecadacaoDto): Promise<StatusArrecadacao> {
    return this.arrecadacaoService.status(new Date(dto.data));
  }

  /** Marca um tipo como "sem movimento" no dia (carga — perfil IMPORTADOR). */
  @Post('sem-movimento')
  @Funcionalidade('IMPORTACOES')
  async marcarSemMovimento(
    @Body() dto: SemMovimentoArrecadacaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ fechamentoConcluido: boolean }> {
    return this.arrecadacaoService.marcarSemMovimento(
      dto.tipo,
      new Date(dto.data),
      usuario?.sub,
    );
  }

  /** Remove a marca de "sem movimento" (correção — perfil IMPORTADOR). */
  @Delete('sem-movimento')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Funcionalidade('IMPORTACOES')
  async removerSemMovimento(
    @Query() dto: SemMovimentoArrecadacaoDto,
  ): Promise<void> {
    await this.arrecadacaoService.removerSemMovimento(
      dto.tipo,
      new Date(dto.data),
    );
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
  detalhes(@Query() dto: RankingArrecadacaoDto): Promise<DetalheArrecadacao[]> {
    return this.arrecadacaoService.detalhes(
      dto.tipo,
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }

  /**
   * Agregado dos lançamentos não reconhecidos de um tipo no período (total +
   * nº de lançamentos), para a linha "Não reconhecidos" do indicador.
   */
  @Get('nao-reconhecidos/resumo')
  naoReconhecidosResumo(
    @Query() dto: RankingArrecadacaoDto,
  ): Promise<ResumoNaoReconhecido> {
    return this.arrecadacaoService.naoReconhecidos(
      dto.tipo,
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }

  /** Fila de não reconhecidos no período (códigos soltos para associar/criar). */
  @Get('nao-reconhecidos')
  @Funcionalidade('OPERADORES_CRUD')
  listarNaoReconhecidos(
    @Query() dto: PeriodoArrecadacaoDto,
  ): Promise<ItemNaoReconhecido[]> {
    return this.arrecadacaoService.listarNaoReconhecidos(
      new Date(dto.inicio),
      new Date(dto.fim),
    );
  }

  // ===== Inteligência de indicadores =====

  /** Lista as metas configuradas (com fallback aos defaults). */
  @Get('metas')
  metas() {
    return this.arrecadacaoService.listarMetas();
  }

  /** Define (cria/atualiza) a meta de um indicador — apenas gestor. */
  @Post('metas')
  @HttpCode(HttpStatus.OK)
  @Funcionalidade('ADMIN_DADOS')
  definirMeta(
    @Body() dto: { tipo: TipoArrecadacao; meta: number },
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<{ tipo: TipoArrecadacao; meta: number }> {
    return this.arrecadacaoService.definirMeta(dto.tipo, dto.meta, usuario?.sub);
  }

  /** Série temporal (tendência) dos últimos N dias de um indicador. */
  @Get('tendencia')
  tendencia(
    @Query('tipo') tipo: TipoArrecadacao,
    @Query('data') data: string,
    @Query('dias') dias?: string,
  ): Promise<PontoTendencia[]> {
    return this.inteligente.tendencia(
      tipo,
      new Date(data),
      dias ? Number(dias) : 30,
    );
  }

  /** Comparativo do mês/semana atual vs o período anterior. */
  @Get('comparativo')
  comparativo(
    @Query('tipo') tipo: TipoArrecadacao,
    @Query('data') data: string,
  ): Promise<{ mes: Comparativo; semana: Comparativo }> {
    return this.inteligente.comparativo(tipo, new Date(data));
  }

  /** Projeção de fechamento de mês + meta diária derivada. */
  @Get('projecao')
  projecao(
    @Query('tipo') tipo: TipoArrecadacao,
    @Query('data') data: string,
  ): Promise<ProjecaoMes> {
    return this.inteligente.projecaoMes(tipo, new Date(data));
  }

  /** Destaques do mês (Top 3: troco, recargas, cancelamento de itens). */
  @Get('destaques-mes')
  destaquesMes(@Query('data') data: string) {
    return this.inteligente.destaquesMes(new Date(data));
  }

  /** Operadores com cancelamentos/devoluções muito acima da média (mês). */
  @Get('anomalias')
  anomalias(@Query('data') data: string) {
    return this.inteligente.anomalias(new Date(data));
  }

  /** Painel "Precisa de atenção" completo (metas em risco + operadores). */
  @Get('painel-atencao')
  painelAtencao(@Query('data') data: string) {
    return this.inteligente.painelAtencao(new Date(data));
  }
}
