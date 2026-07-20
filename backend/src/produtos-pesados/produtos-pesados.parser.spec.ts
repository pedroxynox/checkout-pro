import {
  normalizarTexto,
  parseProdutosPesados,
} from './produtos-pesados.parser';

describe('normalizarTexto', () => {
  it('remove acentos e passa para minúsculas', () => {
    expect(normalizarTexto('AÇOUGUE')).toBe('acougue');
    expect(normalizarTexto('  Pão Francês ')).toBe('pao frances');
  });
});

describe('parseProdutosPesados', () => {
  const cabecalho =
    'SEQPRODUTO\tDESCCOMPLETA\tCODACESSO\tCATEGORIA_NV2\tCATEGORIA_NV3';
  const linhas = [
    '77136\tMORTADELA LEBON KG S/CUBO TOUC\t9045\tP.A.S.\tFIAMBRERIA FORA REFRIG',
    '77137\tMORTADELA LEBON KG C/CUBO TOUC\t9046\tP.A.S.\tFIAMBRERIA FORA REFRIG',
    '78807\tCARNE BOV BEST KG PEIXINHO PALET RESF\t9192\tACOUGUE\tBOVINO RESFRIADO',
  ];

  it('lê as colunas corretas com cabeçalho (separador tab)', () => {
    const r = parseProdutosPesados([cabecalho, ...linhas].join('\n'));
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({
      codigo: '9045',
      nome: 'MORTADELA LEBON KG S/CUBO TOUC',
      categoria: 'P.A.S.',
      tipo: 'FIAMBRERIA FORA REFRIG',
    });
    expect(r[2].codigo).toBe('9192');
    expect(r[2].categoria).toBe('ACOUGUE');
  });

  it('funciona sem cabeçalho (usa as posições padrão)', () => {
    const r = parseProdutosPesados(linhas.join('\n'));
    expect(r).toHaveLength(3);
    expect(r[1].codigo).toBe('9046');
  });

  it('normaliza o setor para maiúsculas e trata o tipo ausente como nulo', () => {
    // Layout do ERP (SEQPRODUTO, DESCCOMPLETA, CODACESSO, CATEGORIA_NV2) sem a
    // 5ª coluna (tipo) e sem cabeçalho.
    const r = parseProdutosPesados('55\tBOLO CENOURA\t7000\tpadaria');
    expect(r).toHaveLength(1);
    expect(r[0].codigo).toBe('7000');
    expect(r[0].categoria).toBe('PADARIA');
    expect(r[0].tipo).toBeNull();
  });

  it('ignora linhas em branco e linhas sem código ou nome', () => {
    const conteudo = [
      cabecalho,
      linhas[0],
      '',
      '   ',
      '99999\t\t\tACOUGUE\tX', // sem nome nem código
    ].join('\n');
    const r = parseProdutosPesados(conteudo);
    expect(r).toHaveLength(1);
  });

  it('devolve lista vazia para conteúdo vazio', () => {
    expect(parseProdutosPesados('')).toEqual([]);
    expect(parseProdutosPesados('\n\n')).toEqual([]);
  });

  it('aceita ponto e vírgula como separador alternativo', () => {
    const r = parseProdutosPesados(
      'SEQPRODUTO;DESCCOMPLETA;CODACESSO;CATEGORIA_NV2;CATEGORIA_NV3\n' +
        '1;QUEIJO MINAS KG;1234;P.A.S.;LATICINIOS',
    );
    expect(r[0].codigo).toBe('1234');
    expect(r[0].nome).toBe('QUEIJO MINAS KG');
  });
});
