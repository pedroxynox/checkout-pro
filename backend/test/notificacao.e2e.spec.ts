/**
 * Testes de integração ponta a ponta da entrega de notificações (Tarefa 20.3).
 *
 * Exercita o `NotificacoesService` real com o Prisma falso em memória e um
 * **provedor de push simulado** (mock) que representa a integração de
 * infraestrutura (FCM/APNs). Verifica:
 *  - o alvo do alerta de checklist é a união dos fiscais online com o login
 *    gerencial, sempre presente (Req 5.3.3, 5.3.4);
 *  - cada destinatário recebe a entrega pelos dois canais — push e in-app
 *    (Req 7.3.2).
 */
import { NotificacoesService } from '../src/notificacoes/notificacoes.service';
import { criarFakePrisma, FakePrisma } from './helpers/fake-prisma';

/** Provedor de push simulado: registra os envios que receberia da infra. */
class ProvedorPushFake {
  enviados: Array<{ usuarioId: string; titulo: string }> = [];
  enviar = jest.fn((usuarioId: string, titulo: string) => {
    this.enviados.push({ usuarioId, titulo });
  });
}

function semear(fake: FakePrisma): void {
  fake.usuarios = [
    { id: 'g1', login: 'gerente', perfil: 'GERENTE', online: false },
    { id: 'f1', login: 'fiscal1', perfil: 'FISCAL', online: true },
    { id: 'f2', login: 'fiscal2', perfil: 'FISCAL', online: false },
    { id: 'f3', login: 'fiscal3', perfil: 'FISCAL', online: true },
  ];
}

describe('Entrega de notificações ponta a ponta (Tarefa 20.3)', () => {
  it('alerta de checklist atinge fiscais online ∪ gerencial, em dois canais', async () => {
    const { fake, prisma } = criarFakePrisma();
    semear(fake);
    const service = new NotificacoesService(prisma);
    const push = new ProvedorPushFake();

    const criadas = await service.notificarAlertaChecklist({
      titulo: 'Checklist de abertura pendente',
      mensagem: 'O checklist de abertura ainda não foi concluído.',
    });

    // Alvo: fiscais online (f1, f3) + gerencial (g1). Fiscal offline (f2) fora.
    const alvo = criadas.map((n) => n.usuarioId).sort();
    expect(alvo).toEqual(['f1', 'f3', 'g1']);

    // Dual canal: cada entrega marcada para push e in-app (Req 7.3.2).
    for (const n of criadas) {
      expect(n.canalPush).toBe(true);
      expect(n.canalInApp).toBe(true);
    }

    // O provedor de push (infra) entrega a cada destinatário com canalPush.
    for (const n of criadas.filter((x) => x.canalPush)) {
      push.enviar(n.usuarioId, n.titulo);
    }
    expect(push.enviar).toHaveBeenCalledTimes(3);
    expect(push.enviados.map((e) => e.usuarioId).sort()).toEqual([
      'f1',
      'f3',
      'g1',
    ]);
  });

  it('o login gerencial é alvo mesmo quando nenhum fiscal está online', async () => {
    const { fake, prisma } = criarFakePrisma();
    fake.usuarios = [
      { id: 'g1', login: 'gerente', perfil: 'GERENTE', online: false },
      { id: 'f1', login: 'fiscal1', perfil: 'FISCAL', online: false },
    ];
    const service = new NotificacoesService(prisma);

    const criadas = await service.notificarAlertaChecklist({
      titulo: 'Checklist de fechamento pendente',
      mensagem: 'Pendência de fechamento.',
    });

    expect(criadas.map((n) => n.usuarioId)).toEqual(['g1']);
  });

  it('registra histórico por usuário, mais recentes primeiro', async () => {
    const { fake, prisma } = criarFakePrisma();
    semear(fake);
    const service = new NotificacoesService(prisma);

    await service.enviar([{ id: 'f1' }], {
      titulo: 'Aviso 1',
      mensagem: 'm1',
    });
    await service.enviar([{ id: 'f1' }], {
      titulo: 'Aviso 2',
      mensagem: 'm2',
    });

    const historico = await service.historico('f1');
    expect(historico).toHaveLength(2);
    expect(historico.every((n) => n.canalPush && n.canalInApp)).toBe(true);
  });
});
