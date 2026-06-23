import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ChecklistService } from '../checklist/checklist.service';
import { Relogio } from '../common/relogio';
import { ArrecadacaoService } from '../arrecadacao/arrecadacao.service';
import {
  StatusArrecadacao,
  TIPOS_ARRECADACAO,
} from '../arrecadacao/arrecadacao.domain';
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
          where?: { online?: boolean; perfil?: string };
        }) =>
          Promise.resolve(
            usuarios.filter(
              (u) =>
                (where?.online === undefined || u.online === where.online) &&
                (where?.perfil === undefined || u.perfil === where.perfil),
            ),
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
      notificacoesService,
      config,
      scheduler,
      relogio,
    );

    return { service, criadas, arrecadacaoServiceFake, scheduler };
  }

  describe('alerta de checklist', () => {
    it('dispara no horário-limite (08:55) com checklist pendente', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T08:55:00.000Z'),
        statusChecklist: 'PENDENTE',
      });

      const disparou = await service.dispararAlertaChecklist('ABERTURA');

      expect(disparou).toBe(true);
      // Seleção de destinatários: fiscal online (f1) + login gerencial (g1).
      const destinatarios = criadas.map((c) => c.usuarioId).sort();
      expect(destinatarios).toEqual(['f1', 'g1']);
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
    it('notifica o login gerencial quando há pendentes', async () => {
      const { service, criadas } = montar({
        agora: new Date('2024-03-10T18:00:00.000Z'),
        pendentesImportacao: ['CANCELAMENTO_ITENS', 'DEVOLUCOES'],
      });

      const pendentes = await service.dispararAlertaImportacoesPendentes();

      expect(pendentes).toEqual(['CANCELAMENTO_ITENS', 'DEVOLUCOES']);
      expect(criadas.map((c) => c.usuarioId)).toEqual(['g1']);
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
  });

  describe('agendamento configurável', () => {
    it('monta a expressão cron diária a partir do horário de fim do dia', () => {
      expect(expressaoCronDiaria('18:00')).toBe('0 18 * * *');
      expect(expressaoCronDiaria('21:30')).toBe('30 21 * * *');
    });
  });
});
