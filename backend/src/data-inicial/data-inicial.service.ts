import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Resultado de leitura da Data_Inicial_Sistema para o app (ISO yyyy-mm-dd). */
export interface DataInicialResultado {
  dataInicial: string;
}

/**
 * Serviço da Data_Inicial_Sistema (configuração global *singleton*, id fixo
 * `'sistema'`), no mesmo padrão de `ConfigVendas`/`ConfigApae`: leitura/escrita
 * via `upsert`, com o valor padrão **2026-07-01** quando nada foi definido.
 *
 * Requisitos 5.1, 5.2, 5.3, 5.5.
 */
@Injectable()
export class DataInicialService {
  /** Valor padrão da Data_Inicial_Sistema (Req 5.1). */
  private readonly PADRAO = new Date('2026-07-01T00:00:00.000Z');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Data_Inicial_Sistema vigente como `Date` (uso interno, ex.: validação de
   * data mínima). Cria o singleton com o padrão quando ainda não existe.
   */
  async obterData(): Promise<Date> {
    const cfg = await this.prisma.configSistema.upsert({
      where: { id: 'sistema' },
      update: {},
      create: { id: 'sistema', dataInicial: this.PADRAO },
    });
    return cfg.dataInicial;
  }

  /** Data_Inicial_Sistema vigente em ISO `yyyy-mm-dd` para o app (Req 5.5). */
  async obter(): Promise<DataInicialResultado> {
    const data = await this.obterData();
    return { dataInicial: data.toISOString().slice(0, 10) };
  }

  /**
   * Persiste uma nova Data_Inicial_Sistema e registra quem a atualizou
   * (Req 5.3). Retorna o valor vigente em ISO `yyyy-mm-dd`.
   */
  async editar(dataISO: string, por?: string): Promise<DataInicialResultado> {
    const nova = new Date(dataISO);
    const cfg = await this.prisma.configSistema.upsert({
      where: { id: 'sistema' },
      update: { dataInicial: nova, atualizadoPor: por },
      create: { id: 'sistema', dataInicial: nova, atualizadoPor: por },
    });
    return { dataInicial: cfg.dataInicial.toISOString().slice(0, 10) };
  }
}
