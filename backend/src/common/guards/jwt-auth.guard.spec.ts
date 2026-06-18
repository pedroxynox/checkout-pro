import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PUBLICO_KEY } from '../decorators/publico.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Testes de exemplo do `JwtAuthGuard` (Tarefa 13.2): autenticação por token
 * (Req 7.1). Verifica liberação de rotas públicas, aceitação de token válido
 * (anexando a identidade) e rejeição de token ausente/ inválido.
 */
describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });

  function contexto(
    authorization?: string,
    publico = false,
  ): { ctx: ExecutionContext; request: { usuario?: unknown } } {
    const request: {
      headers: Record<string, string | undefined>;
      usuario?: unknown;
    } = {
      headers: { authorization },
    };
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    void publico;
    return { ctx, request };
  }

  function guard(publico = false): JwtAuthGuard {
    const reflector = {
      getAllAndOverride: (chave: string) =>
        chave === PUBLICO_KEY ? publico : undefined,
    } as unknown as Reflector;
    return new JwtAuthGuard(jwt, reflector);
  }

  it('libera rotas públicas sem token', async () => {
    const { ctx } = contexto(undefined);
    await expect(guard(true).canActivate(ctx)).resolves.toBe(true);
  });

  it('aceita token válido e anexa a identidade à requisição', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
    });
    const { ctx, request } = contexto(`Bearer ${token}`);
    await expect(guard(false).canActivate(ctx)).resolves.toBe(true);
    expect(request.usuario).toMatchObject({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
    });
  });

  it('rejeita quando o token está ausente', async () => {
    const { ctx } = contexto(undefined);
    await expect(guard(false).canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token inválido', async () => {
    const { ctx } = contexto('Bearer token-invalido');
    await expect(guard(false).canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
