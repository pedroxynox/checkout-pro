import { Injectable } from '@nestjs/common';
import { DecisaoContrato, MarcoContrato as MarcoPrisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import {
  AlertaContrato,
  DecisaoRegistro,
  EstadoContrato,
  EtiquetaContrato,
  MarcoContrato,
  ResultadoDecisao,
  ResumoCarteira,
  ResumoContrato,
  UrgenciaContrato,
  avaliarAlerta,
  classificarUrgencia,
  derivarResumoContrato,
  podeDecidirMarco,
  resumirCarteira,
} from './contratos.domain';
import {
  AdmissaoNaoDefinidaError,
  ColaboradorContratoNaoEncontradoError,
  DadosContratoInvalidosError,
  DecisaoMarcoInvalidaError,
} from './contratos.errors';

/** Autor de uma decisão (usuário autenticado). */
export interface AutorDecisao {
  id?: string;
  nome?: string;
}

/** Card de contrato exibido na seção (por colaborador). */
export interface ContratoCard {
  colaboradorId: string;
  nome: string;
  matricula: string;
  dataAdmissao: string | null;
  diasDeCasa: number;
  estado: EstadoContrato;
  etiqueta: EtiquetaContrato;
  urgencia: UrgenciaContrato;
  proximoMarco: MarcoContrato | null;
  dataProximoMarco: string | null;
  diasParaProximoMarco: number | null;
  efetivadoPorDecurso: boolean;
  decisao45: ResultadoDecisao | null;
  decisao90: ResultadoDecisao | null;
}

/** Seção "Tempo de casa / Contrato" do perfil do colaborador (informativa). */
export interface ResumoContratoColaborador {
  temAdmissao: boolean;
  dataAdmissao: string | null;
  diasDeCasa: number;
  estado: EstadoContrato;
  etiqueta: EtiquetaContrato;
  dataMarco45: string | null;
  dataMarco90: string | null;
  proximoMarco: MarcoContrato | null;
  dataProximoMarco: string | null;
  diasParaProximoMarco: number | null;
  efetivadoPorDecurso: boolean;
  decisao45: ResultadoDecisao | null;
  decisao90: ResultadoDecisao | null;
}

/** Item de alerta do dia (consumido pelo cron). */
export interface AlertaDoDia {
  colaboradorId: string;
  nome: string;
  alerta: AlertaContrato;
}

/** Filtros da listagem de cards. */
export interface ListarContratosFiltros {
  busca?: string;
  etiqueta?: string;
  incluirSemAdmissao?: boolean;
}

/** Prioridade de ordenação por urgência (maior = mais no topo). */
const PRIORIDADE_URGENCIA: Record<UrgenciaContrato, number> = {
  CRITICO: 3,
  ATENCAO: 2,
  OK: 1,
  INATIVO: 0,
};

/**
 * Serviço dos Contratos de experiência. Concentra os efeitos colaterais
 * (Prisma) e delega TODA a decisão ao domínio puro (`contratos.domain`).
 *
 * O escopo do módulo são os **operadores** (contrato de experiência aplica-se
 * às novas contratações da frente de caixa). O estado do contrato nunca é
 * gravado: é sempre derivado de `dataAdmissao` + decisões.
 */
@Injectable()
export class ContratosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista os cards de contrato dos operadores. Por padrão inclui também os que
   * ainda não têm data de admissão (bucket "definir admissão"), para o gestor
   * completá-la; `incluirSemAdmissao=false` os oculta. Ordena por urgência e,
   * dentro dela, pelo marco mais próximo e pelo nome.
   */
  async listar(
    filtros: ListarContratosFiltros = {},
    hoje: Date = new Date(),
  ): Promise<ContratoCard[]> {
    const colaboradores = await this.prisma.colaborador.findMany({
      where: {
        funcao: 'OPERADOR',
        ativo: true,
        ...(filtros.busca && filtros.busca.trim()
          ? {
              OR: [
                {
                  nome: { contains: filtros.busca.trim(), mode: 'insensitive' },
                },
                { matricula: { contains: filtros.busca.trim() } },
              ],
            }
          : {}),
      },
      select: { id: true, nome: true, matricula: true, dataAdmissao: true },
      orderBy: { nome: 'asc' },
    });

    const decisoesPorColaborador = await this.decisoesPorColaborador(
      colaboradores.map((c) => c.id),
    );

    let cards = colaboradores.map((c) => {
      const resumo = derivarResumoContrato(
        {
          dataAdmissao: c.dataAdmissao,
          decisoes: decisoesPorColaborador.get(c.id) ?? [],
        },
        hoje,
      );
      return this.montarCard(c.id, c.nome, c.matricula, resumo);
    });

    if (filtros.incluirSemAdmissao === false) {
      cards = cards.filter((c) => c.estado !== 'SEM_ADMISSAO');
    }
    if (filtros.etiqueta) {
      cards = cards.filter((c) => c.etiqueta === filtros.etiqueta);
    }

    return cards.sort(
      (a, b) =>
        PRIORIDADE_URGENCIA[b.urgencia] - PRIORIDADE_URGENCIA[a.urgencia] ||
        (a.diasParaProximoMarco ?? Number.POSITIVE_INFINITY) -
          (b.diasParaProximoMarco ?? Number.POSITIVE_INFINITY) ||
        a.nome.localeCompare(b.nome),
    );
  }

  /** Contagens agregadas para o resumo do topo da seção. */
  async resumo(hoje: Date = new Date()): Promise<ResumoCarteira> {
    const cards = await this.listar({}, hoje);
    // Reconstrói os ResumoContrato mínimos para o agregador puro.
    const resumos: ResumoContrato[] = cards.map((c) => ({
      estado: c.estado,
      etiqueta: c.etiqueta,
      diasDeCasa: c.diasDeCasa,
      dataAdmissao: c.dataAdmissao ? new Date(c.dataAdmissao) : null,
      dataMarco45: null,
      dataMarco90: null,
      proximoMarco: c.proximoMarco,
      dataProximoMarco: c.dataProximoMarco
        ? new Date(c.dataProximoMarco)
        : null,
      diasParaProximoMarco: c.diasParaProximoMarco,
      efetivadoPorDecurso: c.efetivadoPorDecurso,
      decisao45: c.decisao45,
      decisao90: c.decisao90,
    }));
    return resumirCarteira(resumos);
  }

  /**
   * Define/atualiza a data de admissão de um colaborador. NÃO aplica o guard de
   * Data_Inicial_Sistema: admissões históricas (anteriores ao início do sistema)
   * são legítimas. Valida apenas que a data é válida e que o colaborador existe.
   */
  async definirAdmissao(
    colaboradorId: string,
    dataAdmissaoISO: string,
  ): Promise<ContratoCard> {
    const data = inicioDoDia(new Date(dataAdmissaoISO));
    if (Number.isNaN(data.getTime())) {
      throw new DadosContratoInvalidosError('Data de admissão inválida.');
    }
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, nome: true, matricula: true },
    });
    if (!colaborador) throw new ColaboradorContratoNaoEncontradoError();

    await this.prisma.colaborador.update({
      where: { id: colaboradorId },
      data: { dataAdmissao: data },
    });
    return this.cardDoColaborador(colaboradorId);
  }

  /**
   * Registra (ou regrava) a decisão de um marco. Exige data de admissão e que a
   * transição seja válida (marco de 90 só após aprovar o de 45; nada após uma
   * reprovação). Idempotente por (colaborador, marco) via upsert, com auditoria.
   */
  async registrarDecisao(
    colaboradorId: string,
    marco: MarcoContrato,
    resultado: ResultadoDecisao,
    autor: AutorDecisao = {},
    observacao?: string,
  ): Promise<ContratoCard> {
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, dataAdmissao: true },
    });
    if (!colaborador) throw new ColaboradorContratoNaoEncontradoError();
    if (!colaborador.dataAdmissao) throw new AdmissaoNaoDefinidaError();

    const decisoes =
      (await this.decisoesPorColaborador([colaboradorId])).get(colaboradorId) ??
      [];
    if (!podeDecidirMarco(marco, decisoes)) {
      throw new DecisaoMarcoInvalidaError();
    }

    await this.prisma.decisaoContrato.upsert({
      where: {
        colaboradorId_marco: {
          colaboradorId,
          marco: marco as MarcoPrisma,
        },
      },
      create: {
        colaboradorId,
        marco: marco as MarcoPrisma,
        resultado,
        decididoPorId: autor.id ?? null,
        decididoPorNome: autor.nome ?? null,
        observacao: observacao ?? null,
      },
      update: {
        resultado,
        decididoPorId: autor.id ?? null,
        decididoPorNome: autor.nome ?? null,
        observacao: observacao ?? null,
      },
    });
    return this.cardDoColaborador(colaboradorId);
  }

  /**
   * Resumo do contrato de um colaborador para o perfil (seção "Tempo de casa").
   * Puramente informativo — não afeta o score.
   */
  async resumoDoColaborador(
    colaboradorId: string,
    hoje: Date = new Date(),
  ): Promise<ResumoContratoColaborador> {
    const colaborador = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, dataAdmissao: true },
    });
    const decisoes =
      (await this.decisoesPorColaborador([colaboradorId])).get(colaboradorId) ??
      [];
    const resumo = derivarResumoContrato(
      { dataAdmissao: colaborador?.dataAdmissao ?? null, decisoes },
      hoje,
    );
    return {
      temAdmissao: !!colaborador?.dataAdmissao,
      dataAdmissao: iso(resumo.dataAdmissao),
      diasDeCasa: resumo.diasDeCasa,
      estado: resumo.estado,
      etiqueta: resumo.etiqueta,
      dataMarco45: iso(resumo.dataMarco45),
      dataMarco90: iso(resumo.dataMarco90),
      proximoMarco: resumo.proximoMarco,
      dataProximoMarco: iso(resumo.dataProximoMarco),
      diasParaProximoMarco: resumo.diasParaProximoMarco,
      efetivadoPorDecurso: resumo.efetivadoPorDecurso,
      decisao45: resumo.decisao45,
      decisao90: resumo.decisao90,
    };
  }

  /**
   * Avalia os alertas do dia para todos os operadores com admissão definida.
   * Consumido pelo cron; não envia nada (efeito fica no cron).
   */
  async avaliarAlertasDoDia(hoje: Date = new Date()): Promise<AlertaDoDia[]> {
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { funcao: 'OPERADOR', ativo: true, dataAdmissao: { not: null } },
      select: { id: true, nome: true, dataAdmissao: true },
    });
    if (colaboradores.length === 0) return [];

    const decisoesPorColaborador = await this.decisoesPorColaborador(
      colaboradores.map((c) => c.id),
    );

    const alertas: AlertaDoDia[] = [];
    for (const c of colaboradores) {
      const resumo = derivarResumoContrato(
        {
          dataAdmissao: c.dataAdmissao,
          decisoes: decisoesPorColaborador.get(c.id) ?? [],
        },
        hoje,
      );
      const alerta = avaliarAlerta(resumo);
      if (alerta) alertas.push({ colaboradorId: c.id, nome: c.nome, alerta });
    }
    return alertas;
  }

  // -------------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------------

  /** Card recalculado de um colaborador (após uma mutação). */
  private async cardDoColaborador(
    colaboradorId: string,
  ): Promise<ContratoCard> {
    const c = await this.prisma.colaborador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, nome: true, matricula: true, dataAdmissao: true },
    });
    if (!c) throw new ColaboradorContratoNaoEncontradoError();
    const decisoes =
      (await this.decisoesPorColaborador([colaboradorId])).get(colaboradorId) ??
      [];
    const resumo = derivarResumoContrato(
      { dataAdmissao: c.dataAdmissao, decisoes },
      new Date(),
    );
    return this.montarCard(c.id, c.nome, c.matricula, resumo);
  }

  /** Monta o DTO do card a partir do resumo derivado. */
  private montarCard(
    colaboradorId: string,
    nome: string,
    matricula: string,
    resumo: ResumoContrato,
  ): ContratoCard {
    return {
      colaboradorId,
      nome,
      matricula,
      dataAdmissao: iso(resumo.dataAdmissao),
      diasDeCasa: resumo.diasDeCasa,
      estado: resumo.estado,
      etiqueta: resumo.etiqueta,
      urgencia: classificarUrgencia(resumo),
      proximoMarco: resumo.proximoMarco,
      dataProximoMarco: iso(resumo.dataProximoMarco),
      diasParaProximoMarco: resumo.diasParaProximoMarco,
      efetivadoPorDecurso: resumo.efetivadoPorDecurso,
      decisao45: resumo.decisao45,
      decisao90: resumo.decisao90,
    };
  }

  /** Mapa colaboradorId → decisões (formato do domínio). */
  private async decisoesPorColaborador(
    ids: string[],
  ): Promise<Map<string, DecisaoRegistro[]>> {
    const out = new Map<string, DecisaoRegistro[]>();
    if (ids.length === 0) return out;
    const linhas: DecisaoContrato[] =
      await this.prisma.decisaoContrato.findMany({
        where: { colaboradorId: { in: ids } },
      });
    for (const l of linhas) {
      const arr = out.get(l.colaboradorId) ?? [];
      arr.push({
        marco: l.marco as MarcoContrato,
        resultado: l.resultado as ResultadoDecisao,
      });
      out.set(l.colaboradorId, arr);
    }
    return out;
  }
}

/** Formata uma data (ou null) como "yyyy-mm-dd". */
function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
