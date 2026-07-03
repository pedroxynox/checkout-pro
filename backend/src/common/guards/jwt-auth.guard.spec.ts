import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLICO_KEY } from '../decorators/publico.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Testes do `JwtAuthGuard` (Tarefa 13.2 + revogação de sessões): autenticação
 * por token (Req 7.1). Verifica liberação de rotas públicas, aceitação de
 * token válido (anexando a identidade) e rejeição de token ausente/inválido.
 *
 * Além da assinatura, o guard passou a validar a REVOGAÇÃO da sessão: compara o
 * `tokenVersion` do JWT com a versão atual do usuário no banco (mock do
 * `PrismaService`). Cobre: versão divergente, usuário inexistente e o caso de
 * compatibilidade de tokens antigos (sem `tokenVersion`, tratados como 0).
 */
describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'test-secret' });

  function contexto(authorization?: string): {
    ctx: ExecutionContext;
    request: { usuario?: unknown };
  } {
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
    return { ctx, request };
  }

  /**
   * Cria o guard com um `PrismaService` falso cujo `usuario.findUnique`
   * resolve para `usuarioNoBanco` (ou null para simular usuário removido).
   */
  function guard(
    publico = false,
    usuarioNoBanco: { tokenVersion: number } | null = { tokenVersion: 0 },
  ): { guard: JwtAuthGuard; findUnique: jest.Mock } {
    const reflector = {
      getAllAndOverride: (chave: string) =>
        chave === PUBLICO_KEY ? publico : undefined,
    } as unknown as Reflector;
    const findUnique = jest.fn().mockResolvedValue(usuarioNoBanco);
    const prisma = {
      usuario: { findUnique },
    } as unknown as PrismaService;
    return { guard: new JwtAuthGuard(jwt, reflector, prisma), findUnique };
  }

  it('libera rotas públicas sem token', async () => {
    const { ctx } = contexto(undefined);
    await expect(guard(true).guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('aceita token cujo tokenVersion casa com o do usuário e anexa a identidade', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
      tokenVersion: 3,
    });
    const { ctx, request } = contexto(`Bearer ${token}`);
    const { guard: g, findUnique } = guard(false, { tokenVersion: 3 });
    await expect(g.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { tokenVersion: true },
    });
    expect(request.usuario).toMatchObject({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
    });
  });

  it('rejeita (401 "Sessão expirada") quando o tokenVersion difere do atual', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
      tokenVersion: 1,
    });
    const { ctx } = contexto(`Bearer ${token}`);
    const { guard: g } = guard(false, { tokenVersion: 2 });
    await expect(g.canActivate(ctx)).rejects.toThrow(/Sessão expirada/);
  });

  it('rejeita quando o usuário não existe mais (findUnique retorna null)', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
      tokenVersion: 0,
    });
    const { ctx } = contexto(`Bearer ${token}`);
    const { guard: g } = guard(false, null);
    await expect(g.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita token antigo sem tokenVersion enquanto a versão do usuário é 0', async () => {
    const token = await jwt.signAsync({
      sub: 'u1',
      login: 'ana',
      perfil: 'FISCAL',
    });
    const { ctx, request } = contexto(`Bearer ${token}`);
    const { guard: g } = guard(false, { tokenVersion: 0 });
    await expect(g.canActivate(ctx)).resolves.toBe(true);
    expect(request.usuario).toMatchObject({ sub: 'u1', perfil: 'FISCAL' });
  });

  it('rejeita quando o token está ausente', async () => {
    const { ctx } = contexto(undefined);
    await expect(guard(false).guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejeita token inválido', async () => {
    const { ctx } = contexto('Bearer token-invalido');
    await expect(guard(false).guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
