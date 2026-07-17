import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoContratoJornada } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegrasContrato, REGRAS_PADRAO } from '../ponto/ponto.domain';
import { regrasContratoDeModelo } from './tipos-contrato.adapter';
import {
  AtualizarTipoContratoDto,
  CriarTipoContratoDto,
} from './dto/tipos-contrato.dto';

/** Campos numéricos das regras (para validar a coerência dos limites). */
interface ParametrosRegra {
  cargaBaseMinPorDia: number[];
  diasComAdicional100: number[];
  intervaloMinimoMin: number;
  intervaloMaximoMin: number;
  riscoTac1h30Min: number;
  riscoTac1h40Min: number;
  limiteExtrasMin: number;
}

/**
 * Catálogo de TIPOS DE CONTRATO de jornada (data-driven). A gestão cria, edita,
 * ativa/desativa e remove contratos pela UI — sem tocar no código. Cada linha
 * guarda os parâmetros de `RegrasContrato` (em minutos); `regrasDoContrato`
 * converte para as regras que o cálculo da jornada consome.
 */
@Injectable()
export class TiposContratoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os contratos (só ativos por padrão; o padrão vem primeiro). */
  async listar(incluirInativos = false): Promise<TipoContratoJornada[]> {
    return this.prisma.tipoContratoJornada.findMany({
      where: incluirInativos ? {} : { ativo: true },
      orderBy: [{ padrao: 'desc' }, { nome: 'asc' }],
    });
  }

  /** Cria um novo tipo de contrato. */
  async criar(dto: CriarTipoContratoDto): Promise<TipoContratoJornada> {
    this.validarCoerencia(dto);
    await this.exigirNomeLivre(dto.nome.trim());
    return this.prisma.tipoContratoJornada.create({
      data: {
        nome: dto.nome.trim(),
        descricao: dto.descricao?.trim() || null,
        ativo: dto.ativo ?? true,
        // Um contrato criado pela UI nunca vira "padrão" automaticamente — o
        // padrão é o vigente semeado na migração (fallback do cálculo).
        padrao: false,
        cargaBaseMinPorDia: dto.cargaBaseMinPorDia,
        diasComAdicional100: dto.diasComAdicional100,
        maxTrabalhoSemIntervaloMin: dto.maxTrabalhoSemIntervaloMin,
        intervaloMinimoMin: dto.intervaloMinimoMin,
        intervaloMaximoMin: dto.intervaloMaximoMin,
        limiteExtrasMin: dto.limiteExtrasMin,
        riscoTac1h30Min: dto.riscoTac1h30Min,
        riscoTac1h40Min: dto.riscoTac1h40Min,
        intervaloMinimoEntreBatidasMin: dto.intervaloMinimoEntreBatidasMin ?? 2,
      },
    });
  }

  /** Edita um tipo de contrato existente. */
  async atualizar(
    id: string,
    dto: AtualizarTipoContratoDto,
  ): Promise<TipoContratoJornada> {
    const atual = await this.obterOuFalhar(id);
    // Valida a coerência sobre o estado RESULTANTE (atual + alterações).
    this.validarCoerencia({
      cargaBaseMinPorDia: dto.cargaBaseMinPorDia ?? atual.cargaBaseMinPorDia,
      diasComAdicional100: dto.diasComAdicional100 ?? atual.diasComAdicional100,
      intervaloMinimoMin: dto.intervaloMinimoMin ?? atual.intervaloMinimoMin,
      intervaloMaximoMin: dto.intervaloMaximoMin ?? atual.intervaloMaximoMin,
      riscoTac1h30Min: dto.riscoTac1h30Min ?? atual.riscoTac1h30Min,
      riscoTac1h40Min: dto.riscoTac1h40Min ?? atual.riscoTac1h40Min,
      limiteExtrasMin: dto.limiteExtrasMin ?? atual.limiteExtrasMin,
    });
    const nome = dto.nome?.trim();
    if (nome && nome !== atual.nome) await this.exigirNomeLivre(nome);

    const data: Prisma.TipoContratoJornadaUpdateInput = {
      ...(nome ? { nome } : {}),
      ...(dto.descricao !== undefined
        ? { descricao: dto.descricao?.trim() || null }
        : {}),
      ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      ...(dto.cargaBaseMinPorDia !== undefined
        ? { cargaBaseMinPorDia: dto.cargaBaseMinPorDia }
        : {}),
      ...(dto.diasComAdicional100 !== undefined
        ? { diasComAdicional100: dto.diasComAdicional100 }
        : {}),
      ...(dto.maxTrabalhoSemIntervaloMin !== undefined
        ? { maxTrabalhoSemIntervaloMin: dto.maxTrabalhoSemIntervaloMin }
        : {}),
      ...(dto.intervaloMinimoMin !== undefined
        ? { intervaloMinimoMin: dto.intervaloMinimoMin }
        : {}),
      ...(dto.intervaloMaximoMin !== undefined
        ? { intervaloMaximoMin: dto.intervaloMaximoMin }
        : {}),
      ...(dto.limiteExtrasMin !== undefined
        ? { limiteExtrasMin: dto.limiteExtrasMin }
        : {}),
      ...(dto.riscoTac1h30Min !== undefined
        ? { riscoTac1h30Min: dto.riscoTac1h30Min }
        : {}),
      ...(dto.riscoTac1h40Min !== undefined
        ? { riscoTac1h40Min: dto.riscoTac1h40Min }
        : {}),
      ...(dto.intervaloMinimoEntreBatidasMin !== undefined
        ? { intervaloMinimoEntreBatidasMin: dto.intervaloMinimoEntreBatidasMin }
        : {}),
    };
    // Desativar o padrão é proibido (é o fallback do cálculo).
    if (dto.ativo === false && atual.padrao) {
      throw new BadRequestException(
        'Não é possível desativar o contrato padrão.',
      );
    }
    return this.prisma.tipoContratoJornada.update({ where: { id }, data });
  }

  /** Ativa ou desativa um contrato. O padrão não pode ser desativado. */
  async definirAtivo(id: string, ativo: boolean): Promise<TipoContratoJornada> {
    const atual = await this.obterOuFalhar(id);
    if (!ativo && atual.padrao) {
      throw new BadRequestException(
        'Não é possível desativar o contrato padrão.',
      );
    }
    return this.prisma.tipoContratoJornada.update({
      where: { id },
      data: { ativo },
    });
  }

  /** Remove um contrato. O padrão não pode ser removido. */
  async remover(id: string): Promise<void> {
    const atual = await this.obterOuFalhar(id);
    if (atual.padrao) {
      throw new BadRequestException(
        'Não é possível excluir o contrato padrão.',
      );
    }
    await this.prisma.tipoContratoJornada.delete({ where: { id } });
  }

  /**
   * Regras de jornada de um contrato pelo id (ou o padrão quando ausente/
   * desconhecido). Ponte para o cálculo da jornada (usada no cabeamento por
   * colaborador). Cai no `REGRAS_PADRAO` do código se nem o padrão existir.
   */
  async regrasDoContrato(id?: string | null): Promise<RegrasContrato> {
    const modelo = id
      ? await this.prisma.tipoContratoJornada.findUnique({ where: { id } })
      : await this.contratoPadrao();
    const efetivo = modelo ?? (await this.contratoPadrao());
    return efetivo ? regrasContratoDeModelo(efetivo) : REGRAS_PADRAO;
  }

  private async contratoPadrao(): Promise<TipoContratoJornada | null> {
    return this.prisma.tipoContratoJornada.findFirst({
      where: { padrao: true },
    });
  }

  private async obterOuFalhar(id: string): Promise<TipoContratoJornada> {
    const t = await this.prisma.tipoContratoJornada.findUnique({
      where: { id },
    });
    if (!t) throw new NotFoundException('Tipo de contrato não encontrado.');
    return t;
  }

  private async exigirNomeLivre(nome: string): Promise<void> {
    const existe = await this.prisma.tipoContratoJornada.findUnique({
      where: { nome },
    });
    if (existe) {
      throw new ConflictException('Já existe um contrato com esse nome.');
    }
  }

  /** Valida a coerência dos limites (as faixas do class-validator já cobrem o resto). */
  private validarCoerencia(r: ParametrosRegra): void {
    if (r.cargaBaseMinPorDia.length !== 7) {
      throw new BadRequestException(
        'A carga base deve ter 7 valores (domingo a sábado).',
      );
    }
    if (r.diasComAdicional100.some((d) => d < 0 || d > 6)) {
      throw new BadRequestException(
        'Os dias com adicional de 100% devem estar entre 0 (domingo) e 6 (sábado).',
      );
    }
    if (r.intervaloMinimoMin >= r.intervaloMaximoMin) {
      throw new BadRequestException(
        'O intervalo mínimo deve ser menor que o máximo.',
      );
    }
    if (!(
      r.riscoTac1h30Min <= r.riscoTac1h40Min &&
      r.riscoTac1h40Min <= r.limiteExtrasMin
    )) {
      throw new BadRequestException(
        'Os limites devem crescer: risco 1h30 ≤ risco 1h40 ≤ limite de extras.',
      );
    }
  }
}
