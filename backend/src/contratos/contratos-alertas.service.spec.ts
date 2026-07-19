import { ContratosAlertasService } from './contratos-alertas.service';
import { AlertaDoDia } from './contratos.service';

/**
 * Testes do cron de alertas de contrato: envia aos gestores, monta a mensagem
 * certa (vencimento x decisão em atraso) e não duplica no mesmo dia.
 */
describe('ContratosAlertasService', () => {
  const HOJE = new Date(Date.UTC(2026, 6, 1));

  function criar(alertas: AlertaDoDia[]) {
    const enviar = jest.fn(() => Promise.resolve([]));
    const destinatariosComPermissao = jest.fn(() =>
      Promise.resolve([{ id: 'g1' }]),
    );
    const contratos = {
      avaliarAlertasDoDia: jest.fn(() => Promise.resolve(alertas)),
    };
    const notificacoes = { destinatariosComPermissao, enviar };
    const service = new ContratosAlertasService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contratos as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificacoes as any,
    );
    return { service, enviar, destinatariosComPermissao };
  }

  it('envia um aviso de vencimento aos gestores', async () => {
    const { service, enviar } = criar([
      {
        colaboradorId: 'c1',
        nome: 'Ana Souza',
        alerta: { tipo: 'VENCIMENTO', marco: 'MARCO_45', dias: 3 },
      },
    ]);
    await service.verificarContratos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(1);
    const conteudo = (enviar.mock.calls[0] as any[])[1];
    expect(conteudo.titulo).toContain('vencendo');
    expect(conteudo.mensagem).toContain('Ana');
    expect(conteudo.mensagem).toContain('45 dias');
  });

  it('avisa que o contrato será efetivado automaticamente ao completar 90 dias', async () => {
    const { service, enviar } = criar([
      {
        colaboradorId: 'c1',
        nome: 'Bia',
        alerta: { tipo: 'VENCIMENTO', marco: 'MARCO_90', dias: 2 },
      },
    ]);
    await service.verificarContratos(HOJE);
    const conteudo = (enviar.mock.calls[0] as any[])[1];
    expect(conteudo.titulo).toContain('vencendo');
    expect(conteudo.mensagem).toContain('90 dias');
    expect(conteudo.mensagem).toContain('efetivado automaticamente');
    expect(conteudo.mensagem).toContain('em 2 dias');
  });

  it('não duplica o mesmo alerta no mesmo dia', async () => {
    const { service, enviar } = criar([
      {
        colaboradorId: 'c1',
        nome: 'Ana',
        alerta: { tipo: 'VENCIMENTO', marco: 'MARCO_45', dias: 1 },
      },
    ]);
    await service.verificarContratos(HOJE);
    await service.verificarContratos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('após o reset diário, pode avisar de novo', async () => {
    const { service, enviar } = criar([
      {
        colaboradorId: 'c1',
        nome: 'Ana',
        alerta: { tipo: 'VENCIMENTO', marco: 'MARCO_45', dias: 1 },
      },
    ]);
    await service.verificarContratos(HOJE);
    service.resetarDiario();
    await service.verificarContratos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('não faz nada quando não há NotificacoesService (testes unitários)', async () => {
    const contratos = {
      avaliarAlertasDoDia: jest.fn(() => Promise.resolve([])),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new ContratosAlertasService(contratos as any);
    await expect(service.verificarContratos(HOJE)).resolves.toBeUndefined();
  });
});
