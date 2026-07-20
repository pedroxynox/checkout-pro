import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ValidacaoDataService } from '../data-inicial/validacao-data.service';
import { CicloFolhaService } from '../ciclo-folha/ciclo-folha.service';
import { inicioDoDia } from '../common/datas';
import { CID10, EntradaCid } from './cid10.catalogo';
import {
  avaliarRegraInss,
  buscarCid as buscarCidDominio,
  contarDiasCorridos,
  cruzouLimiteInss,
  normalizarCid,
} from './atestados.domain';
import {
  AtestadoNaoEncontradoError,
  CidObrigatorioError,
  PeriodoAtestadoInvalidoError,
} from './atestados.errors';

/** Máximo de dias que um atestado pode cobrir (defensivo). */
const MAX_DIAS_ATESTADO = 186; // ~6 meses

/** Autor de uma ação (usuário autenticado). */
export interface AutorAcao {
  id?: string;
  nome?: string;
}

/** Dados para lançar um atestado. */
export interface LancarAtestadoInput {
  colaboradorId: string;
  inicio: Date;
  fim: Date;
  /** CID-10 informado; ignorado quando `semCid` é true. */
  cid?: string | null;
  /** Marca explícita de atestado SEM CID. */
  semCid?: boolean;
  observacao?: string | null;
}

/** Resultado do lançamento de um atestado. */
export interface ResultadoAtestado {
  atestadoId: string;
  dias: number;
  cid: string | null;
  semCid: boolean;
  /** Total de dias com o mesmo CID na janela do INSS (após este atestado). */
  totalDiasMesmoCid: number;
  /** true quando o total ultrapassa o limite do INSS (encaminhar ao INSS). */
  ultrapassaInss: boolean;
}

/** Atestado enriquecido para listagem. */
export interface AtestadoDetalhado {
  id: string;
  colaboradorId: string;
  nome: string;
  inicio: string;
  fim: string;
  dias: number;
  cid: string | null;
  cidDescricao: string | null;
  semCid: boolean;
  observacao: string | null;
  registradaPorNome: string | null;
  criadoEm: string;
}

/** Agrupamento por CID no histórico de um colaborador. */
export interface HistoricoCidItem {
  cid: string | null;
  cidDescricao: string | null;
  episodios: number;
  totalDias: number;
  /** Dias com esse CID na janela do INSS (60 dias até o último atestado). */
  totalDiasJanela: number;
  ultrapassaInss: boolean;
}

/** Formata uma data (UTC) como "dd/mm" para textos de aviso. */
function formatarDiaMes(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, '0');
  const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

const descricaoPorCid = new Map<string, string>(
  CID10.map((e) => [e.codigo, e.descricao]),
);

/**
 * Serviço de ATESTADOS médicos. Um atestado é o documento inteiro (período +
 * CID). Ao lançar, cria uma falta JUSTIFICADA (motivo ATESTADO_MEDICO, `aPrazo`)
 * em cada dia corrido do período, vinculada por `atestadoId` e carimbada com o
 * `cid` — para a escala/faltas do dia mostrarem "Atestado" e para somar dias
 * por CID (regra do INSS). A decisão pura fica em `atestados.domain`.
 */
