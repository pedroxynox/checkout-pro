import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BatidaPonto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  StatusJornadaPonto,
  TipoBatida,
  calcularJornadaDia,
  classificarBatidas,
  statusFiscalDeTipoBatida,
} from './ponto.domain';
import { FiscaisService } from '../fiscais/fiscais.service';
import { StatusFiscal } from '../fiscais/fiscais.domain';
import { EditarBatidaDto, RegistrarBatidaDto } from './dto/ponto.dto';

/**
 * Diferença entre a hora da batida (relógio de Brasília, gravada como horário
 * "de parede" rotulado Z) e o UTC real. Ao alimentar o log de fiscais, somamos
 * 3h para que `calcularJornada` (que usa `new Date()` real) fique correto.
 */
const OFFSET_BRASILIA_PARA_UTC_MS = 3 * 60 * 60 * 1000;

/** Uma batida como exibida ao app. */
export interface BatidaView {
  id: string;
  hora: string;
  tipo: TipoBatida;
  origem: string;
  registradoPorNome: string | null;
}

/** Jornada do dia (serializável) exposta ao app. */
export interface JornadaView {
  trabalhadoMs: number;
  intervaloMs: number;
  status: StatusJornadaPonto;
  baseMs: number;
  horasExtrasMs: number;
  horasExtras50Ms: number;
  horasExtras100Ms: number;
  alertaIminente: boolean;
  tac: boolean;
  motivosTac: string[];
  faltando: string[];
}

/** Resposta do dia: dados da pessoa, jornada calculada e batidas. */
export interface JornadaDiaResposta {
  pessoaId: string;
  tipoPessoa: string;
  data: string;
  jornada: JornadaView;
  batidas: BatidaView[];
}

/** Pessoa selecionável para registrar o ponto. */
export interface PessoaPonto {
  id: string;
  nome: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
}

/**
 * Registro de Ponto (leitor de comprovante) — Fase A.
 *
 * Grava as batidas do relógio físico (uma linha por batida), classifica-as
 * pela ordem cronológica do dia e calcula a jornada (delegando a matemática ao
 * domínio puro `ponto.domain`). A hora que vale é a do comprovante.
 */
@Injectable()
export class PontoService {
  constructor(
    private readonly prisma: PrismaService,
    // Ponte batidas → status do fiscal. Opcional para não quebrar testes
    // unitários que exercitam só a persistência das batidas.
    @Optional() private readonly fiscais?: FiscaisService,
  ) {}

  /** Busca fiscais por nome (para escolher de quem é o comprovante). */
  async buscarPessoas(busca?: string): Promise<PessoaPonto[]> {
    const where: Prisma.FiscalWhereInput =
      busca && busca.trim()
        ? { nome: { contains: busca.trim(), mode: 'insensitive' } }
        : {};
    const fiscais = await this.prisma.fiscal.findMany({
      where,
      orderBy: { nome: 'asc' },
      take: 20,
    });
    return fiscais.map((f) => ({
      id: f.id,
      nome: f.nome,
      tipoPessoa: 'FISCAL' as const,
    }));
  }

  /** Registra uma nova batida e devolve a jornada do dia recalculada. */
  async registrarBatida(
    dto: RegistrarBatidaDto,
    usuario: UsuarioAutenticado,
  ): Promise<JornadaDiaResposta> {
    const dia = inicioDoDia(new Date(dto.data));
    const tipoPessoa = dto.tipoPessoa ?? 'FISCAL';
    await this.prisma.batidaPonto.create({
      data: {
        pessoaId: dto.pessoaId,
        tipoPessoa,
        colaboradorId: dto.colaboradorId ?? null,
        data: dia,
        hora: new Date(dto.hora),
        // Tipo provisório — `reclassificar` ajusta pela ordem do dia.
        tipo: 'ENTRADA',
        origem: dto.origem ?? 'MANUAL',
        comprovanteUrl: dto.comprovanteUrl ?? null,
        registradoPor: usuario.sub,
        registradoPorNome: usuario.nome ?? null,
      },
    });
    await this.reclassificar(dto.pessoaId, dia);
    await this.sincronizarStatusFiscal(dto.pessoaId, tipoPessoa, dia);
    return this.jornadaDoDia(dto.pessoaId, tipoPessoa, dia);
  }

  /** Corrige uma batida (hora e/ou tipo) e recalcula. */
  async editarBatida(
    id: string,
    dto: EditarBatidaDto,
  ): Promise<JornadaDiaResposta> {
    const batida = await this.buscarOuFalhar(id);
    const data: Prisma.BatidaPontoUpdateInput = { origem: 'EDITADO' };
    if (dto.hora) data.hora = new Date(dto.hora);
    if (dto.tipo) data.tipo = dto.tipo;
    await this.prisma.batidaPonto.update({ where: { id }, data });
    // Se a hora mudou, a ordem do dia pode ter mudado → reclassifica.
    if (dto.hora) await this.reclassificar(batida.pessoaId, batida.data);
    await this.sincronizarStatusFiscal(
      batida.pessoaId,
      batida.tipoPessoa,
      batida.data,
    );
    return this.jornadaDoDia(batida.pessoaId, batida.tipoPessoa, batida.data);
  }

