/**
 * Testes de integração ponta a ponta do upload de imagem de checklist
 * (Tarefa 20.2).
 *
 * Exercita o fluxo real do `ChecklistController.enviarImagem` com o
 * `ChecklistService` real, o armazenamento de objetos real em disco
 * (`LocalDiskStorage`, gravando em um diretório temporário) e o Prisma falso em
 * memória. Verifica que a imagem é efetivamente persistida no object storage e
 * que o checklist é marcado como "FEITO" (Req 5.1.2, 5.1.3). Também verifica a
 * rejeição de arquivo não-imagem sem armazenamento (Req 5.1.4).
 */
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { ArquivoUpload } from '../src/common/arquivo-upload';
import { UsuarioAutenticado } from '../src/common/decorators/usuario-atual.decorator';
import { ChecklistController } from '../src/checklist/checklist.controller';
import { ArquivoNaoImagemError } from '../src/checklist/checklist.errors';
import { ChecklistService } from '../src/checklist/checklist.service';
import { LocalDiskStorage } from '../src/storage/local-disk-storage';
import { criarFakePrisma, FakePrisma } from './helpers/fake-prisma';

const fiscal: UsuarioAutenticado = {
  sub: 'u-fiscal',
  login: 'fiscal',
  perfil: 'FISCAL',
};

function arquivo(
  mimetype: string,
  nome: string,
  conteudo: string,
): ArquivoUpload {
  return {
    fieldname: 'file',
    originalname: nome,
    mimetype,
    size: conteudo.length,
    buffer: Buffer.from(conteudo),
  };
}

describe('Upload de imagem de checklist ponta a ponta (Tarefa 20.2)', () => {
  let dirArmazenamento: string;
  let controller: ChecklistController;
  let storage: LocalDiskStorage;
  let fake: FakePrisma;

  beforeEach(async () => {
    dirArmazenamento = await fs.mkdtemp(path.join(tmpdir(), 'stok-checklist-'));
    const config = {
      get: (chave: string) =>
        chave === 'STORAGE_DIR'
          ? dirArmazenamento
          : chave === 'STORAGE_PUBLIC_URL'
            ? '/arquivos'
            : undefined,
    } as unknown as ConfigService;
    storage = new LocalDiskStorage(config);

    const criado = criarFakePrisma();
    fake = criado.fake;
    const service = new ChecklistService(criado.prisma);
    controller = new ChecklistController(service, storage);
  });

  afterEach(async () => {
    await fs.rm(dirArmazenamento, { recursive: true, force: true });
  });

  it('armazena a imagem no object storage e marca o checklist como FEITO', async () => {
    const resultado = await controller.enviarImagem(
      { tipo: 'ABERTURA' },
      { data: '2024-03-10' },
      arquivo('image/jpeg', 'abertura.jpg', 'conteudo-jpeg'),
      fiscal,
    );

    expect(resultado.status).toBe('FEITO');
    expect(resultado.enviadoPor).toBe('u-fiscal');
    expect(resultado.imagemUrl).toMatch(/^\/arquivos\/checklists\//);

    // O arquivo foi efetivamente gravado no diretório de armazenamento.
    const chaveRelativa = resultado.imagemUrl!.replace('/arquivos/', '');
    const caminhoDisco = path.join(dirArmazenamento, chaveRelativa);
    expect(existsSync(caminhoDisco)).toBe(true);
    expect((await fs.readFile(caminhoDisco)).toString()).toBe('conteudo-jpeg');

    // O status consultado posteriormente também é FEITO (persistido).
    const status = await controller.status(
      { tipo: 'ABERTURA' },
      { data: '2024-03-10' },
    );
    expect(status.status).toBe('FEITO');
  });

  it('rejeita arquivo não-imagem e não grava nada no storage', async () => {
    await expect(
      controller.enviarImagem(
        { tipo: 'FECHAMENTO' },
        { data: '2024-03-10' },
        arquivo('application/pdf', 'relatorio.pdf', 'pdf'),
        fiscal,
      ),
    ).rejects.toBeInstanceOf(ArquivoNaoImagemError);

    // Nenhum checklist marcado e nenhum arquivo gravado.
    expect(fake.checklists.size).toBe(0);
    const conteudoDir = await fs.readdir(dirArmazenamento);
    expect(conteudoDir).toHaveLength(0);
  });
});
