import { BadRequestException } from '@nestjs/common';
import { ArquivoUpload } from '../common/arquivo-upload';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { ImportacoesController } from './importacoes.controller';
import { validarColunas } from './importacoes.domain';
import { ColunaAusenteError } from './importacoes.errors';
import { ImportacoesService, ResultadoImportacao } from './importacoes.service';

/**
 * Testes de exemplo do `ImportacoesController` (Tarefa 13.2): upload e parsing
 * de CSV com validação de colunas (Req 1.1.6). Usa um serviço falso cuja
 * validação delega à função pura de domínio.
 */
describe('ImportacoesController', () => {
  const usuario: UsuarioAutenticado = {
    sub: 'u1',
    login: 'gerente',
    perfil: 'GERENTE',
  };

  function criarController(): {
    controller: ImportacoesController;
    importarMock: jest.Mock;
  } {
    const importarMock = jest.fn(
      (tipo, linhas): Promise<ResultadoImportacao> =>
        Promise.resolve({
          registroImportacaoId: 'imp1',
          tipo,
          dataReferencia: new Date('2024-03-10T00:00:00Z'),
          totalVinculados: linhas.length,
          nomesNaoReconhecidos: [],
        }),
    );
    const serviceFake = {
      validarColunas: (tipo: never, cabecalho: string[]) => {
        const r = validarColunas(tipo, cabecalho);
        if (!r.valido) {
          throw new ColunaAusenteError(r.colunasAusentes);
        }
      },
      importar: importarMock,
    } as unknown as ImportacoesService;
    return {
      controller: new ImportacoesController(serviceFake),
      importarMock,
    };
  }

  function arquivoCsv(conteudo: string): ArquivoUpload {
    return {
      fieldname: 'file',
      originalname: 'cancelamentos.csv',
      mimetype: 'text/csv',
      size: conteudo.length,
      buffer: Buffer.from(conteudo, 'utf-8'),
    };
  }

  it('importa com sucesso um CSV com as colunas obrigatórias', async () => {
    const { controller, importarMock } = criarController();
    const csv = 'data,nome,valor\n2024-03-10,Ana,10.50\n2024-03-10,Bruno,5\n';

    const resultado = await controller.upload(
      arquivoCsv(csv),
      { tipo: 'CANCELAMENTO_ITENS' },
      usuario,
    );

    expect(resultado.totalVinculados).toBe(2);
    expect(importarMock).toHaveBeenCalledTimes(1);
    const [tipo, linhas, usuarioId] = importarMock.mock.calls[0];
    expect(tipo).toBe('CANCELAMENTO_ITENS');
    expect(linhas).toHaveLength(2);
    expect(usuarioId).toBe('u1');
  });

  it('rejeita CSV sem a coluna obrigatória "valor" (ColunaAusenteError)', async () => {
    const { controller } = criarController();
    const csv = 'data,nome\n2024-03-10,Ana\n';

    await expect(
      controller.upload(arquivoCsv(csv), { tipo: 'TROCO_SOLIDARIO' }, usuario),
    ).rejects.toBeInstanceOf(ColunaAusenteError);
  });

  it('rejeita requisição sem arquivo', async () => {
    const { controller } = criarController();
    await expect(
      controller.upload(undefined, { tipo: 'DEVOLUCOES' }, usuario),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