  /** Remove uma batida e reclassifica o dia. */
  async removerBatida(id: string): Promise<JornadaDiaResposta> {
    const batida = await this.buscarOuFalhar(id);
    await this.prisma.batidaPonto.delete({ where: { id } });
    await this.reclassificar(batida.pessoaId, batida.data);
    await this.sincronizarStatusFiscal(
      batida.pessoaId,
      batida.tipoPessoa,
      batida.data,
    );
    return this.jornadaDoDia(batida.pessoaId, batida.tipoPessoa, batida.data);
  }

  /** Batidas + jornada calculada de um dia. */
  async jornadaDoDia(
    pessoaId: string,
    tipoPessoa: string,
    data: Date,
  ): Promise<JornadaDiaResposta> {
    const dia = inicioDoDia(data);
    const batidas = await this.prisma.batidaPonto.findMany({
      where: { pessoaId, data: dia },
      orderBy: { hora: 'asc' },
    });
    const j = calcularJornadaDia(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
      new Date(),
      dia.getUTCDay(),
    );
    return {
      pessoaId,
      tipoPessoa,
      data: dia.toISOString(),
      jornada: {
        trabalhadoMs: j.trabalhadoMs,
        intervaloMs: j.intervaloMs,
        status: j.status,
        baseMs: j.baseMs,
        horasExtrasMs: j.horasExtrasMs,
        horasExtras50Ms: j.horasExtras50Ms,
        horasExtras100Ms: j.horasExtras100Ms,
        alertaIminente: j.alertaIminente,
        tac: j.tac,
        motivosTac: j.motivosTac,
        faltando: j.faltando,
      },
      batidas: batidas.map((b) => ({
        id: b.id,
        hora: b.hora.toISOString(),
        tipo: b.tipo as TipoBatida,
        origem: b.origem,
        registradoPorNome: b.registradoPorNome,
      })),
    };
  }

  /** Reatribui o tipo de cada batida do dia pela ordem cronológica. */
  private async reclassificar(pessoaId: string, data: Date): Promise<void> {
    const dia = inicioDoDia(data);
    const batidas = await this.prisma.batidaPonto.findMany({
      where: { pessoaId, data: dia },
      orderBy: { hora: 'asc' },
    });
    const classificadas = classificarBatidas(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
    );
    const updates = classificadas
      .map((c) => {
        const orig = batidas.find((b) => b.id === c.id);
        if (!orig || orig.tipo === c.tipo) return null;
        return this.prisma.batidaPonto.update({
          where: { id: c.id },
          data: { tipo: c.tipo },
        });
      })
      .filter((u): u is Prisma.Prisma__BatidaPontoClient<BatidaPonto> => !!u);
    await Promise.all(updates);
  }

  /**
   * Ponte batidas → status do fiscal. Só para pessoas do tipo FISCAL: converte
   * as batidas do dia em transições de status (DISPONIVEL/INTERVALO/
   * FORA_EXPEDIENTE) e reescreve o log de fiscais desse dia. Assim o painel, o
   * perfil e os avisos — que leem `RegistroPontoFiscal` — passam a refletir as
   * batidas do relógio, sem os botões manuais.
   *
   * A hora da batida é horário de Brasília rotulado Z; somamos 3h para gravar o
   * instante em UTC real, alinhado ao `new Date()` usado no cálculo de jornada.
   */
  private async sincronizarStatusFiscal(
    pessoaId: string,
    tipoPessoa: string,
    data: Date,
  ): Promise<void> {
    if (tipoPessoa !== 'FISCAL' || !this.fiscais) return;

    const dia = inicioDoDia(data);
    const batidas = await this.prisma.batidaPonto.findMany({
      where: { pessoaId, tipoPessoa: 'FISCAL', data: dia },
      orderBy: { hora: 'asc' },
    });
    const classificadas = classificarBatidas(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
    );

    const transicoes: { status: StatusFiscal; em: Date }[] = [];
    for (const c of classificadas) {
      const status = statusFiscalDeTipoBatida(c.tipo);
      if (!status) continue;
      transicoes.push({
        status,
        em: new Date(c.hora.getTime() + OFFSET_BRASILIA_PARA_UTC_MS),
      });
    }

    await this.fiscais.aplicarTransicoesDoDia(pessoaId, dia, transicoes);
  }

  private async buscarOuFalhar(id: string): Promise<BatidaPonto> {
    const batida = await this.prisma.batidaPonto.findUnique({ where: { id } });
    if (!batida) {
      throw new NotFoundException('Batida de ponto não encontrada.');
    }
    return batida;
  }
}
