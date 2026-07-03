import { Injectable, Optional } from '@nestjs/common';
import { Notificacao, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacaoEventos } from './notificacoes.eventos';
import {
  ConteudoNotificacao,
  UsuarioRef,
  destinatariosAlertaChecklist,
  montarEntregas,
} from './notificacoes.domain';

/**
 * Serviço transversal de Notificações (Req 7.3, 5.3.3, 5.3.4): entrega em duplo
 * canal (push + in-app), resolução de fiscais online e do login gerencial
 * (sempre presente) e histórico por usuário.
 *
 * A lógica pura (alvos do alerta e montagem das entregas) é delegada a
 * `notificacoes.domain`; este serviço cuida apenas dos efeitos colaterais via
 * Prisma. A entrega push real é responsabilidade da integração de push
 * (FCM/APNs) na camada de infraestrutura; aqui registramos a notificação com os
 * dois canais marcados.
 */
@Injectable()
export class NotificacoesService {
  constructor(
    private readonly prisma: PrismaService,
    // Opcional: nos testes o serviço é instanciado só com o Prisma. Em
    // produção, o DI injeta o barramento para a entrega em tempo real.
    @Optional() private readonly eventos?: NotificacaoEventos,
  ) {}

  /**
   * Envia uma notificação a um conjunto de destinatários (Req 7.3.1, 7.3.2):
   * para cada destinatário, registra a entrega pelos dois canais (push e
   * in-app). Retorna as notificações criadas.
   */
  async enviar(
    destinatarios: readonly UsuarioRef[],
    conteudo: ConteudoNotificacao,
  ): Promise<Notificacao[]> {
    const entregas = montarEntregas(destinatarios, conteudo);
    // Cria cada entrega individualmente (preserva o id/criadaEm de cada linha,
    // necessários para a publicação em tempo real), porém de forma concorrente
    // via Promise.all — que mantém a ordem das entregas no array de resultado.
    // Não usamos createMany porque ele não retorna os ids gerados.
    const criadas = await Promise.all(
      entregas.map((e) =>
        this.prisma.notificacao.create({
          data: {
            usuarioId: e.usuarioId,
            titulo: e.titulo,
            mensagem: e.mensagem,
            canalPush: e.canalPush,
            canalInApp: e.canalInApp,
          },
        }),
      ),
    );
    // Entrega em tempo real (WebSocket) ao destinatário, se conectado.
    for (const criada of criadas) {
      this.eventos?.publicar({
        usuarioId: criada.usuarioId,
        id: criada.id,
        titulo: criada.titulo,
        mensagem: criada.mensagem,
        criadaEm: criada.criadaEm,
      });
    }
    return criadas;
  }

  /** Fiscais online no momento — alvo dos alertas de checklist (Req 5.3.3). */
  async fiscaisOnline(): Promise<Usuario[]> {
    return this.prisma.usuario.findMany({
      where: { online: true, perfil: 'FISCAL' },
    });
  }

  /**
   * Login(s) gerencial(is) — alvo sempre presente dos alertas (Req 5.3.4),
   * independentemente de estar online.
   */
  async loginGerencial(): Promise<Usuario[]> {
    return this.prisma.usuario.findMany({
      where: { perfil: 'GERENTE' },
    });
  }

  /**
   * Gestores: gerentes (comum e desenvolvedor) e supervisores. Alvo de avisos
   * de gestão (ex.: fechamento concluído, novas requisições).
   */
  async gestores(): Promise<Usuario[]> {
    return this.prisma.usuario.findMany({
      where: {
        perfil: { in: ['GERENTE', 'GERENTE_DESENVOLVEDOR', 'SUPERVISOR'] },
      },
    });
  }

  /**
   * Calcula os destinatários do alerta de checklist (Req 5.3.3, 5.3.4): união
   * dos fiscais online com o login gerencial (sempre presente).
   */
  async destinatariosAlertaChecklist(): Promise<Usuario[]> {
    const [fiscais, gerenciais] = await Promise.all([
      this.fiscaisOnline(),
      this.loginGerencial(),
    ]);
    return destinatariosAlertaChecklist(fiscais, gerenciais);
  }

  /**
   * Dispara o alerta de checklist pendente (Req 5.3.3, 5.3.4): envia a
   * notificação à união dos fiscais online com o login gerencial.
   */
  async notificarAlertaChecklist(
    conteudo: ConteudoNotificacao,
  ): Promise<Notificacao[]> {
    const destinatarios = await this.destinatariosAlertaChecklist();
    return this.enviar(destinatarios, conteudo);
  }

  /** Histórico de notificações de um usuário (Req 7.3.3), mais recentes primeiro. */
  async historico(usuarioId: string): Promise<Notificacao[]> {
    return this.prisma.notificacao.findMany({
      where: { usuarioId },
      orderBy: { criadaEm: 'desc' },
    });
  }
}
