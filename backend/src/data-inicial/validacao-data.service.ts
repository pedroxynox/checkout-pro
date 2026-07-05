import { Injectable } from '@nestjs/common';
import { dataPermitida } from './data-inicial.domain';
import { ErroDataAnteriorInicial } from './data-inicial.errors';
import { DataInicialService } from './data-inicial.service';

/**
 * Validação de data mínima **compartilhada** (Requisitos 6.1, 6.2, 6.4).
 *
 * Reúne, num único ponto injetável, a leitura da `Data_Inicial_Sistema`
 * (`DataInicialService`) e a regra de domínio pura (`dataPermitida`), evitando
 * duplicar a lógica nos vários endpoints de carga/edição. Cada serviço afetado
 * apenas chama `exigirDataPermitida(data)` antes de persistir.
 *
 * É provido e exportado pelo `DataInicialModule`.
 */
@Injectable()
export class ValidacaoDataService {
  constructor(private readonly dataInicial: DataInicialService) {}

  /**
   * Lança `ErroDataAnteriorInicial` (400) quando `data` é anterior à
   * `Data_Inicial_Sistema` vigente; caso contrário (igual ou posterior),
   * retorna normalmente e o fluxo prossegue (Req 6.1, 6.2).
   */
  async exigirDataPermitida(data: Date): Promise<void> {
    const minima = await this.dataInicial.obterData();
    if (!dataPermitida(data, minima)) {
      throw new ErroDataAnteriorInicial(minima);
    }
  }
}
