import { Controller, Get, Query } from '@nestjs/common';
import { Funcionalidade } from '../common/decorators/funcionalidade.decorator';
import { diaCivilBrasilia } from '../common/datas';
import { DataEscalaDto } from './dto/escala-exportacao.dto';
import {
  EscalaDiaPublicada,
  EscalaExportacaoService,
  EscalaSemanaPublicada,
} from './escala-exportacao.service';

/**
 * Escala para PUBLICAR (enviar à equipe), do dia e da semana.
 *
 * Só leitura, sob a mesma alçada da escala (`ESCALA_VISUALIZAR`) — quem já pode
 * ver a escala pode publicá-la. A montagem do PDF/imagem acontece no app, a
 * partir destes dados.
 */
@Controller('escala-exportacao')
@Funcionalidade('ESCALA_VISUALIZAR')
export class EscalaExportacaoController {
  constructor(private readonly service: EscalaExportacaoService) {}

  /** Escala de um dia com todo o time (padrão: hoje em Brasília). */
  @Get('dia')
  dia(@Query() dto: DataEscalaDto): Promise<EscalaDiaPublicada> {
    return this.service.escalaDoDia(this.dataDeReferencia(dto.data));
  }

  /** Escala da semana (segunda a domingo) que contém a data informada. */
  @Get('semana')
  semana(@Query() dto: DataEscalaDto): Promise<EscalaSemanaPublicada> {
    return this.service.escalaDaSemana(this.dataDeReferencia(dto.data));
  }

  /**
   * `yyyy-mm-dd` da referência: a data informada ou o dia civil de Brasília.
   *
   * O corte é o de Brasília, não o do servidor (que roda em UTC): entre 21h e
   * meia-noite o UTC já virou o dia, e a escala "de hoje" apareceria como a de
   * amanhã justamente no horário em que ela é enviada à equipe.
   */
  private dataDeReferencia(data?: string): string {
    if (data) return data.slice(0, 10);
    return diaCivilBrasilia().toISOString().slice(0, 10);
  }
}
