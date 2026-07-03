import { ConfigService } from '@nestjs/config';
import { resolverSegredoJwt } from './jwt-secret';

/**
 * Testes de `resolverSegredoJwt`: resolução do segredo de assinatura dos
 * tokens JWT em produção (falha rápida) e em desenvolvimento (segredo efêmero).
 */

/** ConfigService falso: responde `get(chave)` a partir de um mapa simples. */
function fakeConfig(valores: Record<string, string | undefined>): ConfigService {
  return {
    get: (chave: string) => valores[chave],
  } as unknown as ConfigService;
}

describe('resolverSegredoJwt', () => {
  it('retorna o segredo configurado quando JWT_SECRET está definido', () => {
    const config = fakeConfig({ JWT_SECRET: 'segredo-super-secreto' });
    expect(resolverSegredoJwt(config)).toBe('segredo-super-secreto');
  });

  it('lança quando NODE_ENV=production e JWT_SECRET está ausente', () => {
    const config = fakeConfig({ NODE_ENV: 'production' });
    expect(() => resolverSegredoJwt(config)).toThrow(/JWT_SECRET/);
  });

  it('lança quando NODE_ENV=production e JWT_SECRET é vazio', () => {
    const config = fakeConfig({ NODE_ENV: 'production', JWT_SECRET: '   ' });
    expect(() => resolverSegredoJwt(config)).toThrow(/JWT_SECRET/);
  });

  it('em desenvolvimento sem JWT_SECRET, retorna string não vazia e memoiza', () => {
    const config = fakeConfig({ NODE_ENV: 'development' });
    const primeiro = resolverSegredoJwt(config);
    expect(typeof primeiro).toBe('string');
    expect(primeiro.length).toBeGreaterThan(0);
    // Segunda chamada retorna o MESMO segredo efêmero (memoizado por processo).
    const segundo = resolverSegredoJwt(config);
    expect(segundo).toBe(primeiro);
  });
});
