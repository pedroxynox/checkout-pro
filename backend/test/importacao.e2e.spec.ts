/**
 * Testes de integração ponta a ponta da importação (Tarefa 20.1).
 *
 * Exercita o fluxo real do `ImportacoesController` para os quatro tipos de
 * arquivo: upload de CSV/XLSX → parsing (papaparse/xlsx) → vinculação por nome
 * → persistência (Prisma falso em memória). Verifica, com 1–3 exemplos por
 * tipo, que as linhas de operadores/fiscais cadastrados são vinculadas e que
 * nomes desconhecidos vão para a fila de não reconhecidos (Req 1.1.1–1.1.8).
 */
import * as XLSX from 'xlsx';
import { ArquivoUpload } from '../src/common/arquivo-upload';
import { UsuarioAutenticado } from '../src/common/decorators/usuario-atual.decorator';
import { ImportacoesController } from '../src/importacoes/importacoes.controller';
import { TipoArquivo } from '../src/importacoes/importacoes.domain';
import { ImportacoesService } from '../src/importacoes/importacoes.service';
import { criarFakePrisma, FakePrisma } from './helpers/fake-prisma';

const gerente: UsuarioAutenticado = {
  sub: 'u-gerente',
  login: 'gerente',
  perfil: 'GERENTE',
};

function arquivoCsv(nome: string, conteudo: string): ArquivoUpload {
  return {
    fieldname: 'file',
    originalname: nome,
    mimetype: 'text/csv',
    size: conteudo.length,
    buffer: Buffer.from(conteudo, 'utf-8'),
  };
}

function arquivoXlsx(
  nome: string,
  linhas: Array<Record<string, string | number>>,
): ArquivoUpload {
  const sheet = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Plan1');
  const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return {
    fieldname: 'file',
    originalname: nome,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

function montar(): {
  controller: ImportacoesController;
  fake: FakePrisma;
} {
  const { fake, prisma } = criarFakePrisma();
  fake.operadores = [
    { id: 'op-ana', nome: 'Ana Souza' },
    { id: 'op-bruno', nome: 'Bruno Lima' },
    { id: 'op-carla', nome: 'Carla Dias' },
  ];
  fake.fiscaisPessoa = [{ id: 'fi-davi', nome: 'Davi Rocha' }];
  const service = new ImportacoesService(prisma);
  return { controller: new ImportacoesController(service), fake };
}

describe('Importação ponta a ponta (Tarefa 20.1)', () => {
  it('CANCELAMENTO_ITENS: importa CSV vinculando operadores cadastrados', async () => {
    const { controller, fake } = montar();
    const csv =
      'data,nome,valor\n' +
      '2024-03-10,Ana Souza,12.50\n' +
      '2024-03-10,Bruno Lima,7\n';

    const resultado = await controller.upload(
      arquivoCsv('cancelamentos.csv', csv),
      { tipo: 'CANCELAMENTO_ITENS' as TipoArquivo },
      gerente,
    );

    expect(resultado.totalVinculados).toBe(2);
    expect(resultado.nomesNaoReconhecidos).toEqual([]);
    // Persistência: um RegistroImportacao com dois registros operacionais.
    expect(fake.registrosImportacao).toHaveLength(1);
    expect(fake.registrosImportacao[0].tipo).toBe('CANCELAMENTO');
    expect(fake.registrosImportacao[0].registros).toHaveLength(2);
  });

  it('TROCO_SOLIDARIO: vincula conhecidos e separa nomes não reconhecidos', async () => {
    const { controller, fake } = montar();
    const csv =
      'data,nome,valor\n' +
      '2024-03-11,Ana Souza,3.00\n' +
      '2024-03-11,Pessoa Desconhecida,9.90\n';

    const resultado = await controller.upload(
      arquivoCsv('troco.csv', csv),
      { tipo: 'TROCO_SOLIDARIO' as TipoArquivo },
      gerente,
    );

    expect(resultado.totalVinculados).toBe(1);
    expect(resultado.nomesNaoReconhecidos).toEqual(['Pessoa Desconhecida']);
    expect(fake.registrosImportacao[0].tipo).toBe('TROCO');
    expect(fake.registrosImportacao[0].nomesNaoReconhecidos).toEqual([
      'Pessoa Desconhecida',
    ]);
  });

  it('RECARGAS_CELULAR: vinculação por nome é tolerante a acento/caixa', async () => {
    const { controller } = montar();
    // "ana souza" (minúsculas, sem acento) deve casar com "Ana Souza".
    const csv =
      'DATA,NOME,VALOR\n' +
      '2024-03-12,ana souza,20\n' +
      '2024-03-12,CARLA DIAS,15\n';

    const resultado = await controller.upload(
      arquivoCsv('recargas.csv', csv),
      { tipo: 'RECARGAS_CELULAR' as TipoArquivo },
      gerente,
    );

    expect(resultado.totalVinculados).toBe(2);
    expect(resultado.nomesNaoReconhecidos).toEqual([]);
  });

  it('DEVOLUCOES: importa XLSX vinculando o fiscal cadastrado', async () => {
    const { controller, fake } = montar();
    const arquivo = arquivoXlsx('devolucoes.xlsx', [
      { data: '2024-03-13', nome: 'Davi Rocha', valor: 42.3 },
      { data: '2024-03-13', nome: 'Fiscal Fantasma', valor: 5 },
    ]);

    const resultado = await controller.upload(
      arquivo,
      { tipo: 'DEVOLUCOES' as TipoArquivo },
      gerente,
    );

    expect(resultado.totalVinculados).toBe(1);
    expect(resultado.nomesNaoReconhecidos).toEqual(['Fiscal Fantasma']);
    expect(fake.registrosImportacao[0].tipo).toBe('DEVOLUCAO');
    expect(fake.registrosImportacao[0].registros[0]).toMatchObject({
      fiscalId: 'fi-davi',
    });
  });

  it('rejeita arquivo sem coluna obrigatória (ColunaAusenteError)', async () => {
    const { controller } = montar();
    const csv = 'data,nome\n2024-03-10,Ana Souza\n';

    await expect(
      controller.upload(
        arquivoCsv('sem-valor.csv', csv),
        { tipo: 'CANCELAMENTO_ITENS' as TipoArquivo },
        gerente,
      ),
    ).rejects.toMatchObject({ name: 'ColunaAusenteError' });
  });

  it('status do dia e histórico refletem as importações persistidas', async () => {
    const { controller } = montar();
    await controller.upload(
      arquivoCsv('c.csv', 'data,nome,valor\n2024-03-10,Ana Souza,1\n'),
      { tipo: 'CANCELAMENTO_ITENS' as TipoArquivo },
      gerente,
    );

    const status = await controller.statusDoDia({ data: '2024-03-10' });
    expect(status.CANCELAMENTO_ITENS).toBe('importado');
    expect(status.DEVOLUCOES).toBe('pendente');

    const pendentes = await controller.pendentes({ data: '2024-03-10' });
    expect(pendentes).toContain('DEVOLUCOES');
    expect(pendentes).not.toContain('CANCELAMENTO_ITENS');

    const historico = await controller.historico({});
    expect(historico).toHaveLength(1);
  });
});
