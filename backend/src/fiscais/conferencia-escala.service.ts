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
 * A [ADR 0026](../../../docs/02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md)
 * fez o horário **exibido** ser sempre o da ficha. A etapa 2 é a **detecção
 * automática de falta** passar a ler a ficha e a cópia semanal (`EscalaEntry`)
 * desaparecer — e o roadmap exige rodar este diagnóstico **antes**, porque a troca
 * de fonte muda a hora cobrada de quem tem ficha mais cedo que a cópia.
 *
 * O diagnóstico já existia, mas só como **comando de terminal**
 * (`npm run integridade`), com acesso ao banco de produção. O dono do produto não
 * tem como rodá-lo, e era justamente ele quem precisava da resposta ("por que a
 * escala mostra um horário que não está na ficha?"). Este serviço entrega a mesma
 * apuração pela API, para a tela de Conferência de escala.
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
