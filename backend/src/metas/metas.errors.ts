import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';
import { CONFIG_METAS, TipoMeta } from './metas.domain';

/**
 * Tentativa de digitar uma meta que é **derivada** de outro dado do sistema.
 * Hoje só acontece com VENDAS, cuja meta do mês é a soma das estimativas
 * diárias da Central de Vendas — alterá-la à mão criaria duas verdades
 * divergentes para o mesmo número.
 */
export class MetaDerivadaNaoEditavelError extends ErroDominio {
  readonly statusHttp = HttpStatus.CONFLICT;

  constructor(tipo: TipoMeta) {
    super(
      `A meta de ${CONFIG_METAS[tipo].titulo} não é digitada: ela é a soma das estimativas diárias do mês. Ajuste as estimativas em Centro de Controle ▸ Central de Vendas.`,
    );
  }
}
