import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  CredenciaisInvalidasError,
  PermissaoInsuficienteError,
} from '../../acessos/acessos.errors';
import { ArquivoNaoImagemError } from '../../checklist/checklist.errors';
import {
  FiscalNaoEncontradoError,
  FaltaRegistradaError,
  FiscalDeFolgaError,
  JaIniciouJornadaError,
  StatusInvalidoError,
} from '../../fiscais/fiscais.errors';
import { ColunaAusenteError } from '../../importacoes/importacoes.errors';
import { ValorVendaInvalidoError } from '../../indicadores/indicadores.errors';
import {
  FardoNaoReconhecidoError,
  QuantidadeInvalidaError,
} from '../../insumos/insumos.errors';
import {
  QuantidadeInicialInvalidaError,
  SaldoInvalidoError,
} from '../../lote-apae/lote-apae.errors';
import {
  AusenciaDuplicadaError,
  HorarioInvalidoError,
  NomeDuplicadoError,
} from '../../operadores/operadores.errors';
import {
  ColaboradorNaoEncontradoError,
  LoginColaboradorDuplicadoError,
  MatriculaColaboradorDuplicadaError,
} from '../../colaboradores/colaboradores.errors';
import {
  MatriculaDuplicadaError,
  OperacaoInvalidaError,
  UsuarioNaoEncontradoError,
} from '../../usuarios/usuarios.errors';

/** Constrói uma entrada do mapa erro de domínio -> status HTTP. */
type ConstrutorErro = new (...args: never[]) => Error;

/**
 * Mapeamento dos erros de domínio para o status HTTP apropriado. As mensagens
 * exibidas ao cliente vêm do próprio erro (já redigidas em Português).
 */
const MAPA_STATUS: ReadonlyArray<readonly [ConstrutorErro, HttpStatus]> = [
  // 401 — credenciais inválidas (autenticação).
  [CredenciaisInvalidasError, HttpStatus.UNAUTHORIZED],
  // 403 — permissão insuficiente (autorização por perfil).
  [PermissaoInsuficienteError, HttpStatus.FORBIDDEN],
  // 404 — recurso (fardo) não reconhecido pelo código de barras.
  [FardoNaoReconhecidoError, HttpStatus.NOT_FOUND],
  [UsuarioNaoEncontradoError, HttpStatus.NOT_FOUND],
  [FiscalNaoEncontradoError, HttpStatus.NOT_FOUND],
  [ColaboradorNaoEncontradoError, HttpStatus.NOT_FOUND],
  // 409 — conflitos de unicidade / estado.
  [NomeDuplicadoError, HttpStatus.CONFLICT],
  [MatriculaDuplicadaError, HttpStatus.CONFLICT],
  [MatriculaColaboradorDuplicadaError, HttpStatus.CONFLICT],
  [LoginColaboradorDuplicadoError, HttpStatus.CONFLICT],
  [AusenciaDuplicadaError, HttpStatus.CONFLICT],
  [JaIniciouJornadaError, HttpStatus.CONFLICT],
  [FaltaRegistradaError, HttpStatus.CONFLICT],
  [FiscalDeFolgaError, HttpStatus.CONFLICT],
  // 400 — entradas inválidas / regras de validação de domínio.
  [OperacaoInvalidaError, HttpStatus.BAD_REQUEST],
  [ColunaAusenteError, HttpStatus.BAD_REQUEST],
  [ValorVendaInvalidoError, HttpStatus.BAD_REQUEST],
  [SaldoInvalidoError, HttpStatus.BAD_REQUEST],
  [QuantidadeInicialInvalidaError, HttpStatus.BAD_REQUEST],
  [QuantidadeInvalidaError, HttpStatus.BAD_REQUEST],
  [ArquivoNaoImagemError, HttpStatus.BAD_REQUEST],
  [StatusInvalidoError, HttpStatus.BAD_REQUEST],
  [HorarioInvalidoError, HttpStatus.BAD_REQUEST],
];

/**
 * Filtro global de exceções (Tarefa 13). Traduz os erros de domínio tipados
 * (puros, lançados pelos serviços) em respostas HTTP com o status adequado e
 * mensagem em Português. Exceções HTTP do Nest (ex.: `NotFoundException`,
 * `UnauthorizedException`, erros de validação de DTO) são repassadas como
 * estão. Qualquer outro erro vira 500 sem vazar detalhes internos.
 */
@Catch()
export class DominioExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DominioExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ url?: string }>();

    // Exceções HTTP nativas do Nest: preserva status e corpo.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(this.corpo(status, exception.getResponse()));
      return;
    }

    // Erros de domínio conhecidos: mapeia para o status configurado.
    if (exception instanceof Error) {
      for (const [Construtor, status] of MAPA_STATUS) {
        if (exception instanceof Construtor) {
          response.status(status).json(this.corpo(status, exception.message));
          return;
        }
      }
    }

    // Desconhecido: 500 sem vazar detalhes.
    this.logger.error(
      `Erro não tratado em ${request?.url ?? 'rota desconhecida'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.corpo(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Erro interno do servidor.',
        ),
      );
  }

  /** Normaliza o corpo da resposta de erro. */
  private corpo(
    status: number,
    detalhe: unknown,
  ): { statusCode: number; mensagem: unknown } {
    // `getResponse()` do Nest pode ser string ou objeto { message, ... }.
    if (detalhe && typeof detalhe === 'object' && 'message' in detalhe) {
      return {
        statusCode: status,
        mensagem: (detalhe as { message: unknown }).message,
      };
    }
    return { statusCode: status, mensagem: detalhe };
  }
}
