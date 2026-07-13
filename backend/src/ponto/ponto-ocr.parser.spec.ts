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
});
