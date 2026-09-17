import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReporteIntegridadeEscala,
  detectarEscalasIncoerentes,
} from './integridade-escala';

/**
 * **Conferência de escala** — o diagnóstico ficha × escala semanal, exposto para
 * o gestor consultar quando quiser.
 *
 * ## Por que existe
 *
 * O diagnóstico já existia, mas só como **comando de terminal**
 * (`npm run integridade`), com acesso ao banco de produção. O dono do produto não
 * tem como rodá-lo, e era justamente ele quem precisava da resposta ("por que a
 * escala mostra um horário que não está na ficha?"). Este serviço entrega a mesma
 * apuração pela API, para a tela de Conferência de escala.
 *
 * Foi essa tela que autorizou a etapa 2 da
 * [ADR 0026](../../../docs/02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md):
 * ela nomeou, em produção, as sete pessoas cuja cópia semanal era mais tardia que
 * a ficha — e portanto as sete cujo atraso real o sistema não enxergava.
 *
 * ## O que ela responde agora
 *
 * Feita a troca, a hora cobrada é a da ficha, e uma divergência com a cópia
 * semanal deixou de ter efeito sobre a cobrança. A tela seguiu útil porque o
 * assunto mudou: o que importa hoje são as **lacunas da ficha** — quem está sem
 * horário, sem horário de domingo ou sem dia de folga —, porque a ficha virou a
 * única fonte e já não há nada por baixo dela para cobrir um vazio. As diferenças
 * com a cópia continuam listadas como informação: mostram onde a regeneração não
 * chegou.
 *
 * ## O que faz, e o que NÃO faz
 *
 * **Só lê.** Não corrige, não sincroniza, não apaga nada. A correção é sempre uma
 * decisão humana com os dados na mão — normalmente reabrir e salvar a ficha, que
 * regenera a escala a partir dela.
 *
 * A apuração vive em `integridade-escala.ts` (pura, testada sem banco); aqui só se
 * buscam os ingredientes. É a mesma função que o comando de terminal usa, então os
 * dois **não podem divergir**.
 */
@Injectable()
export class ConferenciaEscalaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apura a coerência entre as fichas dos fiscais e a escala semanal gravada.
   *
   * Lê as fichas com os campos que geram a escala — **incluindo os de domingo**,
   * que decidem domingo e feriado — e apenas as entradas **gerais** da escala
   * (`especial: false`). Desde a ADR 0026 não existem outras: a coluna permanece
   * sempre `false`, e o filtro é o cinto de segurança contra um resquício.
   */
  async conferir(): Promise<ReporteIntegridadeEscala> {
    const [fichas, fiscais, usuarios, entradasGerais] = await Promise.all([
      this.prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: {
          id: true,
          nome: true,
          matricula: true,
          usuarioId: true,
          entradaSemana: true,
          saidaSemana: true,
          entradaFds: true,
          saidaFds: true,
          entradaDom: true,
          saidaDom: true,
          grupoDomingo: true,
          folgaDiaSemana: true,
          ativo: true,
        },
      }),
      this.prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      this.prisma.usuario.findMany({ select: { id: true, login: true } }),
      this.prisma.escalaEntry.findMany({
        where: { especial: false },
        select: {
          funcionarioId: true,
          colaboradorId: true,
          diaSemana: true,
          entrada: true,
          saida: true,
          folga: true,
        },
      }),
    ]);

    return detectarEscalasIncoerentes(
      fichas,
      fiscais,
      usuarios,
      entradasGerais,
    );
  }
}
