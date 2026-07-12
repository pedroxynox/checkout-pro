import { ChecklistService } from './checklist.service';
import {
  ArquivoNaoImagemError,
  ChecklistDiaPassadoError,
} from './checklist.errors';
import { janela } from './checklist.domain';

/**
 * Data de HOJE (Brasília) num horário "HH:mm" — usada nos testes de envio, pois
 * o checklist só pode ser carregado no próprio dia (dias passados são rejeitados).
 */
function hojeBrasiliaAs(hhmm: string): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${iso}T${hhmm}:00Z`);
}

/**
 * Testes de exemplo (unitários) do `ChecklistService`, incluindo a verificação
 * das janelas fixas de execução (Req 5.2). Usam um `PrismaService` falso (em
 * memória) com a chave composta (tipo, data).
 */
describe('ChecklistService', () => {
  interface ChecklistFake {
    id: string;
    tipo: string;
    data: Date;
    status: string;
    imagemUrl: string | null;
    enviadoPor: string | null;
    enviadoEm: Date | null;
  }

  function criarServico() {
    const checklists: ChecklistFake[] = [];
    let seq = 0;
    const chave = (tipo: string, data: Date) => `${tipo}|${data.getTime()}`;

    const prismaFake = {
      checklist: {
        findUnique: ({
          where: { tipo_data },
        }: {
          where: { tipo_data: { tipo: string; data: Date } };
        }) => {
          const c = checklists.find(
            (x) =>
              chave(x.tipo, x.data) === chave(tipo_data.tipo, tipo_data.data),
          );
          return Promise.resolve(c ? { ...c } : null);
        },
        create: ({ data }: { data: Partial<ChecklistFake> }) => {
          const novo: ChecklistFake = {
            id: `c${++seq}`,
            tipo: data.tipo!,
            data: data.data!,
            status: data.status ?? 'PENDENTE',
            imagemUrl: data.imagemUrl ?? null,
            enviadoPor: data.enviadoPor ?? null,
            enviadoEm: data.enviadoEm ?? null,
          };
          checklists.push(novo);
          return Promise.resolve({ ...novo });
        },
        upsert: ({
          where: { tipo_data },
          create,
          update,
        }: {
          where: { tipo_data: { tipo: string; data: Date } };
          create: Partial<ChecklistFake>;
          update: Partial<ChecklistFake>;
        }) => {
          const existente = checklists.find(
            (x) =>
              chave(x.tipo, x.data) === chave(tipo_data.tipo, tipo_data.data),
          );
          if (existente) {
            Object.assign(existente, update);
            return Promise.resolve({ ...existente });
          }
          const novo: ChecklistFake = {
            id: `c${++seq}`,
            tipo: create.tipo!,
            data: create.data!,
            status: create.status ?? 'PENDENTE',
            imagemUrl: create.imagemUrl ?? null,
            enviadoPor: create.enviadoPor ?? null,
            enviadoEm: create.enviadoEm ?? null,
          };
          checklists.push(novo);
          return Promise.resolve({ ...novo });
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ChecklistService(prismaFake as any);
  }

  it('define as janelas fixas 08:15-09:15 e 13:15-14:15 (Req 5.2.1, 5.2.2)', () => {
    expect(janela('ABERTURA')).toEqual({
      inicioMin: 8 * 60 + 15,
      fimMin: 9 * 60 + 15,
    });
    expect(janela('FECHAMENTO')).toEqual({
      inicioMin: 13 * 60 + 15,
      fimMin: 14 * 60 + 15,
    });
  });

  it('marca o checklist como FEITO ao enviar uma imagem válida (Req 5.1.2)', async () => {
    const service = criarServico();
    const data = hojeBrasiliaAs('08:20');
    const c = await service.enviarImagem(
      'ABERTURA',
      data,
      { mimeType: 'image/png', url: 's3://img.png' },
      'user-1',
      data,
    );
    expect(c.status).toBe('FEITO');
    expect(c.enviadoPor).toBe('user-1');
    expect(await service.status('ABERTURA', data)).toBe('FEITO');
  });

  it('rejeita carregar o checklist de um dia que já passou', async () => {
    const service = criarServico();
    const ontem = hojeBrasiliaAs('08:20');
    ontem.setUTCDate(ontem.getUTCDate() - 1);
    await expect(
      service.enviarImagem(
        'ABERTURA',
        ontem,
        { mimeType: 'image/png' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ChecklistDiaPassadoError);
  });

  it('rejeita arquivo não-imagem mantendo o status pendente (Req 5.1.4)', async () => {
    const service = criarServico();
    const data = new Date('2024-03-10T13:20:00Z');
    await service.garantirChecklistDoDia('FECHAMENTO', data);
    await expect(
      service.enviarImagem(
        'FECHAMENTO',
        data,
        { mimeType: 'application/pdf' },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ArquivoNaoImagemError);
    expect(await service.status('FECHAMENTO', data)).toBe('PENDENTE');
  });

  it('dispara o alerta às 09:00 quando a abertura está pendente (Req 5.3.1)', async () => {
    const service = criarServico();
    // O alerta de pendência dispara 15 min antes do limite da janela (09:15),
    // ou seja, às 09:00 (ver ALERTA_PENDENTE_MIN no domínio).
    const antes = new Date('2024-03-10T08:55:00Z');
    const limite = new Date('2024-03-10T09:00:00Z');
    expect(await service.verificarAlerta('ABERTURA', antes)).toBe(false);
    expect(await service.verificarAlerta('ABERTURA', limite)).toBe(true);
  });

  it('não dispara alerta quando o checklist já foi feito', async () => {
    const service = criarServico();
    const data = hojeBrasiliaAs('08:30');
    await service.enviarImagem(
      'ABERTURA',
      data,
      { mimeType: 'image/jpeg' },
      'user-1',
    );
    const limite = hojeBrasiliaAs('08:55');
    expect(await service.verificarAlerta('ABERTURA', limite)).toBe(false);
  });

  describe('notificação ao carregar o checklist (sucesso/atraso)', () => {
    // A pontualidade (`noPrazo`) é derivada do relógio real de Brasília; por
    // isso fixamos o horário do sistema para exercitar cada ramo de forma
    // determinística.
    afterEach(() => jest.useRealTimers());

    /** Drena a fila de microtasks (a notificação é disparada em best-effort). */
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };

    function criarComNotificacoes() {
      const enviados: {
        destinatarios: { id: string }[];
        conteudo: { titulo: string; mensagem: string };
      }[] = [];
      const prismaFake = {
        checklist: {
          upsert: ({ create }: { create: Record<string, unknown> }) =>
            Promise.resolve({ id: 'c1', ...create }),
        },
        usuario: {
          findUnique: () =>
            Promise.resolve({ nome: 'Fulano', login: 'user-1' }),
        },
      };
      const notificacoesFake = {
        destinatariosAlertaChecklist: () =>
          Promise.resolve([{ id: 'g1' }, { id: 'f1' }]),
        enviar: (
          destinatarios: { id: string }[],
          conteudo: { titulo: string; mensagem: string },
        ) => {
          enviados.push({ destinatarios, conteudo });
          return Promise.resolve([]);
        },
      };
      const service = new ChecklistService(
        prismaFake as never,
        notificacoesFake as never,
      );
      return { service, enviados };
    }

    it('avisa "feito com sucesso" quando enviado dentro da janela', async () => {
      // 11:30 UTC = 08:30 em Brasília (dentro da janela de abertura 08:15–09:15).
      jest.useFakeTimers({ now: new Date('2024-03-10T11:30:00.000Z') });
      const { service, enviados } = criarComNotificacoes();

      await service.enviarImagem(
        'ABERTURA',
        new Date('2024-03-10T11:30:00.000Z'),
        { mimeType: 'image/png' },
        'user-1',
      );
      await flush();

      expect(enviados).toHaveLength(1);
      expect(enviados[0].destinatarios.map((d) => d.id).sort()).toEqual([
        'f1',
        'g1',
      ]);
      expect(enviados[0].conteudo.mensagem).toBe(
        'Checklist da abertura feito com sucesso por Fulano.',
      );
    });

    it('avisa "feito com atraso" quando enviado fora da janela', async () => {
      // 13:30 UTC = 10:30 em Brasília (após o fim da janela de abertura 09:15).
      jest.useFakeTimers({ now: new Date('2024-03-10T13:30:00.000Z') });
      const { service, enviados } = criarComNotificacoes();

      await service.enviarImagem(
        'ABERTURA',
        new Date('2024-03-10T13:30:00.000Z'),
        { mimeType: 'image/png' },
        'user-1',
      );
      await flush();

      expect(enviados).toHaveLength(1);
      expect(enviados[0].conteudo.mensagem).toBe(
        'Checklist da abertura feito com atraso por Fulano.',
      );
    });
  });
});
