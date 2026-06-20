import {
  BadRequestException,
  Controller,
  ForbiddenException,
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
  UsuarioAtual,
  UsuarioAutenticado,
} from '../common/decorators/usuario-atual.decorator';
import {
  DataVendasDto,
  IntervaloVendasDto,
  UploadVendasDto,
} from './dto/vendas.dto';
import { parseVendasHora } from './vendas.parser';
import {
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
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() arquivo: ArquivoUpload | undefined,
    @Query() dto: UploadVendasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ResultadoUploadVendas> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }
    const data = dto.data ? new Date(dto.data) : new Date();
    // Após enviado, só o gerente pode reenviar as vendas do dia.
    const jaEnviado = (await this.vendasService.status(data)).enviado;
    const ehGerente =
      usuario?.perfil === 'GERENTE' ||
      usuario?.perfil === 'GERENTE_DESENVOLVEDOR';
    if (jaEnviado && !ehGerente) {
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
  @Funcionalidade('PAINEL_VENDAS_EDITAR')
  status(@Query() dto: DataVendasDto): Promise<{ enviado: boolean }> {
    return this.vendasService.status(new Date(dto.data));
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
