import { SetMetadata } from '@nestjs/common';

/**
 * Chave de metadados usada pelo `PerfilGuard` para descobrir qual
 * funcionalidade está sendo protegida em um handler/controller.
 */
export const FUNCIONALIDADE_KEY = 'funcionalidade';

/**
 * Decorator que associa uma funcionalidade (string) a um handler ou
 * controller. O `PerfilGuard` lê este metadado e exige autorização do perfil
 * do usuário autenticado por meio do `AcessosService` (Req 7.2).
 *
 * Quando ausente, o `PerfilGuard` exige apenas que o usuário esteja
 * autenticado, sem restrição adicional de perfil.
 */
export const Funcionalidade = (
  funcionalidade: string,
): MethodDecorator & ClassDecorator =>
  SetMetadata(FUNCIONALIDADE_KEY, funcionalidade);
