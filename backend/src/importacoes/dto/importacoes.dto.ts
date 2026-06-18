import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { TIPOS_ARQUIVO, TipoArquivo } from '../importacoes.domain';

/** Parâmetros do upload de um arquivo de importação (Req 1.1). */
export class UploadImportacaoDto {
  @IsIn(TIPOS_ARQUIVO as unknown as string[], {
    message:
      'Tipo de arquivo inválido. Use CANCELAMENTO_ITENS, TROCO_SOLIDARIO, RECARGAS_CELULAR ou DEVOLUCOES.',
  })
  tipo!: TipoArquivo;

  @IsOptional()
  @IsDateString(
    {},
    { message: 'A data de referência deve ser uma data válida (ISO 8601).' },
  )
  dataReferencia?: string;
}

/** Filtro opcional por intervalo de datas no histórico (Req 1.3.3). */
export class HistoricoImportacoesDto {
  @IsOptional()
  @IsDateString({}, { message: 'A data inicial deve ser uma data válida.' })
  inicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'A data final deve ser uma data válida.' })
  fim?: string;
}

/** Consulta de status/pendentes por dia de referência (Req 1.2, 1.4). */
export class StatusDiaDto {
  @IsDateString({}, { message: 'A data deve ser uma data válida (ISO 8601).' })
  data!: string;
}
