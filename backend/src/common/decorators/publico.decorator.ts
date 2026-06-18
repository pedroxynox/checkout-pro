import { SetMetadata } from '@nestjs/common';

/** Chave de metadados que marca uma rota como pública (sem autenticação). */
export const PUBLICO_KEY = 'publico';

/**
 * Marca um handler/controller como público, dispensando o `JwtAuthGuard`.
 * Usado na rota de login (Req 7.1), única rota acessível sem token.
 */
export const Publico = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLICO_KEY, true);
