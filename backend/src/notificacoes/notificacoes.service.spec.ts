import { NotificacoesService } from './notificacoes.service';

/**
 * Testes de exemplo (unitários) do `NotificacoesService`. Usam um
 * `PrismaService` falso (em memória) exercitando o envio em duplo canal, a
 * resolução de alvos e o histórico por usuário, sem banco de dados.
 */
describe('NotificacoesService', () => {
  interface UsuarioFake {
    id: string;
    perfil: string;
    online: boolean;
  }
  interface NotifFake {
    id: string;
    usuarioId: string;
    titulo: string;
    mensagem: string;
    canalPush: boolean;
    canalInApp: boolean;
    criadaEm: Date;
  }

  function criarServico(usuarios: UsuarioFake[]) {
    const notificacoes: NotifFake[] = [];
    let seq = 0;

    const prismaFake = {
      usuario: {
        findMany: ({
          where,
        }: {
          where: { online?: boolean; perfil?: string };
        }) =>
          Promise.resolve(
            usuarios.filter(
              (u) =>
                (where.online === undefined || u.online === where.online) &&
                (where.perfil === undefined || u.perfil === where.perfil),
            ),
          ),
      },
      notificacao: {
        create: ({ data }: { data: Omit<NotifFake, 'id' | 'criadaEm'> }) => {
          const novo: NotifFake = {
            id: `n${++seq}`,
            criadaEm: new Date(seq * 1000),
            ...data,
          };
          notificacoes.push(novo);
          return Promise.resolve({ ...novo });
        },
        findMany: ({
          where: { usuarioId },
          orderBy,
        }: {
          where: { usuarioId: string };
          orderBy?: { criadaEm?: 'asc' | 'desc' };
        }) => {
          let lista = notificacoes.filter((n) => n.usuarioId === usuarioId);
          if (orderBy?.criadaEm) {
            const dir = orderBy.criadaEm === 'desc' ? -1 : 1;
            lista = [...lista].sort(
              (a, b) => (a.criadaEm.getTime() - b.criadaEm.getTime()) * dir,
            );
          }
          return Promise.resolve(lista.map((n) => ({ ...n })));
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      service: new NotificacoesService(prismaFake as any),
      notificacoes,
    };
  }

  it('envia uma notificação pelos dois canais a cada destinatário (Req 7.3.2)', async () => {
    const { service } = criarServico([]);
    const criadas = await service.enviar([{ id: 'u1' }, { id: 'u2' }], {
      titulo: 'Alerta',
      mensagem: 'Checklist pendente',
    });
    expect(criadas).toHaveLength(2);
    for (const n of criadas) {
      expect(n.canalPush).toBe(true);
      expect(n.canalInApp).toBe(true);
    }
  });

  it('alvo do alerta = fiscais online + login gerencial (sempre presente)', async () => {
    const { service } = criarServico([
      { id: 'f1', perfil: 'FISCAL', online: true },
      { id: 'f2', perfil: 'FISCAL', online: false },
      { id: 'g1', perfil: 'GERENTE', online: false },
    ]);
    const destinatarios = await service.destinatariosAlertaChecklist();
    const ids = destinatarios.map((u) => u.id).sort();
    // f1 (online) + g1 (gerencial, offline mas sempre presente); f2 offline fora.
    expect(ids).toEqual(['f1', 'g1']);
  });

  it('mantém o histórico por usuário ordenado do mais recente ao mais antigo (Req 7.3.3)', async () => {
    const { service } = criarServico([]);
    await service.enviar([{ id: 'u1' }], { titulo: 'A', mensagem: '1' });
    await service.enviar([{ id: 'u1' }], { titulo: 'B', mensagem: '2' });
    await service.enviar([{ id: 'u2' }], { titulo: 'C', mensagem: '3' });

    const historicoU1 = await service.historico('u1');
    expect(historicoU1).toHaveLength(2);
    expect(historicoU1[0].titulo).toBe('B');
    expect(historicoU1[1].titulo).toBe('A');

    const historicoU2 = await service.historico('u2');
    expect(historicoU2).toHaveLength(1);
    expect(historicoU2[0].titulo).toBe('C');
  });
});
