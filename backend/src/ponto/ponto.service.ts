import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BatidaPonto, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDoDia } from '../common/datas';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import {
  type EtapaAlertaTac,
  StatusJornadaPonto,
  TipoBatida,
  calcularJornadaDia,
  classificarBatidas,
  etapaAlertaTac,
  statusFiscalDeTipoBatida,
} from './ponto.domain';
import { FiscaisService } from '../fiscais/fiscais.service';
import { StatusFiscal } from '../fiscais/fiscais.domain';
import { EditarBatidaDto, RegistrarBatidaDto } from './dto/ponto.dto';
import { PontoOcrService } from './ponto-ocr.service';
import { FUNCOES_PONTO_NAO_FISCAL } from './pessoas-ponto';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { FeriadosService } from '../feriados/feriados.service';

// As batidas são gravadas com a HORA DO COMPROVANTE (hora de parede de Brasília)
// rotulada como UTC (ex.: "09:00" → "...T09:00:00Z"). Para medir o segmento
// "em curso" (quando falta a próxima batida) o "agora" precisa estar na MESMA
// referência de hora de parede de Brasília — senão o relógio conta 3h a mais
// (fuso UTC−3). O Brasil não tem horário de verão desde 2019, então o
// deslocamento é fixo.
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;
function agoraNaBrasilia(): Date {
  return new Date(Date.now() + OFFSET_BRASILIA_MS);
}

