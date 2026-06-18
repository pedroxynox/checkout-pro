import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** Registro de um lote inicial de sacolas APAE (Req 2.6.1). */
export class RegistrarLoteDto {
  @Type(() => Number)
  @IsInt({ message: 'A quantidade inicial deve ser um número inteiro.' })
  @Min(0, { message: 'A quantidade inicial deve ser maior ou igual a zero.' })
  quantidadeInicial!: number;
}

/** Atualização do saldo restante de um lote (Req 2.6.2–2.6.4). */
export class AtualizarSaldoDto {
  @Type(() => Number)
  @IsInt({ message: 'O saldo atual deve ser um número inteiro.' })
  @Min(0, { message: 'O saldo atual deve ser maior ou igual a zero.' })
  saldoAtual!: number;
}

/** Reinício do ciclo do lote com nova quantidade inicial (Req 2.6.5, 2.6.6). */
export class ReiniciarLoteDto {
  @Type(() => Number)
  @IsInt({ message: 'A nova quantidade inicial deve ser um número inteiro.' })
  @Min(0, {
    message: 'A nova quantidade inicial deve ser maior ou igual a zero.',
  })
  novaQuantidadeInicial!: number;
}
