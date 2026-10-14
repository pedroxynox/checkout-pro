import {
  FeedforwardAlertasService,
  mensagemAviso,
} from './feedforward-alertas.service';
import { PontoVencido } from './feedforward.service';

/**
 * Testes do cron de avisos do Feedforward: agrupa por colaborador (um aviso
 * por pessoa), monta o texto certo (vence hoje x venceu há N dias), não
 * duplica no mesmo dia e é defensivo (falha isolada / sem destinatários /
 * sem serviço de notificações).
 */
describe('FeedforwardAlertasService', () => {
  const HOJE = new Date(Date.UTC(2026, 6, 15, 11, 0)); // 08:00 BRT

  function pv(over: Partial<PontoVencido> = {}): PontoVencido {
    return {
      pontoId: 'p1',
      colaboradorId: 'c1',
      nome: 'Ana Souza',
      descricao: 'Agilizar o atendimento',
      prazo: new Date(Date.UTC(2026, 6, 15)),
      diasAtraso: 0,
      ...over,
    };
  }

  function criar(
    vencidos: PontoVencido[],
    opts: { destinatarios?: { id: string }[]; semNotificacoes?: boolean } = {},
  ) {
    const enviar = jest.fn(() => Promise.resolve([]));
    const destinatariosComPermissao = jest.fn(() =>
      Promise.resolve(opts.destinatarios ?? [{ id: 'g1' }]),
    );
    const feedforward = {
      pontosVencidosDoDia: jest.fn(() => Promise.resolve(vencidos)),
    };
    const notificacoes = { destinatariosComPermissao, enviar };
    const service = new FeedforwardAlertasService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      feedforward as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opts.semNotificacoes ? undefined : (notificacoes as any),
    );
    return { service, enviar, destinatariosComPermissao, feedforward };
  }

  it('avisa quem tem FEEDFORWARD_VISUALIZAR no dia do prazo', async () => {
    const { service, enviar, destinatariosComPermissao } = criar([pv()]);
    await service.verificarPrazos(HOJE);
    expect(destinatariosComPermissao).toHaveBeenCalledWith(
      'FEEDFORWARD_VISUALIZAR',
    );
    expect(enviar).toHaveBeenCalledTimes(1);
    const [dest, conteudo] = enviar.mock.calls[0] as any[];
    expect(dest).toEqual([{ id: 'g1' }]);
    expect(conteudo.titulo).toContain('Feedforward');
    expect(conteudo.mensagem).toContain('Ana');
    expect(conteudo.mensagem).toContain('Agilizar o atendimento');
    expect(conteudo.mensagem).toContain('chegou');
  });

  it('envia um único aviso por colaborador, reunindo os pontos dele', async () => {
    const { service, enviar } = criar([
      pv({ pontoId: 'p1', descricao: 'Ponto A' }),
      pv({ pontoId: 'p2', descricao: 'Ponto B', diasAtraso: 7 }),
      pv({ pontoId: 'p3', colaboradorId: 'c2', nome: 'Bruno Lima' }),
    ]);
    await service.verificarPrazos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(2);
    const mensagens: string[] = enviar.mock.calls.map(
      (c) => (c as any[])[1].mensagem,
    );
    const daAna = mensagens.find((m) => m.includes('Ana')) as string;
    expect(daAna).toContain('2 pontos');
    expect(daAna).toContain('Ponto A');
    expect(daAna).toContain('Ponto B');
    expect(mensagens.some((m) => m.includes('Bruno'))).toBe(true);
  });

  it('não duplica o aviso do mesmo colaborador no mesmo dia', async () => {
    const { service, enviar } = criar([pv()]);
    await service.verificarPrazos(HOJE);
    await service.verificarPrazos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('volta a avisar depois do reset da meia-noite', async () => {
    const { service, enviar } = criar([pv()]);
    await service.verificarPrazos(HOJE);
    service.resetarDiario();
    await service.verificarPrazos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('em outro dia, avisa de novo (chave por dia)', async () => {
    const { service, enviar } = criar([pv()]);
    await service.verificarPrazos(HOJE);
    await service.verificarPrazos(new Date(Date.UTC(2026, 6, 22, 11, 0)));
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('sem pontos a avisar, não consulta destinatários nem envia', async () => {
    const { service, enviar, destinatariosComPermissao } = criar([]);
    await service.verificarPrazos(HOJE);
    expect(destinatariosComPermissao).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('sem destinatários, não envia', async () => {
    const { service, enviar } = criar([pv()], { destinatarios: [] });
    await service.verificarPrazos(HOJE);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('sem serviço de notificações (testes/ambiente), não faz nada', async () => {
    const { service, feedforward } = criar([pv()], { semNotificacoes: true });
    await expect(service.verificarPrazos(HOJE)).resolves.toBeUndefined();
    expect(feedforward.pontosVencidosDoDia).not.toHaveBeenCalled();
  });

  it('uma falha de envio não derruba os demais e permite tentar de novo', async () => {
    const { service, enviar } = criar([
      pv({ colaboradorId: 'c1', nome: 'Ana' }),
      pv({ pontoId: 'p2', colaboradorId: 'c2', nome: 'Bruno' }),
    ]);
    enviar.mockRejectedValueOnce(new Error('push indisponível'));
    await service.verificarPrazos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(2);
    // A falha não foi marcada como enviada: nova execução tenta só a que falhou.
    await service.verificarPrazos(HOJE);
    expect(enviar).toHaveBeenCalledTimes(3);
  });
});

describe('mensagemAviso', () => {
  const base: PontoVencido = {
    pontoId: 'p1',
    colaboradorId: 'c1',
    nome: 'Ana Souza',
    descricao: 'Agilizar o atendimento',
    prazo: new Date(Date.UTC(2026, 6, 15)),
    diasAtraso: 0,
  };

  it('no dia do prazo pede o próximo acompanhamento', () => {
    const m = mensagemAviso([base]);
    expect(m).toContain('Ana');
    expect(m).not.toContain('Souza');
    expect(m).toContain('chegou');
    expect(m).toContain('"Agilizar o atendimento"');
  });

  it('no lembrete diz há quantos dias venceu', () => {
    const m = mensagemAviso([{ ...base, diasAtraso: 14 }]);
    expect(m).toContain('continua pendente');
    expect(m).toContain('venceu há 14 dias');
  });

  it('com vários pontos lista cada um com a sua situação', () => {
    const m = mensagemAviso([
      { ...base, descricao: 'A' },
      { ...base, pontoId: 'p2', descricao: 'B', diasAtraso: 7 },
    ]);
    expect(m).toContain('2 pontos');
    expect(m).toContain('"A" (vence hoje)');
    expect(m).toContain('"B" (venceu há 7 dias)');
  });
});
