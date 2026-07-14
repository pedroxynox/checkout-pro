import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArquivoUpload } from '../common/arquivo-upload';
import { opcoesUploadTexto } from '../common/upload-options';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import {
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  ConfigVendasDto,
  DataVendasDto,
  DefinirEstimativasDto,
  IntervaloVendasDto,
  ListarEstimativasDto,
  PainelVendasDto,
  UploadVendasDto,
} from './dto/vendas.dto';
import { parseVendasHora } from './vendas.parser';
import {
  ConfigVendasResultado,
  EstimativasMes,
  PainelVendas,
  ResultadoUploadVendas,
  ResumoVendas,
  VendasPorHora,
  VendasService,
} from './vendas.service';

/**
 * Controller de Vendas por hora (Painel de Vendas). O envio do arquivo é
 * liberado a quem pode editar o painel (todos os perfis); a visualização, a
 * quem pode ver o painel. Não há ajuste manual — só pelo arquivo .txt.
 */
@Controller('vendas')
@Funcionalidade('PAINEL_VENDAS_VISUALIZAR')
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  /** Recebe o arquivo .txt de vendas por hora e importa o dia. */
  @Post('upload')
  @Funcionalidade('IMPORTACOES')
  @UseInterceptors(FileInterceptor('file', opcoesUploadTexto))
  async upload(
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @Query() dto: UploadVendasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoUploadVendas> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }
    const data = dto.data ? new Date(dto.data) : new Date();
    // Após enviado, só quem carrega os arquivos (importador) ou o gerente pode
    // reenviar as vendas do dia.
    const jaEnviado = (await this.vendasService.status(data)).enviado;
    const podeReenviar =
      usuario?.perfil === 'GERENTE' ||
      usuario?.perfil === 'GERENTE_DESENVOLVEDOR' ||
      usuario?.perfil === 'IMPORTADOR';
    if (jaEnviado && !podeReenviar) {
      throw new ForbiddenException(
        'As vendas deste dia já foram enviadas. Apenas o gerente pode reenviar.',
      );
    }
    const conteudo = arquivo.buffer.toString('utf-8');
    const linhas = parseVendasHora(conteudo);
    if (linhas.length === 0) {
      throw new BadRequestException(
        'Não foi possível ler vendas por hora do arquivo. Verifique o formato.',
      );
    }
    return this.vendasService.importar(data, linhas);
  }

  /** Totais do dia/semana/mês para a data informada. */
  @Get('resumo')
  resumo(@Query() dto: DataVendasDto): Promise<ResumoVendas> {
    return this.vendasService.resumo(new Date(dto.data));
  }

  /** Distribuição por hora + total no intervalo [início, fim]. */
  @Get('por-hora')
  porHora(@Query() dto: IntervaloVendasDto): Promise<VendasPorHora> {
    return this.vendasService.porHora(new Date(dto.inicio), new Date(dto.fim));
  }

  /** Status (enviado/pendente) das vendas no dia. */
  @Get('status')
  @Funcionalidade('FECHAMENTO', 'IMPORTACOES', 'CARGA_STATUS_VISUALIZAR')
  status(@Query() dto: DataVendasDto): Promise<{ enviado: boolean }> {
    return this.vendasService.status(new Date(dto.data));
  }

  /**
   * Painel inteligente: meta e projeção de fechamento, comparativos por data,
   * tendência, curva horária típica, heatmap, padrão por dia da semana e
   * recomendação de lotação por hora.
   */
  @Get('painel')
  painel(@Query() dto: PainelVendasDto): Promise<PainelVendas> {
    return this.vendasService.painel(
      dto.data ? new Date(dto.data) : new Date(),
    );
  }

  /** Configuração do painel (meta mensal). Visível a quem vê o painel. */
  @Get('config')
  config(): Promise<ConfigVendasResultado> {
    return this.vendasService.obterConfig();
  }

  /** Estimativas de venda por dia de um mês (+ total do mês). */
  @Get('estimativas')
  listarEstimativas(
    @Query() dto: ListarEstimativasDto,
  ): Promise<EstimativasMes> {
    return this.vendasService.listarEstimativas(dto.anoMes);
  }

  /** Define as estimativas de venda por dia de um mês (Central de Vendas). */
  @Put('estimativas')
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  definirEstimativas(
    @Body() dto: DefinirEstimativasDto,
  ): Promise<EstimativasMes> {
    return this.vendasService.definirEstimativas(dto.anoMes, dto.dias);
  }

  /** Atualiza a meta mensal de faturamento. */
  @Put('config')
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  definirConfig(
    @Body() dto: ConfigVendasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConfigVendasResultado> {
    return this.vendasService.definirConfig(dto, usuario?.sub);
  }

  /**
   * Manutenção (gerente): remove totais diários sem detalhe por hora
   * (lançamentos manuais/antigos), mantendo só os dias enviados por arquivo.
   */
  @Post('limpar-sem-hora')
  @Funcionalidade('USUARIOS_CRUD')
  limparSemHora(): Promise<{ removidos: number }> {
    return this.vendasService.limparSemDetalheHora();
  }
}
