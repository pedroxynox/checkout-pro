import { Injectable, Optional } from '@nestjs/common';
import { Notificacao, Perfil, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacaoEventos } from './notificacoes.eventos';
import {
  ConteudoNotificacao,
  UsuarioRef,
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

  /**
   * Perfis operacionais que recebem TODOS os avisos do sistema (decisão de
   * negócio): fiscal, supervisor, gerente e gerente desenvolvedor. O perfil
   * IMPORTADOR fica de fora de propósito. Este é o ÚNICO ponto a ajustar caso,
   * no futuro, queiramos voltar a segmentar os avisos por perfil.
   */
  private static readonly PERFIS_QUE_RECEBEM_AVISOS: Perfil[] = [
    Perfil.FISCAL,
    Perfil.SUPERVISOR,
    Perfil.GERENTE,
    Perfil.GERENTE_DESENVOLVEDOR,
  ];

  /**
   * Destinatários de qualquer aviso: todos os usuários dos perfis operacionais
   * (fiscal, supervisor, gerente e gerente desenvolvedor). Fonte ÚNICA de
   * verdade — os demais métodos de alvo delegam aqui, de modo que todo aviso do
   * sistema chegue aos quatro perfis.
   */
  async destinatariosGerais(): Promise<Usuario[]> {
    return this.prisma.usuario.findMany({
      where: {
        perfil: { in: [...NotificacoesService.PERFIS_QUE_RECEBEM_AVISOS] },
      },
    });
  }

  /**
   * Alvo dos avisos de gestão (fechamento, insumos, vendas, contratos, faltas,
   * advertências, etc.). Por decisão de negócio atual, todos os perfis
   * operacionais recebem esses avisos — delega a `destinatariosGerais`.
   */
  async gestores(): Promise<Usuario[]> {
    return this.destinatariosGerais();
  }

  /**
   * Alvo do alerta de importações pendentes. Por decisão de negócio atual, o
   * aviso vai a todos os perfis operacionais — delega a `destinatariosGerais`.
   */
  async loginGerencial(): Promise<Usuario[]> {
    return this.destinatariosGerais();
  }

  /**
   * Destinatários do alerta de checklist (Req 5.3.3, 5.3.4). Por decisão de
   * negócio atual, o alerta vai a todos os perfis operacionais (fiscal,
   * supervisor, gerente e gerente desenvolvedor) — e não apenas aos fiscais
   * online. Delega a `destinatariosGerais`.
   */
  async destinatariosAlertaChecklist(): Promise<Usuario[]> {
    return this.destinatariosGerais();
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