@Injectable()
export class AtestadosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly validacaoData?: ValidacaoDataService,
    @Optional() private readonly cicloFolha?: CicloFolhaService,
  ) {}

  /** Autocompletar do CID-10 (busca por código ou descrição). */
  buscarCid(termo: string, limite = 20): EntradaCid[] {
    return buscarCidDominio(CID10, termo ?? '', limite);
  }

  /**
   * Lança um atestado: cria o documento e as faltas justificadas de cada dia
   * do período (convertendo faltas já existentes em vez de duplicar). Avalia a
   * regra do INSS e avisa a gestão se este atestado cruzar o limite.
   */
  async lancar(
    input: LancarAtestadoInput,
    autor: AutorAcao = {},
  ): Promise<ResultadoAtestado> {
    const d0 = inicioDoDia(input.inicio);
    const d1 = inicioDoDia(input.fim);
    if (d1.getTime() < d0.getTime()) {
      throw new PeriodoAtestadoInvalidoError(
        'A data final deve ser igual ou posterior à inicial.',
      );
    }
    const dias = contarDiasCorridos(d0, d1);
    if (dias > MAX_DIAS_ATESTADO) {
      throw new PeriodoAtestadoInvalidoError(
        `O período é muito longo (máx. ${MAX_DIAS_ATESTADO} dias).`,
      );
    }

    // CID: normaliza; exige CID ou a marca explícita "sem CID".
    const cid = normalizarCid(input.cid);
    const semCid = !cid && !!input.semCid;
    if (!cid && !semCid) {
      throw new CidObrigatorioError();
    }

    await this.validacaoData?.exigirDataPermitida(d0);
    await this.cicloFolha?.exigirCicloAberto(d0);

    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: input.colaboradorId },
      select: { nome: true },
    });

    // Regra do INSS: total do mesmo CID na janela ANTES e DEPOIS deste atestado.
    const episodiosExistentes = cid
      ? (
          await this.prisma.atestado.findMany({
            where: { colaboradorId: input.colaboradorId, cid },
            select: { cid: true, inicio: true, dias: true },
          })
        ).map((a) => ({ cid: a.cid, inicio: a.inicio, dias: a.dias }))
      : [];
    const totalAntes = avaliarRegraInss({
      episodios: episodiosExistentes,
      cid,
      referenciaFim: d1,
    }).totalDias;
    const avaliacaoDepois = avaliarRegraInss({
      episodios: [...episodiosExistentes, { cid, inicio: d0, dias }],
      cid,
      referenciaFim: d1,
    });

    // Faltas já existentes no período (converter em vez de duplicar).
    const existentes = await this.prisma.ausencia.findMany({
      where: {
        pessoaId: input.colaboradorId,
        data: { gte: d0, lte: d1 },
      },
      select: { id: true, data: true },
    });
    const idPorDia = new Map<number, string>();
    for (const a of existentes) {
      idPorDia.set(inicioDoDia(a.data).getTime(), a.id);
    }

    const UM_DIA_MS = 24 * 60 * 60 * 1000;
    const atestadoId = await this.prisma.$transaction(async (tx) => {
      const atestado = await tx.atestado.create({
        data: {
          colaboradorId: input.colaboradorId,
          inicio: d0,
          fim: d1,
          dias,
          cid,
          semCid,
          observacao: input.observacao ?? null,
          registradaPorId: autor.id ?? null,
          registradaPorNome: autor.nome ?? null,
        },
      });
      const faltaDados = {
        statusJustificativa: 'JUSTIFICADA' as const,
        motivoJustificativa: 'ATESTADO_MEDICO' as const,
        observacaoJustificativa: input.observacao ?? null,
        justificadaPorId: autor.id ?? null,
        justificadaPorNome: autor.nome ?? null,
        justificadaEm: new Date(),
        aPrazo: true,
        atestadoId: atestado.id,
        cid,
      };
      for (let t = d0.getTime(); t <= d1.getTime(); t += UM_DIA_MS) {
        const dia = new Date(t);
        const existId = idPorDia.get(t);
        if (existId) {
          await tx.ausencia.update({
            where: { id: existId },
            data: faltaDados,
          });
        } else {
          await tx.ausencia.create({
            data: {
              pessoaId: input.colaboradorId,
              colaboradorId: input.colaboradorId,
              data: dia,
              registradaPorId: autor.id ?? null,
              registradaPorNome: autor.nome ?? null,
              ...faltaDados,
            },
          });
        }
      }
      return atestado.id;
    });

    await this.avisarAtestado(colaborador?.nome ?? null, d0, d1, dias, cid);
    // Aviso do INSS só quando ESTE atestado cruzou o limite (evita repetir).
    if (cid && cruzouLimiteInss(totalAntes, avaliacaoDepois.totalDias)) {
      await this.avisarLimiteInss(
        colaborador?.nome ?? null,
        cid,
        avaliacaoDepois.totalDias,
        avaliacaoDepois.janelaDias,
      );
    }

    return {
      atestadoId,
      dias,
      cid,
      semCid,
      totalDiasMesmoCid: avaliacaoDepois.totalDias,
      ultrapassaInss: avaliacaoDepois.ultrapassaInss,
    };
  }

  /** Lista os atestados que intersectam o período, com nome e descrição do CID. */
  async listar(periodo: {
    inicio: Date;
    fim: Date;
  }): Promise<AtestadoDetalhado[]> {
    const atestados = await this.prisma.atestado.findMany({
      where: { inicio: { lte: periodo.fim }, fim: { gte: periodo.inicio } },
      orderBy: { inicio: 'desc' },
    });
    const ids = [...new Set(atestados.map((a) => a.colaboradorId))];
    const colaboradores = ids.length
      ? await this.prisma.colaborador.findMany({
          where: { id: { in: ids } },
          select: { id: true, nome: true },
        })
      : [];
    const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]));
    return atestados.map((a) => ({
      id: a.id,
      colaboradorId: a.colaboradorId,
      nome: nomePorId.get(a.colaboradorId) ?? a.colaboradorId,
      inicio: a.inicio.toISOString().slice(0, 10),
      fim: a.fim.toISOString().slice(0, 10),
      dias: a.dias,
      cid: a.cid,
      cidDescricao: a.cid ? (descricaoPorCid.get(a.cid) ?? null) : null,
      semCid: a.semCid,
      observacao: a.observacao,
      registradaPorNome: a.registradaPorNome,
      criadoEm: a.criadoEm.toISOString(),
    }));
  }

  /**
   * Histórico de atestados de um colaborador agrupado por CID, com o total de
   * dias, o total na janela do INSS e a bandeira de "ultrapassa o INSS".
   */
  async historicoColaborador(
    colaboradorId: string,
  ): Promise<HistoricoCidItem[]> {
    const atestados = await this.prisma.atestado.findMany({
      where: { colaboradorId },
      select: { cid: true, inicio: true, dias: true },
      orderBy: { inicio: 'desc' },
    });
    if (atestados.length === 0) return [];

    const porCid = new Map<
      string,
      {
        cid: string | null;
        episodios: number;
        totalDias: number;
        ultimoFim: Date;
      }
    >();
    for (const a of atestados) {
      const chave = a.cid ?? '__SEM_CID__';
      const atual = porCid.get(chave) ?? {
        cid: a.cid,
        episodios: 0,
        totalDias: 0,
        ultimoFim: a.inicio,
      };
      atual.episodios += 1;
      atual.totalDias += a.dias;
      if (a.inicio.getTime() > atual.ultimoFim.getTime())
        atual.ultimoFim = a.inicio;
      porCid.set(chave, atual);
    }

    const episodios = atestados.map((a) => ({
      cid: a.cid,
      inicio: a.inicio,
      dias: a.dias,
    }));
    return [...porCid.values()]
      .map((g) => {
        const avaliacao = g.cid
          ? avaliarRegraInss({
              episodios,
              cid: g.cid,
              referenciaFim: g.ultimoFim,
            })
          : { totalDias: 0, ultrapassaInss: false };
        return {
          cid: g.cid,
          cidDescricao: g.cid ? (descricaoPorCid.get(g.cid) ?? null) : null,
          episodios: g.episodios,
          totalDias: g.totalDias,
          totalDiasJanela: avaliacao.totalDias,
          ultrapassaInss: avaliacao.ultrapassaInss,
        };
      })
      .sort((a, b) => b.totalDias - a.totalDias);
  }

  /** Aviso único (a todos) do lançamento de um atestado. Best-effort. */
  private async avisarAtestado(
    nome: string | null,
    inicio: Date,
    fim: Date,
    dias: number,
    cid: string | null,
  ): Promise<void> {
    if (!this.notificacoes || !nome) return;
    try {
      const sufixoCid = cid ? ` · CID ${cid}` : ' · sem CID';
      await this.notificacoes.notificarTodos({
        titulo: '📄 Atestado lançado',
        mensagem: `${nome} com atestado de ${formatarDiaMes(inicio)} a ${formatarDiaMes(fim)} — ${dias} dia(s)${sufixoCid}.`,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir o registro.
    }
  }

  /** Aviso à gestão quando o mesmo CID cruza o limite do INSS. Best-effort. */
  private async avisarLimiteInss(
    nome: string | null,
    cid: string,
    totalDias: number,
    janelaDias: number,
  ): Promise<void> {
    if (!this.notificacoes || !nome) return;
    try {
      await this.notificacoes.notificarComPermissao('OPERADORES_AUSENCIAS', {
        titulo: '⚠️ Atestados: encaminhar ao INSS',
        mensagem: `${nome} já soma ${totalDias} dias de atestado com o mesmo CID (${cid}) em ${janelaDias} dias. Acima de 15 dias o afastamento deve ser encaminhado ao INSS (auxílio-doença).`,
      });
    } catch {
      // best-effort.
    }
  }

  /** Remove um atestado e as faltas diárias vinculadas (correção). */
  async remover(atestadoId: string): Promise<void> {
    const atestado = await this.prisma.atestado.findUnique({
      where: { id: atestadoId },
      select: { id: true, inicio: true },
    });
    if (!atestado) throw new AtestadoNaoEncontradoError();
    await this.cicloFolha?.exigirCicloAberto(atestado.inicio);
    await this.prisma.$transaction([
      this.prisma.ausencia.deleteMany({ where: { atestadoId } }),
      this.prisma.atestado.delete({ where: { id: atestadoId } }),
    ]);
  }
}
