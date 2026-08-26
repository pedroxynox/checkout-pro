import { Injectable, Optional } from '@nestjs/common';
import { Notificacao, Perfil, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacaoEventos } from './notificacoes.eventos';
import {
  decidirAutorizacaoComOverrides,
  OverridePermissao,
  Perfil as PerfilAcesso,
} from '../acessos/acessos.domain';
import {
  ConteudoNotificacao,
  LIMITE_NOTIFICACOES_POR_USUARIO,
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
    // Janela deslizante: cada caixa fica com no máximo
    // LIMITE_NOTIFICACOES_POR_USUARIO avisos — o mais antigo sai quando entra um
    // novo. Feito depois de criar (e por usuário distinto), best-effort.
    await this.apararCaixas(destinatarios.map((d) => d.id));
    // Entrega PUSH (Expo) aos dispositivos registrados — best-effort.
    await this.enviarPush(
      destinatarios.map((d) => d.id),
      conteudo,
    );
    return criadas;
  }

  /**
   * Mantém a caixa de cada usuário dentro do limite, apagando as notificações
   * que passaram da janela (as mais antigas).
   *
   * **Best-effort de propósito:** aparar é higiene, não a razão do envio. Se o
   * banco falhar aqui, o aviso já foi criado e entregue — engolir o erro é
   * melhor do que derrubar o fluxo de negócio que gerou a notificação (mesma
   * política do push). A próxima notificação tenta aparar de novo.
   */
  private async apararCaixas(usuarioIds: readonly string[]): Promise<void> {
    for (const usuarioId of new Set(usuarioIds)) {
      try {
        await this.apararCaixa(usuarioId);
      } catch {
        // best-effort: a aparagem nunca deve quebrar o envio.
      }
    }
  }

  /**
   * Apaga o excedente da caixa de UM usuário e devolve quantas saíram.
   *
   * O corte é feito pelo banco (`skip` sobre a ordem decrescente), então nada
   * além do excedente viaja para a aplicação — importante na primeira aparagem
   * de uma caixa que já acumulou milhares de linhas.
   *
   * O desempate por `id` existe porque um aviso "para todos" cria várias linhas
   * no MESMO milissegundo: sem ele a ordem entre elas seria indefinida e a
   * aparagem poderia escolher uma linha diferente a cada execução.
   */
  private async apararCaixa(usuarioId: string): Promise<number> {
    const excedentes = await this.prisma.notificacao.findMany({
      where: { usuarioId },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      skip: LIMITE_NOTIFICACOES_POR_USUARIO,
      select: { id: true },
    });
    if (excedentes.length === 0) return 0;
    const { count } = await this.prisma.notificacao.deleteMany({
      where: { id: { in: excedentes.map((e) => e.id) } },
    });
    return count;
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
    Perfil.ADMINISTRADOR,
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
   * Destinatários de um aviso pela FUNCIONALIDADE relacionada (Central de
   * Permissões): retorna os usuários operacionais cuja permissão EFETIVA inclui
   * `funcionalidade`, considerando as três camadas — padrão do perfil (código)
   * ± ajustes de perfil ± ajustes por login. É assim que os avisos passam a
   * respeitar o painel de permissões: quem recebe segue quem tem o acesso.
   */
  async destinatariosComPermissao(funcionalidade: string): Promise<Usuario[]> {
    const [usuarios, perfilOverridesRaw] = await Promise.all([
      this.prisma.usuario.findMany({
        where: {
          perfil: { in: [...NotificacoesService.PERFIS_QUE_RECEBEM_AVISOS] },
        },
        include: {
          permissoes: { select: { funcionalidade: true, concedida: true } },
        },
      }),
      this.prisma.perfilPermissao.findMany({
        select: { perfil: true, funcionalidade: true, concedida: true },
      }),
    ]);

    const overridesPorPerfil = new Map<string, OverridePermissao[]>();
    for (const o of perfilOverridesRaw) {
      const lista = overridesPorPerfil.get(o.perfil) ?? [];
      lista.push({ funcionalidade: o.funcionalidade, concedida: o.concedida });
      overridesPorPerfil.set(o.perfil, lista);
    }

    return usuarios.filter((u) =>
      decidirAutorizacaoComOverrides(
        u.perfil as PerfilAcesso,
        funcionalidade,
        overridesPorPerfil.get(u.perfil) ?? [],
        (u as { permissoes?: OverridePermissao[] }).permissoes ?? [],
      ),
    );
  }

  /**
   * Envia um aviso a quem tem a FUNCIONALIDADE relacionada (respeita o painel de
   * permissões). Sem destinatários, não faz nada.
   */
  async notificarComPermissao(
    funcionalidade: string,
    conteudo: ConteudoNotificacao,
  ): Promise<Notificacao[]> {
    const destinatarios = await this.destinatariosComPermissao(funcionalidade);
    if (destinatarios.length === 0) return [];
    return this.enviar(destinatarios, conteudo);
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
    // Conectado ao painel: quem tem a funcionalidade CHECKLIST recebe.
    return this.destinatariosComPermissao('CHECKLIST');
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

  /**
   * Envia um aviso à alçada da Central de Jornada (supervisor, gerente e
   * administrador por padrão) — conectado ao painel pela funcionalidade
   * `CENTRAL_JORNADA`. Usado no aviso de TAC/conflito da jornada.
   */
  async notificarSupervisaoEGerencia(
    conteudo: ConteudoNotificacao,
  ): Promise<Notificacao[]> {
    return this.notificarComPermissao('CENTRAL_JORNADA', conteudo);
  }

  /**
   * Envia um aviso a TODOS os que recebem notificações (funcionalidade
   * `NOTIFICACOES`, que por padrão é de todos os perfis operacionais). Atalho
   * para avisos gerais. Sem destinatários, não faz nada.
   */
  async notificarTodos(conteudo: ConteudoNotificacao): Promise<Notificacao[]> {
    return this.notificarComPermissao('NOTIFICACOES', conteudo);
  }

  /**
   * Histórico de notificações de um usuário (Req 7.3.3), mais recentes primeiro,
   * limitado à janela de `LIMITE_NOTIFICACOES_POR_USUARIO`.
   *
   * O `take` é rede de segurança: a aparagem no envio já mantém a caixa no
   * tamanho, mas ela é best-effort e as caixas que existiam antes deste limite
   * podem estar maiores. Assim a tela nunca recebe uma lista gigante.
   */
  async historico(usuarioId: string): Promise<Notificacao[]> {
    return this.prisma.notificacao.findMany({
      where: { usuarioId },
      orderBy: { criadaEm: 'desc' },
      take: LIMITE_NOTIFICACOES_POR_USUARIO,
    });
  }

  /**
   * Limpa o centro de notificações do usuário: apaga **apenas as dele**.
   *
   * O `usuarioId` vem do token, nunca do corpo da requisição — ninguém limpa a
   * caixa de outra pessoa. Devolve quantas foram removidas.
   */
  async limparHistorico(usuarioId: string): Promise<{ removidas: number }> {
    const { count } = await this.prisma.notificacao.deleteMany({
      where: { usuarioId },
    });
    return { removidas: count };
  }
}
