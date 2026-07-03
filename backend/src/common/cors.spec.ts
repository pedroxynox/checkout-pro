import { origensCorsDoAmbiente } from './cors';

describe('origensCorsDoAmbiente', () => {
  const original = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = original;
    }
  });

  it('retorna true quando CORS_ORIGINS não está definida', () => {
    delete process.env.CORS_ORIGINS;
    expect(origensCorsDoAmbiente()).toBe(true);
  });

  it('retorna true quando CORS_ORIGINS está vazia', () => {
    process.env.CORS_ORIGINS = '';
    expect(origensCorsDoAmbiente()).toBe(true);
  });

  it('retorna true quando CORS_ORIGINS contém apenas espaços/vírgulas', () => {
    process.env.CORS_ORIGINS = '  ,  , ';
    expect(origensCorsDoAmbiente()).toBe(true);
  });

  it('retorna a lista de origens (trimadas) quando definida', () => {
    process.env.CORS_ORIGINS = 'a, b';
    expect(origensCorsDoAmbiente()).toEqual(['a', 'b']);
  });

  it('ignora entradas vazias entre as origens', () => {
    process.env.CORS_ORIGINS =
      'https://app.exemplo.com, ,https://outro.exemplo.com';
    expect(origensCorsDoAmbiente()).toEqual([
      'https://app.exemplo.com',
      'https://outro.exemplo.com',
    ]);
  });
});