/**
 * Sentido inverso do offset acima: a hora da batida está em Brasília rotulada
 * como Z, então somamos 3h para obter o instante em UTC real. Usado na ponte
 * batidas → status do fiscal, cujo `calcularJornada` usa `new Date()` real.
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
  /** Ficha do Cadastro de Colaboradores (para não-fiscais); null p/ fiscais. */
  colaboradorId?: string | null;
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
  /**
   * Anti-spam dos avisos de risco/TAC. Cada etapa é enviada no máximo uma vez
   * por pessoa/dia; chaves diferentes permitem a escalada 1h30 → 1h40 → TAC.
   *
   * A dedup DEFINITIVA é a tabela `AlertaTacEnviado` (índice único por
   * pessoa/dia/etapa), que sobrevive a reinícios e coordena múltiplas
   * instâncias. Estes dois conjuntos são apenas um cache em processo:
   * `alertasTacAvisados` evita ir ao banco quando a etapa já foi confirmada
   * nesta instância; `alertasTacEmEnvio` impede envio duplicado enquanto a
   * mesma etapa está sendo processada (batida e cron ao mesmo tempo).
   */
  private readonly alertasTacAvisados = new Set<string>();
  private readonly alertasTacEmEnvio = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    // Ponte batidas → status do fiscal. Opcional para não quebrar testes
    // unitários que exercitam só a persistência das batidas.
    @Optional() private readonly fiscais?: FiscaisService,
    // Memória do leitor (aprende "nome lido → pessoa"). Opcional pelo mesmo
    // motivo: testes unitários de persistência não precisam dela.
    @Optional() private readonly ocr?: PontoOcrService,
    // Aviso de TAC (supervisão/gerência) e feriados. Opcionais: os testes de
    // persistência das batidas não precisam deles.
    @Optional() private readonly notificacoes?: NotificacoesService,
    @Optional() private readonly feriados?: FeriadosService,
  ) {}

  /**
   * Busca pessoas por nome para escolher de quem é o comprovante: fiscais (da
   * tabela Fiscal) + colaboradores não-fiscais ativos (operadores/supervisores)
   * do Cadastro de Colaboradores. Gerentes e desligados ficam de fora.
   */
  async buscarPessoas(busca?: string): Promise<PessoaPonto[]> {
    const termo = busca?.trim();
    const whereFiscal: Prisma.FiscalWhereInput = termo
      ? { nome: { contains: termo, mode: 'insensitive' } }
      : {};
    const whereColaborador: Prisma.ColaboradorWhereInput = {
      ativo: true,
      funcao: { in: FUNCOES_PONTO_NAO_FISCAL },
      ...(termo ? { nome: { contains: termo, mode: 'insensitive' } } : {}),
    };

    const [fiscais, colaboradores] = await Promise.all([
      this.prisma.fiscal.findMany({
        where: whereFiscal,
        orderBy: { nome: 'asc' },
        take: 20,
      }),
      this.prisma.colaborador.findMany({
        where: whereColaborador,
        orderBy: { nome: 'asc' },
        take: 20,
      }),
    ]);

    const pessoas: PessoaPonto[] = [
      ...fiscais.map((f) => ({
        id: f.id,
        nome: f.nome,
        tipoPessoa: 'FISCAL' as const,
        colaboradorId: null,
      })),
      ...colaboradores.map((c) => ({
        id: c.id,
        nome: c.nome,
        tipoPessoa: 'OPERADOR' as const,
        colaboradorId: c.id,
      })),
    ];
    return pessoas.sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 20);
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
        confianca: dto.confianca ?? null,
        comprovanteUrl: dto.comprovanteUrl ?? null,
        registradoPor: usuario.sub,
        registradoPorNome: usuario.nome ?? null,
      },
    });
    // Aprende o vínculo "nome lido → pessoa" quando a batida veio do leitor,
    // para reconhecer a pessoa na hora nas próximas leituras. Best-effort: uma
    // falha aqui não deve impedir o registro da batida.
    if (dto.origem === 'LEITOR' && dto.nomeLido) {
      await this.aprenderAlias(dto, tipoPessoa);
    }
    await this.reclassificar(dto.pessoaId, dia);
    await this.sincronizarStatusFiscal(dto.pessoaId, tipoPessoa, dia);
    const resposta = await this.jornadaDoDia(dto.pessoaId, tipoPessoa, dia);
    // Avisa a supervisão/gerência ao entrar em risco de TAC ou em TAC.
    await this.avisarAlertaTacSeNecessario(
      dto.pessoaId,
      tipoPessoa,
      dia,
      resposta,
    );
    return resposta;
  }

  /**
   * Avisa a supervisão e a gerência nas etapas 1h30, 1h40 e TAC. Cada etapa é
   * enviada no máximo uma vez por pessoa/dia. Se a jornada saltar diretamente
   * para uma etapa maior, envia somente a etapa atual e marca as inferiores
   * como consumidas. Best-effort: uma falha nunca trava a batida.
   *
   * A não-repetição é garantida pela tabela `AlertaTacEnviado`: reservamos a
   * etapa atual com um INSERT (o índice único é a trava atômica) e só então
   * enviamos. Como o registro é persistente, um reinício do servidor ou uma
   * segunda instância não reenviam a mesma etapa. Se o envio falhar, a reserva
   * é liberada para o próximo ciclo tentar de novo.
   *
   * Também é chamado pelo verificador periódico, para avisar enquanto a pessoa
   * continua trabalhando sem precisar aguardar a próxima batida.
   */
  async avisarAlertaTacSeNecessario(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
    dia: Date,
    resposta: JornadaDiaResposta,
  ): Promise<void> {
    if (!this.notificacoes) return;

    const chaveDia = dia.toISOString();
    const etapa = etapaAlertaTac(
      resposta.jornada.horasExtrasMs,
      resposta.jornada.tac,
    );
    if (!etapa) return;

    const etapasConsumidas: EtapaAlertaTac[] =
      etapa === 'TAC'
        ? ['RISCO_1H30', 'RISCO_1H40', 'TAC']
        : etapa === 'RISCO_1H40'
          ? ['RISCO_1H30', 'RISCO_1H40']
          : ['RISCO_1H30'];
    const chavesConsumidas = etapasConsumidas.map(
      (etapaConsumida) => `${pessoaId}:${chaveDia}:${etapaConsumida}`,
    );
    const chaveAtual = chavesConsumidas[chavesConsumidas.length - 1];

    // Cache em processo: já confirmada ou em envio nesta instância.
    if (
      this.alertasTacAvisados.has(chaveAtual) ||
      this.alertasTacEmEnvio.has(chaveAtual)
    ) {
      return;
    }

    // Reserva atômica no banco (sobrevive a reinícios e coordena instâncias).
    const reserva = await this.reservarEtapaTac(pessoaId, dia, etapa);
    if (reserva === 'JA_ENVIADO') {
      for (const chave of chavesConsumidas) {
        this.alertasTacAvisados.add(chave);
      }
      return;
    }

    for (const chave of chavesConsumidas) {
      this.alertasTacEmEnvio.add(chave);
    }

    try {
      const nome = await this.nomeDaPessoa(pessoaId, tipoPessoa);
      const conteudo = this.conteudoAlertaTac(nome, etapa, resposta);
      await this.notificacoes.notificarSupervisaoEGerencia(conteudo);
      // Envio confirmado: persiste também as etapas inferiores consumidas para
      // que não sejam reenviadas em ciclos futuros (idempotente).
      if (reserva === 'RESERVADO') {
        await this.registrarEtapasConsumidas(pessoaId, dia, etapasConsumidas);
      }
      for (const chave of chavesConsumidas) {
        this.alertasTacAvisados.add(chave);
      }
    } catch {
      // Envio falhou: libera a reserva para o próximo ciclo tentar de novo.
      // (Só quando fomos nós que reservamos; sem reserva não há o que liberar.)
      if (reserva === 'RESERVADO') {
        await this.liberarEtapaTac(pessoaId, dia, etapa);
      }
    } finally {
      for (const chave of chavesConsumidas) {
        this.alertasTacEmEnvio.delete(chave);
      }
    }
  }

  /**
   * Tenta reservar a etapa atual gravando uma linha em `AlertaTacEnviado`. O
   * índice único (pessoa/dia/etapa) transforma o INSERT numa trava atômica:
   * - `RESERVADO`: gravamos agora, então somos responsáveis por enviar;
   * - `JA_ENVIADO`: o índice recusou (P2002), outra batida/instância já cuidou;
   * - `INDISPONIVEL`: o banco falhou — segue-se com o cache em memória para não
   *   perder o aviso (pode reenviar após reinício, como no comportamento antigo).
   */
  private async reservarEtapaTac(
    pessoaId: string,
    dia: Date,
    etapa: EtapaAlertaTac,
  ): Promise<'RESERVADO' | 'JA_ENVIADO' | 'INDISPONIVEL'> {
    try {
      await this.prisma.alertaTacEnviado.create({
        data: { pessoaId, dia, etapa },
      });
      return 'RESERVADO';
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        return 'JA_ENVIADO';
      }
      return 'INDISPONIVEL';
    }
  }

  /** Persiste as etapas inferiores consumidas (idempotente). Best-effort. */
  private async registrarEtapasConsumidas(
    pessoaId: string,
    dia: Date,
    etapas: EtapaAlertaTac[],
  ): Promise<void> {
    try {
      await this.prisma.alertaTacEnviado.createMany({
        data: etapas.map((etapa) => ({ pessoaId, dia, etapa })),
        skipDuplicates: true,
      });
    } catch {
      // Best-effort: a etapa atual já está reservada; as inferiores são um
      // reforço para não reenviar avisos menores depois.
    }
  }

  /** Libera a reserva de uma etapa quando o envio falhou. Best-effort. */
  private async liberarEtapaTac(
    pessoaId: string,
    dia: Date,
    etapa: EtapaAlertaTac,
  ): Promise<void> {
    try {
      await this.prisma.alertaTacEnviado.deleteMany({
        where: { pessoaId, dia, etapa },
      });
    } catch {
      // Best-effort: se não conseguir liberar, o pior caso é não reenviar esta
      // etapa preventiva; nunca trava a batida.
    }
  }

  private conteudoAlertaTac(
    nome: string,
    etapa: EtapaAlertaTac,
    resposta: JornadaDiaResposta,
  ): { titulo: string; mensagem: string } {
    if (etapa === 'RISCO_1H30') {
      return {
        titulo: '⚠️ Risco de TAC',
        mensagem: `${nome} atingiu 1h30 de horas extras hoje. Faltam 20 minutos para o limite de TAC.`,
      };
    }
    if (etapa === 'RISCO_1H40') {
      return {
        titulo: '⚠️ Risco alto de TAC',
        mensagem: `${nome} atingiu 1h40 de horas extras hoje. Faltam 10 minutos para o limite de TAC.`,
      };
    }
    return {
      titulo: '⚠️ TAC na jornada',
      mensagem: `${nome} está em situação de TAC hoje: ${resposta.jornada.motivosTac.join('; ')}.`,
    };
  }

  /** Primeiro nome da pessoa (fiscal ou colaborador) para os avisos. */
  private async nomeDaPessoa(
    pessoaId: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
  ): Promise<string> {
    let nome: string | null = null;
    if (tipoPessoa === 'FISCAL') {
      const f = await this.prisma.fiscal.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      nome = f?.nome ?? null;
    } else {
      const c = await this.prisma.colaborador.findUnique({
        where: { id: pessoaId },
        select: { nome: true },
      });
      nome = c?.nome ?? null;
    }
    return (nome ?? 'Colaborador').trim().split(/\s+/)[0];
  }

  /** Memoriza "nome lido → pessoa" (best-effort) para o leitor aprender. */
  private async aprenderAlias(
    dto: RegistrarBatidaDto,
    tipoPessoa: 'FISCAL' | 'OPERADOR',
  ): Promise<void> {
    if (!this.ocr || !dto.nomeLido) return;
    try {
      // Resolve o nome oficial da pessoa (o alias guarda o nome de exibição).
      // Fiscais vêm da tabela Fiscal; os demais, do Cadastro de Colaboradores.
      let nome: string | null = null;
      let colaboradorId = dto.colaboradorId ?? null;
      if (tipoPessoa === 'FISCAL') {
        const fiscal = await this.prisma.fiscal.findUnique({
          where: { id: dto.pessoaId },
        });
        nome = fiscal?.nome ?? null;
      } else {
        const id = dto.colaboradorId ?? dto.pessoaId;
        const colaborador = await this.prisma.colaborador.findUnique({
          where: { id },
        });
        nome = colaborador?.nome ?? null;
        colaboradorId = colaborador?.id ?? colaboradorId;
      }
      if (!nome) return;
      await this.ocr.aprenderAlias(dto.nomeLido, {
        pessoaId: dto.pessoaId,
        tipoPessoa,
        colaboradorId,
        nome,
      });
    } catch {
      // Aprendizado é um "extra"; ignorar falhas para não travar a batida.
    }
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
    // Feriado segue a regra do domingo (base 7h20 + 100%). Best-effort: sem o
    // serviço de feriados (ex.: teste unitário), trata como dia normal.
    const ehFeriado = this.feriados
      ? await this.feriados.ehFeriado(dia)
      : false;
    const j = calcularJornadaDia(
      batidas.map((b) => ({ id: b.id, hora: b.hora })),
      agoraNaBrasilia(),
      dia.getUTCDay(),
      ehFeriado,
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
