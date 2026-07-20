import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArquivoUpload } from '../common/arquivo-upload';
import { opcoesUploadTexto } from '../common/upload-options';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { parseProdutosPesados } from './produtos-pesados.parser';
import {
  ProdutoPesadoView,
  ProdutosPesadosService,
  ResultadoImportacaoProdutos,
  StatusCatalogoProdutos,
} from './produtos-pesados.service';

/**
 * Controller do catálogo de PRODUTOS PESADOS (balança).
 *
 * A CONSULTA (listar/status) é liberada a todos os perfis (funcionalidade
 * `PRODUTOS_PESADOS`) — a intenção é que qualquer pessoa do time descubra o
 * código de balança de um produto. A CARGA do arquivo é restrita à gestão
 * (`PRODUTOS_PESADOS_GERENCIAR`) ou ao usuário de importação (`IMPORTACOES`).
 */
@Controller('produtos-pesados')
@Funcionalidade('PRODUTOS_PESADOS')
export class ProdutosPesadosController {
  constructor(private readonly service: ProdutosPesadosService) {}

  /** Catálogo completo (o app baixa uma vez e busca em memória). */
  @Get()
  listar(): Promise<ProdutoPesadoView[]> {
    return this.service.listar();
  }

  /** Total, última atualização e contagem por setor. */
  @Get('status')
  status(): Promise<StatusCatalogoProdutos> {
    return this.service.status();
  }

  /** Recebe o arquivo .txt (todos os setores) e substitui o catálogo inteiro. */
  @Post('upload')
  @Funcionalidade('PRODUTOS_PESADOS_GERENCIAR', 'IMPORTACOES')
  @UseInterceptors(FileInterceptor('file', opcoesUploadTexto))
  async upload(
    @UploadedFile() arquivo: ArquivoUpload | undefined,
  ): Promise<ResultadoImportacaoProdutos> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado no campo "file".');
    }
    const conteudo = arquivo.buffer.toString('utf-8');
    const linhas = parseProdutosPesados(conteudo);
    if (linhas.length === 0) {
      throw new BadRequestException(
        'Não foi possível ler produtos do arquivo. Verifique o formato ' +
          '(colunas separadas por tabulação: nome, código, setor).',
      );
    }
    return this.service.importar(linhas);
  }
}
