/**
 * Erros de domínio tipados do Modulo_DataInicial.
 *
 * Erros puros que estendem `ErroDominio` (cada um declara o próprio
 * `statusHttp`); o filtro global os mapeia para a resposta HTTP com mensagem em
 * pt-BR, sem mapa central manual.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/**
 * Lançado quando um endpoint de carga/edição recebe um registro cuja data é
 * anterior à Data_Inicial_Sistema — Requisitos 6.1, 6.4.
 *
 * A mensagem em português informa a data mínima permitida em `dd/mm/aaaa`.
 */
export class ErroDataAnteriorInicial extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST; // 400

  constructor(dataMinima: Date) {
    const iso = dataMinima.toISOString().slice(0, 10); // yyyy-mm-dd
    const brasil = iso.split('-').reverse().join('/'); // dd/mm/aaaa
    super(
      `Data anterior à data inicial do sistema. A data mínima permitida é ${brasil}.`,
    );
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
