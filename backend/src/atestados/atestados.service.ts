import { Injectable, Logger, Optional } from '@nestjs/common';
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
  podeExcluirAtestado,
} from './atestados.domain';
import {
  AtestadoNaoEncontradoError,
  AtestadoSobrepostoError,
  CidObrigatorioError,
  ExclusaoAtestadoNaoPermitidaError,
  PeriodoAtestadoInvalidoError,
} from './atestados.errors';
import { marcarPeriodoJustificado } from '../operadores/marcar-periodo-justificado';

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
  /**
   * Quantos dias deste atestado **voltam a ser falta** se ele for excluído (os
   * dias que já eram falta antes do atestado). Serve para a confirmação da
   * exclusão dizer exatamente o que vai acontecer.
   */
  diasQueVoltamAFalta: number;
}

/** Resultado da exclusão de um atestado (para a mensagem de confirmação). */
export interface ResultadoExclusaoAtestado {
  atestadoId: string;
  /** Nome do colaborador (quando a ficha ainda existe). */
  nome: string | null;
  inicio: string;
  fim: string;
  cid: string | null;
  /** Dias que foram apagados (existiam só por causa do atestado). */
  diasRemovidos: number;
  /** Dias que voltaram a ser falta PENDENTE (já eram falta antes). */
  diasVoltaramAFalta: number;
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
  private readonly logger = new Logger(AtestadosService.name);

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

    // Impede dois atestados SOBREPOSTOS do mesmo colaborador: um dia só pode
    // pertencer a um atestado (senão o vínculo `atestadoId` da falta do dia e a
    // contagem por CID do INSS ficam ambíguos, e remover um deixa dias órfãos).
    // O `where` (inicio <= fim novo E fim >= início novo) é a própria condição
    // de interseção de períodos, resolvida pelo índice (inicio, fim).
    const sobreposto = await this.prisma.atestado.findFirst({
      where: {
        colaboradorId: input.colaboradorId,
        inicio: { lte: d1 },
        fim: { gte: d0 },
      },
      select: { id: true },
    });
    if (sobreposto) throw new AtestadoSobrepostoError();

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

    // Faltas já existentes no período (converter em vez de duplicar). Casa AS
    // DUAS chaves: um FISCAL bate ponto pela identidade de Fiscal, então a sua
    // falta automática é gravada com `pessoaId = Fiscal.id` e a ficha em
    // `colaboradorId`. Buscar só por `pessoaId = colaboradorId` (o que se fazia
    // antes) não encontrava essa linha, e o atestado CRIAVA uma segunda — o
    // fiscal ficava com a falta e o atestado no mesmo dia, e a card de falta
    // sobrevivia na tela.
    const existentes = await this.prisma.ausencia.findMany({
      where: {
        OR: [
          { pessoaId: input.colaboradorId },
          { colaboradorId: input.colaboradorId },
        ],
        data: { gte: d0, lte: d1 },
      },
      select: { id: true, data: true },
    });
    const idPorDia = new Map<number, string>();
    for (const a of existentes) {
      idPorDia.set(inicioDoDia(a.data).getTime(), a.id);
    }

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
      // Cada dia do período vira uma falta JUSTIFICADA identificada como
      // ATESTADO (motivo `ATESTADO_MEDICO`, `aPrazo`), carimbada com o vínculo
      // do atestado e o CID. Usa a MESMA primitiva da ausência a prazo
      // (`marcarPeriodoJustificado`) — inclusive gravando `colaboradorId` também
      // ao converter uma falta já existente.
      await marcarPeriodoJustificado(tx, {
        pessoaId: input.colaboradorId,
        inicio: d0,
        fim: d1,
        autor,
        idPorDia,
        dados: {
          colaboradorId: input.colaboradorId,
          statusJustificativa: 'JUSTIFICADA',
          motivoJustificativa: 'ATESTADO_MEDICO',
          observacaoJustificativa: input.observacao ?? null,
          justificadaPorId: autor.id ?? null,
          justificadaPorNome: autor.nome ?? null,
          justificadaEm: new Date(),
          aPrazo: true,
          atestadoId: atestado.id,
          cid,
        },
      });
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
    // Quantos dias de cada atestado voltariam a ser falta se ele fosse
    // excluído: os que já eram falta antes da conversão (`faltaAnterior`).
    // Uma única consulta agregada para toda a lista.
    const grupos = atestados.length
      ? await this.prisma.ausencia.groupBy({
          by: ['atestadoId'],
          where: {
            atestadoId: { in: atestados.map((a) => a.id) },
            faltaAnterior: true,
          },
          _count: { _all: true },
        })
      : [];
    const voltamPorAtestado = new Map(
      grupos.map((g) => [g.atestadoId ?? '', g._count._all]),
    );
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
      diasQueVoltamAFalta: voltamPorAtestado.get(a.id) ?? 0,
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

