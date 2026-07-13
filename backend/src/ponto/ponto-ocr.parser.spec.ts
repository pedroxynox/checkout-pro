import {
  extrairData,
  extrairHora,
  extrairNome,
  interpretarComprovante,
} from './ponto-ocr.parser';

const COMPROVANTE = [
  'COMPROVANTE DE REGISTRO ELETRONICO DE PONTO',
  'SUPERMERCADO EXEMPLO LTDA',
  'CNPJ 12.345.678/0001-90',
  'FUNCIONARIO: ANA SOUZA SILVA',
  'PIS 123.45678.90-1',
  'NSR 000123',
  'DATA 12/07/2026  HORA 07:56',
].join('\n');

describe('parser do comprovante', () => {
  it('extrai a hora em HH:mm', () => {
    expect(extrairHora('... HORA 07:56')).toBe('07:56');
    expect(extrairHora('bateu 7h05')).toBe('07:05');
    expect(extrairHora('sem hora aqui')).toBeNull();
  });

  it('extrai a data em yyyy-mm-dd', () => {
    expect(extrairData('DATA 12/07/2026')).toBe('2026-07-12');
    expect(extrairData('05-03-25')).toBe('2025-03-05');
    expect(extrairData('99/99/9999')).toBeNull();
  });

  it('extrai o nome pelo rótulo', () => {
    expect(extrairNome(COMPROVANTE)).toBe('ANA SOUZA SILVA');
  });

  it('não confunde a empresa/cabeçalho com o nome', () => {
    const nome = extrairNome(COMPROVANTE);
    expect(nome).not.toContain('LTDA');
    expect(nome).not.toContain('CNPJ');
  });

  it('interpreta o comprovante completo', () => {
    const r = interpretarComprovante(COMPROVANTE);
    expect(r).toMatchObject({
      nome: 'ANA SOUZA SILVA',
      data: '2026-07-12',
      hora: '07:56',
    });
  });

  it('devolve nulos quando não encontra', () => {
    const r = interpretarComprovante('texto ilegível 123 %%%');
    expect(r.nome).toBeNull();
    expect(r.data).toBeNull();
    expect(r.hora).toBeNull();
  });

  // Formato real: relógio IDCLASS BIO PROX (Comercial Zaffari). O nome quebra
  // em duas linhas e há CNPJ/PIS com pontos antes da data/hora.
  const COMPROVANTE_REAL = [
    'COMPROVANTE DE REGISTRO DE PONTO',
    'DO TRABALHADOR',
    'RSOCIAL:COMERCIAL ZAFFARI LTDA',
    'LOCAL:RSC 453 N 4363 - BAIRRO CIDA',
    'DE NOVA - CAXIAS DO SUL / RS',
    'NREP:00014003750067197',
    'MODELO:IDCLASS BIO PROX',
    'CNPJ:92.016.757/0061-22',
    'CEI:00.000.00000/00',
    'NOME:BETZABETH ELISA CASTELLANO RE',
    'YES',
    'PIS:9113.13376.20-5',
    'NSR:000487111',
    'DATA:10/07/2026 HORA:13:18',
    'AD: HPYOZ2JR4ABVFLTEF57UEIVHXOULMZ',
  ].join('\n');

  it('interpreta o comprovante real (IDCLASS/Zaffari)', () => {
    const r = interpretarComprovante(COMPROVANTE_REAL);
    expect(r.hora).toBe('13:18');
    expect(r.data).toBe('2026-07-10');
    // Nome quebrado em duas linhas é reconstruído (RE + YES = REYES).
    expect(r.nome).toBe('BETZABETH ELISA CASTELLANO REYES');
  });

  it('não inventa nome a partir de ruído do OCR', () => {
    // Leituras ruins do OCR não devem virar "nome" — melhor não sugerir nada.
    expect(extrairNome('WINS NT')).toBeNull();
    expect(extrairNome('VA RAL')).toBeNull();
    expect(
      interpretarComprovante(
        'RSOCIAL:XPTO\nWINS NT\nDATA:10/07/2026 HORA:13:18',
      ).nome,
    ).toBeNull();
  });

  it('não confunde CNPJ/PIS com a data', () => {
    // Sem a âncora do rótulo, os números com ponto não devem virar data.
    expect(extrairData('CNPJ:92.016.757/0061-22')).toBeNull();
    expect(extrairData('PIS:9113.13376.20-5')).toBeNull();
  });
});
