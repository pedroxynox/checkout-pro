import { ArrayUnique, IsArray, IsString } from 'class-validator';

/**
 * Define as permissões ajustáveis LIGADAS de um usuário. A lista contém as
 * funcionalidades que devem ficar ativas; o backend calcula os desvios em
 * relação ao padrão do perfil.
 */
export class DefinirPermissoesDto {
  @IsArray({ message: 'permissoes deve ser uma lista de funcionalidades.' })
  @ArrayUnique({ message: 'A lista de permissões não pode ter itens repetidos.' })
  @IsString({ each: true, message: 'Cada permissão deve ser um texto.' })
  permissoes!: string[];
}
