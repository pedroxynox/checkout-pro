import {
  AUTOR_ENCERRAMENTO_AUTOMATICO,
  DIAS_ENCERRAMENTO_AUTOMATICO,
  corteEncerramentoAutomatico,
  dadosEncerramentoAutomatico,
} from '../common/justificativas';
import { encerrarPendencias } from '../common/encerrar-pendencias';
import { EncerramentoAutomaticoService } from './encerramento-automatico.service';

/**
 * Encerramento automático das pendências de escala.
 *
 * O dono do projeto se cansou de decidir falta por falta: depois de alguns dias
 * ele já não sabe o motivo do colaborador. A regra: o que fica 3 dias PENDENTE é
 * encerrado pelo sistema como "não justificada" — sem mexer no débito de horas,
 * que continua sendo decisão dele na Central de Jornada.
 */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('regra pura do encerramento (common/justificativas)', () => {
  it('são 3 dias', () => {
    expect(DIAS_ENCERRAMENTO_AUTOMATICO).toBe(3);
  });

  it('a ocorrência do dia D fecha no dia D+3, não antes', () => {
    // Corte exclusivo: entra o que tem `data` ANTES dele.
    const corteD3 = corteEncerramentoAutomatico(dia('2026-07-13'));
    expect(dia('2026-07-10').getTime()).toBeLessThan(corteD3.getTime()); // D
    expect(dia('2026-07-11').getTime()).toBe(corteD3.getTime()); // D+1 fica

    const corteD2 = corteEncerramentoAutomatico(dia('2026-07-12'));
    expect(dia('2026-07-10').getTime()).toBe(corteD2.getTime()); // ainda não
  });

  it('ignora a hora do dia de referência', () => {
    expect(
      corteEncerramentoAutomatico(new Date('2026-07-13T22:30:00.000Z')),
    ).toEqual(corteEncerramentoAutomatico(dia('2026-07-13')));
  });

  it('grava "não justificada" com o sistema como autor e sem motivo', () => {
    const agora = new Date('2026-07-13T06:00:00.000Z');
    const d = dadosEncerramentoAutomatico(agora);
    expect(d.statusJustificativa).toBe('INJUSTIFICADA');
    expect(d.motivoJustificativa).toBeNull();
    expect(d.justificadaPorId).toBeNull();
    expect(d.justificadaPorNome).toBe(AUTOR_ENCERRAMENTO_AUTOMATICO);
    expect(d.justificadaEm).toEqual(agora);
    expect(d.observacaoJustificativa).toMatch(/3 dias/);
    // O débito é do gestor: o encerramento não o liga.
    expect(d).not.toHaveProperty('debitoHoras');
  });
});

describe('encerrarPendencias', () => {
  function fakePrisma() {
    return {
      ausencia: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      incidenciaEscala: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it('só toca PENDENTE, antes do corte, e só o não-retorno entre as incidências', async () => {
    const prisma = fakePrisma();
    const r = await encerrarPendencias(prisma, { ate: dia('2026-07-11') });

    expect(r).toEqual({ faltas: 2, naoRetornos: 1 });
    const falta = prisma.ausencia.updateMany.mock.calls[0][0];
    expect(falta.where.statusJustificativa).toBe('PENDENTE');
    expect(falta.where.data).toEqual({ lt: dia('2026-07-11') });
    expect(falta.data.statusJustificativa).toBe('INJUSTIFICADA');
    expect(falta.data).not.toHaveProperty('debitoHoras');

    const nr = prisma.incidenciaEscala.updateMany.mock.calls[0][0];
    // Advertência e suspensão também têm status de justificativa: não entram.
    expect(nr.where.tipo).toBe('NAO_RETORNO_INTERVALO');
    expect(nr.where.statusJustificativa).toBe('PENDENTE');
  });

  it('não mexe nos ciclos de folha fechados', async () => {
    const prisma = fakePrisma();
    const fechado = {
      inicio: dia('2026-05-26'),
      fimExclusivo: dia('2026-06-26'),
    };
    await encerrarPendencias(prisma, {
      ate: dia('2026-07-11'),
      excluir: [fechado],
    });
    const where = prisma.ausencia.updateMany.mock.calls[0][0].where;
    expect(where.NOT).toEqual({
      OR: [{ data: { gte: fechado.inicio, lt: fechado.fimExclusivo } }],
    });
  });

  it('com `desde`, limita à janela (é o que o fechamento do ciclo usa)', async () => {
    const prisma = fakePrisma();
    await encerrarPendencias(prisma, {
      desde: dia('2026-06-26'),
      ate: dia('2026-07-26'),
    });
    expect(prisma.ausencia.updateMany.mock.calls[0][0].where.data).toEqual({
      gte: dia('2026-06-26'),
      lt: dia('2026-07-26'),
    });
  });
});

describe('EncerramentoAutomaticoService', () => {
  function montar(contagens = { faltas: 0, naoRetornos: 0 }) {
    const prisma = {
      ausencia: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(contagens.faltas),
      },
      incidenciaEscala: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(contagens.naoRetornos),
      },
      cicloFolha: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notificacoes = { notificarComPermissao: jest.fn() };
    const service = new EncerramentoAutomaticoService(
      prisma as never,
      notificacoes as never,
    );
    return { service, prisma, notificacoes };
  }

  it('encerra usando o corte do dia e só nos ciclos abertos', async () => {
    const { service, prisma } = montar();
    await service.encerrar(dia('2026-07-13'));
    expect(prisma.cicloFolha.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'FECHADO' } }),
    );
    expect(prisma.ausencia.updateMany.mock.calls[0][0].where.data).toEqual({
      lt: dia('2026-07-11'),
    });
  });

  it('avisa a gestão, num aviso só, do que encerra amanhã', async () => {
    const { service, prisma, notificacoes } = montar({
      faltas: 2,
      naoRetornos: 1,
    });
    const total = await service.avisarVesperas(dia('2026-07-13'));

    expect(total).toBe(3);
    // Encerram amanhã (14/07) as do dia 11/07: [corte de hoje, corte de amanhã).
    expect(prisma.ausencia.count.mock.calls[0][0].where.data).toEqual({
      gte: dia('2026-07-11'),
      lt: dia('2026-07-12'),
    });
    expect(notificacoes.notificarComPermissao).toHaveBeenCalledTimes(1);
    expect(notificacoes.notificarComPermissao).toHaveBeenCalledWith(
      'OPERADORES_AUSENCIAS',
      expect.objectContaining({ titulo: '⏳ Pendências encerram amanhã' }),
    );
  });

  it('não avisa quando nada encerra amanhã', async () => {
    const { service, notificacoes } = montar();
    expect(await service.avisarVesperas(dia('2026-07-13'))).toBe(0);
    expect(notificacoes.notificarComPermissao).not.toHaveBeenCalled();
  });

  it('o cron nunca derruba o processo', async () => {
    const { service, prisma } = montar();
    prisma.cicloFolha.findMany.mockRejectedValue(new Error('banco fora'));
    await expect(service.encerrarDiario()).resolves.toBeUndefined();
    await expect(service.avisarDiario()).resolves.toBeUndefined();
  });
});
