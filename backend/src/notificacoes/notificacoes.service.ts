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
    // Entrega PUSH (Expo) aos dispositivos registrados — best-effort.
    await this.enviarPush(
      destinatarios.map((d) => d.id),
      conteudo,
    );
    return criadas;
  }

  /**
   * Registra/atualiza o token de push (Expo) de um dispositivo para o usuário.
   * Idempotente por token: se o token já existia (mesmo aparelho), apenas
   * reaponta para o usuário atual (útil quando trocam de login no aparelho).
   */
  async registrarPushToken(
    usuarioId: string,
    token: string,
    plataforma?: string,
  ): Promise<void> {
    const t = token.trim();
    if (!t) return;
    await this.prisma.pushToken.upsert({
      where: { token: t },
      update: { usuarioId, plataforma: plataforma ?? null },
      create: { token: t, usuarioId, plataforma: plataforma ?? null },
    });
  }

  /** Remove um token de push (ex.: logout do aparelho). */
  async removerPushToken(token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { token: token.trim() } });
  }

  /**
   * Envia a notificação como PUSH aos dispositivos dos destinatários via Expo
   * Push Service. Best-effort: qualquer falha (rede/servidor Expo) é engolida —
   * nunca quebra o fluxo que gerou o aviso. Envia em lotes de 100 (limite da
   * API do Expo).
   */
  private async enviarPush(
    usuarioIds: readonly string[],
    conteudo: ConteudoNotificacao,
  ): Promise<void> {
    try {
      const ids = [...new Set(usuarioIds)];
      if (ids.length === 0) return;
      const registros = await this.prisma.pushToken.findMany({
        where: { usuarioId: { in: ids } },
        select: { token: true },
      });
      // Só tokens no formato do Expo (evita lixo/entradas inválidas).
      const tokens = registros
        .map((r) => r.token)
        .filter(
          (t) =>
            t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken'),
        );
      if (tokens.length === 0) return;

      const mensagens = tokens.map((to) => ({
        to,
        title: conteudo.titulo,
        body: conteudo.mensagem,
        sound: 'default',
      }));
      for (let i = 0; i < mensagens.length; i += 100) {
        const lote = mensagens.slice(i, i + 100);
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(lote),
        });
      }
    } catch {
      // Best-effort: o push nunca deve derrubar o envio da notificação in-app.
    }
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
