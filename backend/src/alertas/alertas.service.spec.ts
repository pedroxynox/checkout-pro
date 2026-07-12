import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChecklistService } from '../checklist/checklist.service';
import { Relogio } from '../common/relogio';
import { ArrecadacaoService } from '../arrecadacao/arrecadacao.service';
import type { StatusArrecadacao } from '../arrecadacao/arrecadacao.service';
import { TIPOS_ARRECADACAO } from '../arrecadacao/arrecadacao.domain';
import { FechamentoService } from '../fechamento/fechamento.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AlertasService, expressaoCronDiaria } from './alertas.service';

/**
 * Testes de integração dos cron jobs de alertas (Tarefa 15.2). Usam um relógio
 * injetável fixo para validar o disparo nos horários-limite (08:55/13:55 e fim
 * do dia) e a seleção de destinatários (união fiscais online + login gerencial
 * no checklist; login gerencial nas importações pendentes).
 *
 * Os serviços de checklist e notificações são reais (com um Prisma falso em
 * memória), exercitando a lógica de alerta e a entrega em duplo canal; o
 * serviço de arrecadação é simulado para controlar os tipos pendentes do dia.
 */
describe('AlertasService (cron com relógio injetável)', () => {
  interface UsuarioFake {
    id: string;
    perfil: 'GERENTE' | 'FISCAL';
    online: boolean;
  }
  interface NotificacaoCriada {
    usuarioId: string;
    titulo: string;
    mensagem: string;
    canalPush: boolean;
    canalInApp: boolean;
  }

  function montar(opts: {
    agora: Date;
    statusChecklist?: 'PENDENTE' | 'FEITO';
    pendentesImportacao?: string[];
    fechamentoCompleto?: boolean;
  }) {
    const usuarios: UsuarioFake[] = [
      { id: 'g1', perfil: 'GERENTE', online: false },
      { id: 'f1', perfil: 'FISCAL', online: true },
      { id: 'f2', perfil: 'FISCAL', online: false },
    ];
    const criadas: NotificacaoCriada[] = [];

    let seq = 0;
    const prismaFake = {
      checklist: {
        findUnique: () =>
          Promise.resolve(
            opts.statusChecklist ? { status: opts.statusChecklist } : null,
          ),
      },
      usuario: {
        findMany: ({
          where,
        }: {
          where?: { online?: boolean; perfil?: string | { in: string[] } };
        }) =>
          Promise.resolve(
            usuarios.filter((u) => {
              const onlineOk =
                where?.online === undefined || u.online === where.online;
              const perfilOk =
                where?.perfil === undefined
                  ? true
                  : typeof where.perfil === 'string'
                    ? u.perfil === where.perfil
                    : where.perfil.in.includes(u.perfil);
              return onlineOk && perfilOk;
            }),
          ),
      },
      notificacao: {
        create: ({ data }: { data: NotificacaoCriada }) => {
          criadas.push(data);
          return Promise.resolve({ id: `n${++seq}`, ...data });
        },
      },
    };

    const checklistService = new ChecklistService(prismaFake as never);
    const notificacoesService = new NotificacoesService(prismaFake as never);
    // Simula o status de arrecadação do dia: os tipos informados em
    // `pendentesImportacao` ficam PENDENTE; os demais, ENVIADO.
    const arrecadacaoServiceFake = {
      status: jest.fn(() => {
        const pendentes = new Set(opts.pendentesImportacao ?? []);
        const status = {} as StatusArrecadacao;
        for (const tipo of TIPOS_ARRECADACAO) {
          status[tipo] = pendentes.has(tipo) ? 'PENDENTE' : 'ENVIADO';
        }
        return Promise.resolve(status);
      }),
    } as unknown as ArrecadacaoService;
    // Simula o estado do fechamento do dia: completo ou pendente.
    const fechamentoServiceFake = {
      estaCompleto: jest.fn(() =>
        Promise.resolve(opts.fechamentoCompleto ?? false),
      ),
    } as unknown as FechamentoService;
    const relogio: Relogio = { agora: () => opts.agora };
    const config = {
      get: (chave: string) =>
        chave === 'HORARIO_FIM_DO_DIA' ? '18:00' : undefined,
    } as unknown as ConfigService;
    const scheduler = {
      doesExist: jest.fn(() => false),
      addCronJob: jest.fn(),
    } as unknown as SchedulerRegistry;

    const service = new AlertasService(
      checklistService,
      arrecadacaoServiceFake,
      fechamentoServiceFake,
      notificacoesService,
      config,
      scheduler,
      relogio,
    );

    return {
      service,
      criadas,
      arrecadacaoServiceFake,
      fechamentoServiceFake,
      scheduler,
    };
  }

  describe('alerta de checklist', () => {
    it('dispara no horário-limite (09:00) com checklist pendente', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T09:00:00.000Z'),
        statusChecklist: 'PENDENTE',
      });

      const disparou = await service.dispararAlertaChecklist('ABERTURA');

      expect(disparou).toBe(true);
      // Destinatários: todos os perfis operacionais (fiscais g1... e f1/f2,
      // online ou não). Aqui: g1 (gerente) + f1 e f2 (fiscais).
      const destinatarios = criadas.map((c) => c.usuarioId).sort();
      expect(destinatarios).toEqual(['f1', 'f2', 'g1']);
      // Entrega em duplo canal.
      expect(criadas.every((c) => c.canalPush && c.canalInApp)).toBe(true);
    });

    it('não dispara antes do horário-limite (08:00)', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T08:00:00.000Z'),
        statusChecklist: 'PENDENTE',
      });

      const disparou = await service.dispararAlertaChecklist('ABERTURA');

      expect(disparou).toBe(false);
      expect(criadas).toHaveLength(0);
    });

    it('não dispara quando o checklist já está FEITO', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T13:55:00.000Z'),
        statusChecklist: 'FEITO',
      });

      const disparou = await service.dispararAlertaChecklist('FECHAMENTO');

      expect(disparou).toBe(false);
      expect(criadas).toHaveLength(0);
    });
  });

  describe('alerta de importações pendentes', () => {
    it('notifica todos os perfis operacionais quando há pendentes', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T18:00:00.000Z'),
        pendentesImportacao: ['CANCELAMENTO_ITENS', 'DEVOLUCOES'],
      });

      const pendentes = await service.dispararAlertaImportacoesPendentes();

      expect(pendentes).toEqual(['CANCELAMENTO_ITENS', 'DEVOLUCOES']);
      // Um único aviso, entregue a todos os perfis operacionais (g1, f1, f2).
      expect(criadas.map((c) => c.usuarioId).sort()).toEqual([
        'f1',
        'f2',
        'g1',
      ]);
      expect(criadas[0].titulo).toBe('Importações pendentes');
    });

    it('não notifica quando não há pendentes', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T18:00:00.000Z'),
        pendentesImportacao: [],
      });

      const pendentes = await service.dispararAlertaImportacoesPendentes();

      expect(pendentes).toEqual([]);
      expect(criadas).toHaveLength(0);
    });

    it('não notifica quando o fechamento do dia já está concluído', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T18:00:00.000Z'),
        pendentesImportacao: ['DEVOLUCOES'],
        fechamentoCompleto: true,
      });

      const pendentes = await service.dispararAlertaImportacoesPendentes();

      expect(pendentes).toEqual([]);
      expect(criadas).toHaveLength(0);
    });

    it('avalia o DIA OPERACIONAL de Brasília (não o dia seguinte em UTC)', async () => {
      // 01:50 UTC do dia 11 == 22:50 de Brasília do dia 10 (o dia operacional).
      const { service, fechamentoServiceFake, arrecadacaoServiceFake } = montar({
        agora: new Date('2024-03-11T01:50:00.000Z'),
        pendentesImportacao: ['DEVOLUCOES'],
      });

      await service.dispararAlertaImportacoesPendentes();

      const diaFechamento = (
        fechamentoServiceFake.estaCompleto as jest.Mock
      ).mock.calls[0][0] as Date;
      const diaStatus = (arrecadacaoServiceFake.status as jest.Mock).mock
        .calls[0][0] as Date;
      // Deve consultar o dia 10 (Brasília), e não o dia 11 (UTC).
      expect(diaFechamento.getUTCDate()).toBe(10);
      expect(diaStatus.getUTCDate()).toBe(10);
    });
  });

  describe('lembrete de fechamento (22:20)', () => {
    it('avisa todos os perfis operacionais quando o fechamento está pendente', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T22:20:00.000Z'),
        fechamentoCompleto: false,
      });

      const disparou = await service.dispararLembreteFechamentoArquivos();

      expect(disparou).toBe(true);
      // Aviso único, entregue a todos os perfis operacionais (g1, f1, f2).
      expect(criadas.map((c) => c.usuarioId).sort()).toEqual([
        'f1',
        'f2',
        'g1',
      ]);
      expect(criadas[0].titulo).toBe('Fechamento pendente');
      expect(criadas.every((c) => c.canalPush && c.canalInApp)).toBe(true);
    });

    it('não incomoda ninguém quando o fechamento já está completo', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T22:20:00.000Z'),
        fechamentoCompleto: true,
      });

      const disparou = await service.dispararLembreteFechamentoArquivos();

      expect(disparou).toBe(false);
      expect(criadas).toHaveLength(0);
    });
  });

  describe('agendamento configurável', () => {
    it('monta a expressão cron diária a partir do horário de fim do dia', () => {
      expect(expressaoCronDiaria('18:00')).toBe('0 18 * * *');
      expect(expressaoCronDiaria('21:30')).toBe('30 21 * * *');
    });
  });
});
