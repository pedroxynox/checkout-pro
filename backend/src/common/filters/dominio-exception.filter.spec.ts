import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import {
  CredenciaisInvalidasError,
  PermissaoInsuficienteError,
} from '../../acessos/acessos.errors';
import { ArquivoNaoImagemError } from '../../checklist/checklist.errors';
import {
  CheckInAtivoError,
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
  NomeDuplicadoError,
} from '../../operadores/operadores.errors';
import { DominioExceptionFilter } from './dominio-exception.filter';

/**
 * Testes de exemplo do filtro de exceções de domínio (Tarefa 13.2). Verificam
 * o mapeamento de cada erro de domínio para o status HTTP correto e que a
 * mensagem em Português é preservada no corpo da resposta — cobrindo os erros
 * de todos os módulos.
 */
describe('DominioExceptionFilter', () => {
  const filter = new DominioExceptionFilter();

  interface RespostaCapturada {
    statusCode?: number;
    body?: { statusCode: number; mensagem: unknown };
  }

  function capturar(exception: unknown): RespostaCapturada {
    const capturado: RespostaCapturada = {};
    const response = {
      status(code: number) {
        capturado.statusCode = code;
        return {
          json(body: { statusCode: number; mensagem: unknown }) {
            capturado.body = body;
          },
        };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/teste' }),
      }),
    } as unknown as ArgumentsHost;

    filter.catch(exception, host);
    return capturado;
  }

  it.each([
    [
      'Acessos: credenciais inválidas (401)',
      new CredenciaisInvalidasError(),
      HttpStatus.UNAUTHORIZED,
    ],
    [
      'Acessos: permissão insuficiente (403)',
      new PermissaoInsuficienteError(),
      HttpStatus.FORBIDDEN,
    ],
    [
      'Operadores: nome duplicado (409)',
      new NomeDuplicadoError('Ana'),
      HttpStatus.CONFLICT,
    ],
    [
      'Operadores: ausência duplicada (409)',
      new AusenciaDuplicadaError(),
      HttpStatus.CONFLICT,
    ],
    [
      'Fiscais: check-in ativo (409)',
      new CheckInAtivoError('f1'),
      HttpStatus.CONFLICT,
    ],
    [
      'Fiscais: status inválido (400)',
      new StatusInvalidoError('X'),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Importações: coluna ausente (400)',
      new ColunaAusenteError(['valor']),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Indicadores: venda inválida (400)',
      new ValorVendaInvalidoError(-1),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Lote APAE: saldo inválido (400)',
      new SaldoInvalidoError(10, 5),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Lote APAE: quantidade inicial inválida (400)',
      new QuantidadeInicialInvalidaError(-1),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Insumos: fardo não reconhecido (404)',
      new FardoNaoReconhecidoError('123'),
      HttpStatus.NOT_FOUND,
    ],
    [
      'Insumos: quantidade inválida (400)',
      new QuantidadeInvalidaError(0),
      HttpStatus.BAD_REQUEST,
    ],
    [
      'Checklist: arquivo não-imagem (400)',
      new ArquivoNaoImagemError('application/pdf'),
      HttpStatus.BAD_REQUEST,
    ],
  ])('mapeia %s', (_descricao, erro, statusEsperado) => {
    const resultado = capturar(erro);
    expect(resultado.statusCode).toBe(statusEsperado);
    expect(resultado.body?.statusCode).toBe(statusEsperado);
    expect(typeof resultado.body?.mensagem).toBe('string');
    expect((resultado.body?.mensagem as string).length).toBeGreaterThan(0);
  });

  it('preserva mensagem específica do erro de domínio', () => {
    const resultado = capturar(new NomeDuplicadoError('Ana'));
    expect(resultado.body?.mensagem).toContain('Ana');
  });

  it('repassa exceções HTTP nativas do Nest preservando status', () => {
    const resultado = capturar(new NotFoundException('Lote não encontrado.'));
    expect(resultado.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(resultado.body?.mensagem).toBe('Lote não encontrado.');
  });

  it('mapeia erro desconhecido para 500 sem vazar detalhes', () => {
    const resultado = capturar(new Error('detalhe interno sensível'));
    expect(resultado.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(resultado.body?.mensagem).toBe('Erro interno do servidor.');
  });
});
