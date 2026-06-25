import { SetMetadata } from '@nestjs/common';

/**
 * Chave de metadados usada pelo `PerfilGuard` para descobrir qual
 * funcionalidade está sendo protegida em um handler/controller.
 */
export const FUNCIONALIDADE_KEY = 'funcionalidade';

/**
 * Decorator que associa **uma ou mais** funcionalidades a um handler ou
 * controller. O `PerfilGuard` lê este metadado e autoriza o perfil do usuário
 * se ele tiver acesso a **qualquer uma** das funcionalidades informadas
 * (semântica OR). Útil quando um endpoint é compartilhado por fluxos com
 * permissões diferentes (ex.: o status do dia, lido tanto na Importação quanto
 * no Fechamento).
 *
 * Quando ausente, o `PerfilGuard` exige apenas que o usuário esteja
 * autenticado, sem restrição adicional de perfil.
 */
export const Funcionalidade = (
  ...funcionalidades: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(FUNCIONALIDADE_KEY, funcionalidades);
