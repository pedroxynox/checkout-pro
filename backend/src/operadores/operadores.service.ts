import { Injectable } from '@nestjs/common';
import { Operador, Ausencia } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AusenciaRegistro,
  ContagemTurno,
  IntervaloDatas,
  ItemRelatorioAusencia,
  OperadorEscalaDia,
  Turno,
  ausenciaDuplicada,
  classificarTurnoOperador,
  contagemPorTurno,
  nomeDuplicado,
  relatorioAusencias,
} from './operadores.domain';
import {
  AusenciaDuplicadaError,
  NomeDuplicadoError,
} from './operadores.errors';

/**
 * Serviço do Modulo_Operadores: cadastro de operadores com unicidade de nome
 * (Req 6.1), registro/remoção de ausências com unicidade por pessoa/dia
 * (Req 6.2), relatório de ausências por período (Req 6.3) e classificação/
 * contagem de operadores por turno (Req 6.6).
 *
 * A lógica de decisão é delegada a funções puras (`operadores.domain`); este
 * serviço cuida apenas dos efeitos colaterais (consultas e escritas via
 * Prisma).
 */
@Injectable()
export class OperadoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cadastra um operador pelo nome (Req 6.1.1, 6.1.2). Rejeita nome idêntico a
   * um operador já cadastrado lançando `NomeDuplicadoError` (Req 6.1.3).
   */
  async cadastrar(nome: string): Promise<Operador> {
    const existentes = await this.prisma.operador.findMany({
      select: { nome: true },
    });
    if (
      nomeDuplicado(
        existentes.map((o) => o.nome),
        nome,
      )
    ) {
      throw new NomeDuplicadoError(nome);
    }
    return this.prisma.operador.create({ data: { nome } });
  }

  /**
   * Edita o nome de um operador já cadastrado (Req 6.1.4). Rejeita quando o
   * novo nome coincide com o de outro operador, lançando `NomeDuplicadoError`
   * (Req 6.1.3).
   */
  async editarNome(id: string, nome: string): Promise<Operador> {
    const outros = await this.prisma.operador.findMany({
      where: { id: { not: id } },
      select: { nome: true },
    });
    if (
      nomeDuplicado(
        outros.map((o) => o.nome),
        nome,
      )
    ) {
      throw new NomeDuplicadoError(nome);
    }
    return this.prisma.operador.update({ where: { id }, data: { nome } });
  }

  /** Lista os operadores cadastrados, ordenados por nome (Req 6.1.5). */
  async listar(): Promise<Operador[]> {
    return this.prisma.operador.findMany({ orderBy: { nome: 'asc' } });
  }

  /**
   * Registra uma ausência de um operador ou fiscal para um dia (Req 6.2.1,
   * 6.2.2). Rejeita uma segunda ausência para a mesma pessoa na mesma data,
   * lançando `AusenciaDuplicadaError` (Req 6.2.3).
   */
  async registrarAusencia(pessoaId: string, data: Date): Promise<Ausencia> {
    const existentes = await this.prisma.ausencia.findMany({
      where: { pessoaId },
      select: { pessoaId: true, data: true },
    });
    if (ausenciaDuplicada(existentes, pessoaId, data)) {
      throw new AusenciaDuplicadaError();
    }
    return this.prisma.ausencia.create({ data: { pessoaId, data } });
  }

  /** Remove uma ausência registrada (Req 6.2.4). */
  async removerAusencia(ausenciaId: string): Promise<void> {
    await this.prisma.ausencia.delete({ where: { id: ausenciaId } });
  }

  /**
   * Gera o relatório de ausências por pessoa dentro de um período, filtrado e
   * ordenado de forma decrescente pela quantidade (Req 6.3.1–6.3.3). A
   * filtragem/contagem/ordenação é delegada à função pura `relatorioAusencias`.
   */
  async relatorioAusencias(
    periodo: IntervaloDatas,
  ): Promise<ItemRelatorioAusencia[]> {
    const ausencias = await this.prisma.ausencia.findMany({
      where: { data: { gte: periodo.inicio, lte: periodo.fim } },
      select: { pessoaId: true, data: true },
    });
    const registros: AusenciaRegistro[] = ausencias.map((a) => ({
      pessoaId: a.pessoaId,
      data: a.data,
    }));
    return relatorioAusencias(registros, periodo);
  }

  /**
   * Classifica o turno de um operador a partir do horário de entrada da escala
   * (Req 6.6.1–6.6.4). Delega à função pura `classificarTurnoOperador`.
   */
  classificarTurnoOperador(entrada: string): Turno {
    return classificarTurnoOperador(entrada);
  }

  /**
   * Conta os operadores por turno em um dia/escala, considerando apenas os que
   * estão trabalhando (Req 6.6.5–6.6.7). Delega à função pura
   * `contagemPorTurno`.
   */
  contagemPorTurno(operadores: readonly OperadorEscalaDia[]): ContagemTurno {
    return contagemPorTurno(operadores);
  }
}
