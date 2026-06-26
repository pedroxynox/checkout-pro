import { IsIn, IsNumber, Matches, Min } from 'class-validator';
import { TIPOS_META, TipoMeta } from '../metas.domain';

/** Período mensal "AAAA-MM" (ex.: "2026-06"). */
const RE_ANO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MSG_ANO_MES = 'Período mensal inválido (use o formato AAAA-MM).';

/** Query para listar as metas de um mês. */
export class ListarMetasDto {
  @Matches(RE_ANO_MES, { message: MSG_ANO_MES })
  anoMes!: string;
}

/** Corpo para definir a meta de um indicador num mês. */
export class DefinirMetaDto {
  @IsIn(TIPOS_META as unknown as string[], {
    message: 'Tipo de meta inválido.',
  })
  tipo!: TipoMeta;

  @Matches(RE_ANO_MES, { message: MSG_ANO_MES })
  anoMes!: string;

  @IsNumber({}, { message: 'Informe um valor numérico para a meta.' })
  @Min(0, { message: 'A meta não pode ser negativa.' })
  meta!: number;
}
