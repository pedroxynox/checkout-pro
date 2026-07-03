import 'reflect-metadata';
import { Ambiente, validateEnv } from './env.validation';

/**
 * Testes de `validateEnv`: aplicação de padrões em desenvolvimento e a
 * exigência de JWT_SECRET quando NODE_ENV=production.
 */
describe('validateEnv', () => {
  it('aplica os padrões em desenvolvimento (sem variáveis obrigatórias)', () => {
    const validated = validateEnv({});
    expect(validated.NODE_ENV).toBe(Ambiente.Development);
    expect(validated.PORT).toBe(3000);
    expect(validated.HORARIO_FIM_DO_DIA).toBe('22:50');
    expect(validated.GEMINI_MODEL).toBe('gemini-2.5-flash');
  });

  it('lança quando NODE_ENV=production e JWT_SECRET está ausente', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('passa quando NODE_ENV=production e JWT_SECRET está presente', () => {
    const validated = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'segredo-de-producao',
    });
    expect(validated.NODE_ENV).toBe(Ambiente.Production);
    expect(validated.JWT_SECRET).toBe('segredo-de-producao');
  });
});
