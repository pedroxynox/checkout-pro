import { BadRequestException } from '@nestjs/common';
import { ArquivoUpload } from '../common/arquivo-upload';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { ObjectStorage } from '../storage/object-storage';
import { ChecklistController } from './checklist.controller';
import { ArquivoNaoImagemError } from './checklist.errors';
import { ChecklistService } from './checklist.service';

/**
 * Testes de exemplo do `ChecklistController` (Tarefa 13.2): upload de imagem
 * (Req 5.1.2–5.1.4). Verifica o caminho de sucesso (imagem armazenada e
 * checklist "FEITO") e a rejeição de arquivo não-imagem.
 */
describe('ChecklistController', () => {
  const usuario: UsuarioAutenticado = {
    sub: 'u1',
    login: 'fiscal',
    perfil: 'FISCAL',
  };

  function criar(): {
    controller: ChecklistController;
    enviarMock: jest.Mock;
    salvarMock: jest.Mock;
  } {
    const enviarMock = jest.fn(() =>
      Promise.resolve({ status: 'FEITO' } as never),
    );
    const serviceFake = {
      enviarImagem: enviarMock,
    } as unknown as ChecklistService;

    const salvarMock = jest.fn(() =>
      Promise.resolve({
        chave: 'checklists/x.jpg',
        url: '/arquivos/checklists/x.jpg',
      }),
    );
    const storageFake = { salvar: salvarMock } as unknown as ObjectStorage;

    return {
      controller: new ChecklistController(serviceFake, storageFake),
      enviarMock,
      salvarMock,
    };
  }

  function arquivo(mimetype: string, nome: string): ArquivoUpload {
    return {
      fieldname: 'file',
      originalname: nome,
      mimetype,
      size: 3,
      buffer: Buffer.from('img'),
    };
  }

  it('armazena a imagem e marca o checklist como FEITO', async () => {
    const { controller, enviarMock, salvarMock } = criar();

    await controller.enviarImagem(
      { tipo: 'ABERTURA' },
      { data: '2024-03-10' },
      arquivo('image/jpeg', 'foto.jpg'),
      usuario,
    );

    expect(salvarMock).toHaveBeenCalledTimes(1);
    expect(enviarMock).toHaveBeenCalledTimes(1);
    const argArquivo = enviarMock.mock.calls[0][2];
    expect(argArquivo.url).toBe('/arquivos/checklists/x.jpg');
  });

  it('rejeita arquivo não-imagem sem armazenar (ArquivoNaoImagemError)', async () => {
    const { controller, enviarMock, salvarMock } = criar();

    await expect(
      controller.enviarImagem(
        { tipo: 'FECHAMENTO' },
        {},
        arquivo('application/pdf', 'relatorio.pdf'),
        usuario,
      ),
    ).rejects.toBeInstanceOf(ArquivoNaoImagemError);
    expect(salvarMock).not.toHaveBeenCalled();
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('rejeita requisição sem arquivo', async () => {
    const { controller } = criar();
    await expect(
      controller.enviarImagem({ tipo: 'ABERTURA' }, {}, undefined, usuario),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
