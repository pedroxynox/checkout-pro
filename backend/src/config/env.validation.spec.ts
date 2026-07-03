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

  it('lança quando NODE_ENV=production e DATABASE_URL está ausente (com JWT_SECRET presente)', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'segredo-de-producao',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('passa quando NODE_ENV=production e as variáveis obrigatórias estão presentes', () => {
    const validated = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'segredo-de-producao',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(validated.NODE_ENV).toBe(Ambiente.Production);
    expect(validated.JWT_SECRET).toBe('segredo-de-producao');
    expect(validated.DATABASE_URL).toBe(
      'postgresql://user:pass@localhost:5432/db',
    );
  });
});