  /**
   * Remove um atestado lançado por engano, junto das faltas diárias vinculadas.
   *
   * **Alçada:** só gerente, supervisor ou administrador (`podeExcluirAtestado`).
   * Lançar é rotina da escala e o fiscal também lança, mas excluir é uma
   * correção destrutiva e irreversível.
   *
   * **Bloqueio:** se o ciclo de folha (26→25) do início do atestado já estiver
   * fechado, a exclusão é recusada — o mês já foi apurado.
   *
   * **Efeito:** os dias que JÁ ERAM FALTA antes do atestado voltam a ser falta
   * PENDENTE (a ocorrência que o gestor ainda precisa tratar não desaparece); os
   * dias criados pelo atestado são apagados; o documento é apagado. Avisa a
   * escala com o nome de quem excluiu — o registro do atestado deixa de existir,
   * então o aviso é a trilha de auditoria da exclusão.
   */
  async remover(
    atestadoId: string,
    perfil?: string,
    autor: AutorAcao = {},
  ): Promise<ResultadoExclusaoAtestado> {
    if (!podeExcluirAtestado(perfil)) {
      throw new ExclusaoAtestadoNaoPermitidaError();
    }
    const atestado = await this.prisma.atestado.findUnique({
      where: { id: atestadoId },
      select: {
        id: true,
        colaboradorId: true,
        inicio: true,
        fim: true,
        dias: true,
        cid: true,
      },
    });
    if (!atestado) throw new AtestadoNaoEncontradoError();
    await this.cicloFolha?.exigirCicloAberto(atestado.inicio);

    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: atestado.colaboradorId },
      select: { nome: true },
    });

    const contagens = await this.prisma.$transaction(async (tx) => {
      // Dias que JÁ ERAM FALTA antes do atestado voltam a ser falta pendente,
      // em vez de desaparecer. Antes, remover um atestado apagava também a falta
      // que existia antes dele — o dia ficava limpo como se nada tivesse
      // acontecido, e a ocorrência que o gestor ainda precisava tratar sumia.
      const voltaram = await tx.ausencia.updateMany({
        where: { atestadoId, faltaAnterior: true },
        data: {
          atestadoId: null,
          cid: null,
          aPrazo: false,
          faltaAnterior: false,
          statusJustificativa: 'PENDENTE',
          motivoJustificativa: null,
          observacaoJustificativa: null,
          justificadaPorId: null,
          justificadaPorNome: null,
          justificadaEm: null,
        },
      });
      // Os demais dias foram CRIADOS pelo atestado: saem com ele. Os de cima já
      // ficaram com `atestadoId` nulo, então não entram nesta remoção.
      const removidos = await tx.ausencia.deleteMany({ where: { atestadoId } });
      await tx.atestado.delete({ where: { id: atestadoId } });
      return {
        diasVoltaramAFalta: voltaram.count,
        diasRemovidos: removidos.count,
      };
    });

    const resultado: ResultadoExclusaoAtestado = {
      atestadoId,
      nome: colaborador?.nome ?? null,
      inicio: atestado.inicio.toISOString().slice(0, 10),
      fim: atestado.fim.toISOString().slice(0, 10),
      cid: atestado.cid,
      ...contagens,
    };

    this.logger.log(
      `Atestado excluído: ${resultado.nome ?? atestado.colaboradorId} ` +
        `(${resultado.inicio} a ${resultado.fim}) por ${autor.nome ?? autor.id ?? 'desconhecido'} — ` +
        `${contagens.diasRemovidos} dia(s) apagado(s), ${contagens.diasVoltaramAFalta} voltaram a falta.`,
    );
    await this.avisarAtestadoExcluido(resultado, autor);
    return resultado;
  }

  /**
   * Aviso da EXCLUSÃO de um atestado. Best-effort, mas importante: a linha do
   * atestado é apagada fisicamente, então este aviso é o que registra **quem**
   * excluiu e **quando**.
   */
  private async avisarAtestadoExcluido(
    resultado: ResultadoExclusaoAtestado,
    autor: AutorAcao,
  ): Promise<void> {
    if (!this.notificacoes || !resultado.nome) return;
    try {
      const de = formatarDiaMes(new Date(`${resultado.inicio}T00:00:00.000Z`));
      const ate = formatarDiaMes(new Date(`${resultado.fim}T00:00:00.000Z`));
      const porQuem = autor.nome ? ` por ${autor.nome}` : '';
      const voltaram =
        resultado.diasVoltaramAFalta > 0
          ? ` ${resultado.diasVoltaramAFalta} dia(s) voltaram a ser falta pendente.`
          : '';
      await this.notificacoes.notificarComPermissao('OPERADORES_AUSENCIAS', {
        titulo: '🗑️ Atestado excluído',
        mensagem:
          `Atestado de ${resultado.nome} (${de} a ${ate}) excluído${porQuem}.` +
          voltaram,
      });
    } catch {
      // best-effort: o aviso nunca deve impedir a correção.
    }
  }
}
