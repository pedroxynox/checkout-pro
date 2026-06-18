/**
 * Lógica de domínio **pura** do serviço transversal de Notificações.
 *
 * Concentra o cálculo dos destinatários do alerta de checklist — união dos
 * fiscais online com o login gerencial, sempre presente (Req 5.3.3, 5.3.4) — e
 * a montagem das entregas em duplo canal (push + in-app) para cada destinatário
 * (Req 7.3.2).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 */

/** Referência mínima de um usuário (identificável por id). */
export interface UsuarioRef {
  id: string;
}

/**
 * Calcula os destinatários do alerta de checklist (Req 5.3.3, 5.3.4): a união
 * dos fiscais online no momento com o(s) login(s) gerencial(is). O login
 * gerencial está **sempre** presente, independentemente de estar online. O
 * resultado não contém duplicatas (deduplicado por id), preservando a primeira
 * ocorrência (fiscais online primeiro, depois gerenciais).
 */
export function destinatariosAlertaChecklist<T extends UsuarioRef>(
  fiscaisOnline: readonly T[],
  gerenciais: readonly T[],
): T[] {
  const vistos = new Set<string>();
  const resultado: T[] = [];
  for (const u of [...fiscaisOnline, ...gerenciais]) {
    if (!vistos.has(u.id)) {
      vistos.add(u.id);
      resultado.push(u);
    }
  }
  return resultado;
}

/** Conteúdo de uma notificação a ser entregue. */
export interface ConteudoNotificacao {
  titulo: string;
  mensagem: string;
}

/** Uma entrega de notificação a um usuário pelos dois canais. */
export interface EntregaNotificacao {
  usuarioId: string;
  titulo: string;
  mensagem: string;
  canalPush: boolean;
  canalInApp: boolean;
}

/**
 * Monta as entregas de uma notificação (Req 7.3.1, 7.3.2): para **cada**
 * destinatário, gera uma entrega marcada para ser entregue tanto por push
 * quanto por notificação dentro do aplicativo (in-app).
 */
export function montarEntregas(
  destinatarios: readonly UsuarioRef[],
  conteudo: ConteudoNotificacao,
): EntregaNotificacao[] {
  return destinatarios.map((u) => ({
    usuarioId: u.id,
    titulo: conteudo.titulo,
    mensagem: conteudo.mensagem,
    canalPush: true,
    canalInApp: true,
  }));
}
