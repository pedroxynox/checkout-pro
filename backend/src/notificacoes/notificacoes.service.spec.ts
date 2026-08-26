import { NotificacoesService } from './notificacoes.service';
import { LIMITE_NOTIFICACOES_POR_USUARIO } from './notificacoes.domain';

/**
 * Testes de exemplo (unitários) do `NotificacoesService`. Usam um
 * `PrismaService` falso (em memória) exercitando o envio em duplo canal, a
 * resolução de alvos, o histórico por usuário, a **janela de 200 avisos por
 * pessoa** e a limpeza da própria caixa — sem banco de dados.
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
          where: { online?: boolean; perfil?: string | { in: string[] } };
        }) =>
          Promise.resolve(
            usuarios.filter((u) => {
              const onlineOk =
                where.online === undefined || u.online === where.online;
              const perfilOk =
                where.perfil === undefined
                  ? true
                  : typeof where.perfil === 'string'
                    ? u.perfil === where.perfil
                    : where.perfil.in.includes(u.perfil);
              return onlineOk && perfilOk;
            }),
          ),
      },
      perfilPermissao: {
        findMany: () => Promise.resolve([]),
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
        // O fake honra `orderBy` (objeto ou array), `skip` e `take` porque a
        // aparagem da janela depende exatamente disso: ela pede "tudo a partir
        // da 201ª mais recente".
        findMany: ({
          where,
          orderBy,
          skip,
          take,
        }: {
          where: { usuarioId?: string; id?: { in: string[] } };
          orderBy?:
            | { criadaEm?: 'asc' | 'desc'; id?: 'asc' | 'desc' }
            | { criadaEm?: 'asc' | 'desc'; id?: 'asc' | 'desc' }[];
          skip?: number;
          take?: number;
        }) => {
          let lista = notificacoes.filter(
            (n) =>
              (where.usuarioId === undefined ||
                n.usuarioId === where.usuarioId) &&
              (where.id === undefined || where.id.in.includes(n.id)),
          );
          const criterios = Array.isArray(orderBy)
            ? orderBy
            : orderBy
              ? [orderBy]
              : [];
          if (criterios.length > 0) {
            lista = [...lista].sort((a, b) => {
              for (const c of criterios) {
                const dirData = c.criadaEm === 'desc' ? -1 : 1;
                if (c.criadaEm) {
                  const d =
                    (a.criadaEm.getTime() - b.criadaEm.getTime()) * dirData;
                  if (d !== 0) return d;
                }
                if (c.id) {
                  const dirId = c.id === 'desc' ? -1 : 1;
                  const d = a.id.localeCompare(b.id) * dirId;
                  if (d !== 0) return d;
                }
              }
              return 0;
            });
          }
          if (skip) lista = lista.slice(skip);
          if (take !== undefined) lista = lista.slice(0, take);
          return Promise.resolve(lista.map((n) => ({ ...n })));
        },
        deleteMany: ({
          where,
        }: {
          where: { usuarioId?: string; id?: { in: string[] } };
        }) => {
          const alvo = (n: NotifFake) =>
            (where.usuarioId === undefined ||
              n.usuarioId === where.usuarioId) &&
            (where.id === undefined || where.id.in.includes(n.id));
          const antes = notificacoes.length;
          for (let i = notificacoes.length - 1; i >= 0; i--) {
            if (alvo(notificacoes[i])) notificacoes.splice(i, 1);
          }
          return Promise.resolve({ count: antes - notificacoes.length });
        },
      },
    };

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service: new NotificacoesService(prismaFake as any),
      notificacoes,
      prismaFake,
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

  it('alvo dos avisos = todos os perfis operacionais (fiscal, supervisor, gerente, gerente dev); importador de fora', async () => {
    const { service } = criarServico([
      { id: 'f1', perfil: 'FISCAL', online: true },
      { id: 'f2', perfil: 'FISCAL', online: false },
      { id: 'g1', perfil: 'GERENTE', online: false },
      { id: 'i1', perfil: 'IMPORTADOR', online: true },
    ]);
    const destinatarios = await service.destinatariosAlertaChecklist();
    const ids = destinatarios.map((u) => u.id).sort();
    // Todos os fiscais (online ou não) e gerentes recebem; IMPORTADOR fica fora.
    expect(ids).toEqual(['f1', 'f2', 'g1']);
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

  describe('janela de 200 avisos por pessoa', () => {
    /** Envia `quantidade` avisos numerados para um usuário, em sequência. */
    async function encher(
      service: NotificacoesService,
      usuarioId: string,
      quantidade: number,
    ): Promise<void> {
      for (let i = 1; i <= quantidade; i++) {
        await service.enviar([{ id: usuarioId }], {
          titulo: `Aviso ${i}`,
          mensagem: String(i),
        });
      }
    }

    it('abaixo do limite não apaga nada', async () => {
      const { service, notificacoes } = criarServico([]);
      await encher(service, 'u1', 5);
      expect(notificacoes).toHaveLength(5);
    });

    it('ao passar do limite, o mais ANTIGO sai e o total fica em 200', async () => {
      const { service, notificacoes } = criarServico([]);
      const excesso = 5;
      await encher(service, 'u1', LIMITE_NOTIFICACOES_POR_USUARIO + excesso);

      expect(notificacoes).toHaveLength(LIMITE_NOTIFICACOES_POR_USUARIO);
      const historico = await service.historico('u1');
      // O mais recente é o último enviado; o mais antigo que sobrou é o de
      // número `excesso + 1` — os cinco primeiros saíram.
      expect(historico[0].titulo).toBe(
        `Aviso ${LIMITE_NOTIFICACOES_POR_USUARIO + excesso}`,
      );
      expect(historico[historico.length - 1].titulo).toBe(
        `Aviso ${excesso + 1}`,
      );
      expect(notificacoes.some((n) => n.titulo === 'Aviso 1')).toBe(false);
    });

    it('a janela é POR PESSOA: lotar a caixa de um não mexe na do outro', async () => {
      const { service, notificacoes } = criarServico([]);
      await encher(service, 'u1', LIMITE_NOTIFICACOES_POR_USUARIO + 3);
      await encher(service, 'u2', 4);

      expect(await service.historico('u1')).toHaveLength(
        LIMITE_NOTIFICACOES_POR_USUARIO,
      );
      expect(await service.historico('u2')).toHaveLength(4);
      expect(notificacoes.filter((n) => n.usuarioId === 'u2')).toHaveLength(4);
    });

    it('o histórico nunca devolve mais do que a janela (rede de segurança)', async () => {
      const { service, notificacoes } = criarServico([]);
      // Simula uma caixa que já era grande ANTES do limite existir: as linhas
      // entram direto na lista, sem passar pela aparagem do envio.
      for (let i = 0; i < LIMITE_NOTIFICACOES_POR_USUARIO + 50; i++) {
        notificacoes.push({
          id: `antigo-${i}`,
          usuarioId: 'u1',
          titulo: `Antigo ${i}`,
          mensagem: '',
          canalPush: true,
          canalInApp: true,
          criadaEm: new Date(i * 1000),
        });
      }
      const historico = await service.historico('u1');
      expect(historico).toHaveLength(LIMITE_NOTIFICACOES_POR_USUARIO);
    });

    it('uma falha ao aparar não derruba o envio (é higiene, não o objetivo)', async () => {
      const { service, notificacoes, prismaFake } = criarServico([]);
      prismaFake.notificacao.deleteMany = () =>
        Promise.reject(new Error('banco indisponível'));

      await encher(service, 'u1', LIMITE_NOTIFICACOES_POR_USUARIO + 2);

      // O aviso foi criado mesmo sem conseguir aparar.
      expect(notificacoes.length).toBe(LIMITE_NOTIFICACOES_POR_USUARIO + 2);
    });
  });

  describe('limpar a própria caixa', () => {
    it('apaga só as notificações do usuário e devolve a contagem', async () => {
      const { service } = criarServico([]);
      await service.enviar([{ id: 'u1' }, { id: 'u2' }], {
        titulo: 'A',
        mensagem: '1',
      });
      await service.enviar([{ id: 'u1' }], { titulo: 'B', mensagem: '2' });

      const r = await service.limparHistorico('u1');

      expect(r).toEqual({ removidas: 2 });
      expect(await service.historico('u1')).toHaveLength(0);
      // A caixa do outro segue intacta.
      expect(await service.historico('u2')).toHaveLength(1);
    });

    it('limpar uma caixa vazia é inofensivo (idempotente)', async () => {
      const { service } = criarServico([]);
      expect(await service.limparHistorico('u1')).toEqual({ removidas: 0 });
    });
  });
});
