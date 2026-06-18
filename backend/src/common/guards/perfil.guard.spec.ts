import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AcessosService } from '../../acessos/acessos.service';
import { PermissaoInsuficienteError } from '../../acessos/acessos.errors';
import { Perfil } from '../../acessos/acessos.domain';
import { FUNCIONALIDADE_KEY } from '../decorators/funcionalidade.decorator';
import { PerfilGuard } from './perfil.guard';

/**
 * Testes de exemplo do `PerfilGuard` (Tarefa 13.2): autorização por perfil
 * (Req 7.2). Usa o `AcessosService` real (decisão pura) e um `Reflector` que
 * devolve a funcionalidade configurada.
 */
describe('PerfilGuard', () => {
  const acessos = new AcessosService(
    {} as never,
    new JwtService({ secret: 's' }),
  );

  function contexto(perfil: Perfil): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ usuario: { sub: 'u', login: 'l', perfil } }),
      }),
    } as unknown as ExecutionContext;
  }

  function guardCom(funcionalidade?: string): PerfilGuard {
    const reflector = {
      getAllAndOverride: (chave: string) =>
        chave === FUNCIONALIDADE_KEY ? funcionalidade : undefined,
    } as unknown as Reflector;
    return new PerfilGuard(reflector, acessos);
  }

  it('permite quando não há funcionalidade declarada (apenas autenticado)', () => {
    expect(guardCom(undefined).canActivate(contexto('FISCAL'))).toBe(true);
  });

  it('gerente é autorizado em funcionalidade administrativa', () => {
    expect(guardCom('OPERADORES_CRUD').canActivate(contexto('GERENTE'))).toBe(
      true,
    );
  });

  it('fiscal é autorizado em funcionalidade operacional', () => {
    expect(guardCom('CHECKLIST').canActivate(contexto('FISCAL'))).toBe(true);
  });

  it('fiscal é negado em funcionalidade administrativa', () => {
    expect(() =>
      guardCom('OPERADORES_CRUD').canActivate(contexto('FISCAL')),
    ).toThrow(PermissaoInsuficienteError);
  });
});
