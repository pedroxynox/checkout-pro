import { FiscaisAlertasService } from './fiscais-alertas.service';
import { inicioDoDia } from './fiscais.domain';

/**
 * O alerta de "intervalo longo" (>2h15) NÃO deve disparar para quem a
 * Escala/Jornada já considera FORA DO EXPEDIENTE (turno encerrado). Pedir para
 * "voltar do intervalo" a quem já encerrou o turno é incoerente — a falta de
 * retorno é tratada como incidência à parte.
 */
describe('FiscaisAlertasService.verificarIntervalosLongos — coerência com a jornada', () => {
  function montar(opts: { statusPainel: string }) {
    const agora = new Date();
    const data = inicioDoDia(agora);
    // Último registro: INTERVALO há 2h30 (acima do limite de 2h15).
    const registros = [
      {
        fiscalId: 'f1',
        status: 'DISPONIVEL',
        em: new Date(agora.getTime() - 4 * 60 * 60 * 1000),
        data,
      },
      {
        fiscalId: 'f1',
        status: 'INTERVALO',
        em: new Date(agora.getTime() - 150 * 60 * 1000),
        data,
      },
    ];
    const enviados: { titulo: string }[] = [];
    const prisma = {
      registroPontoFiscal: {
        findMany: () => Promise.resolve(registros.map((r) => ({ ...r }))),
      },
      fiscal: {
        findUnique: () =>
          Promise.resolve({ id: 'f1', nome: 'Sheila Souza', usuarioId: 'u1' }),
      },
      usuario: {
        findUnique: () => Promise.resolve({ id: 'u1', nome: 'Sheila' }),
      },
    };
    const notificacoes = {
      enviar: (_dest: unknown, msg: { titulo: string }) => {
        enviados.push(msg);
        return Promise.resolve();
      },
      destinatariosComPermissao: () => Promise.resolve([{ id: 'g1' }]),
    };
    const fiscais = {
      painel: () =>
        Promise.resolve([{ fiscalId: 'f1', status: opts.statusPainel }]),
    };
    const service = new FiscaisAlertasService(
      prisma as never,
      notificacoes as never,
      fiscais as never,
    );
    return { service, enviados };
  }

  it('NÃO alerta quando a jornada já indica FORA_EXPEDIENTE', async () => {
    const { service, enviados } = montar({ statusPainel: 'FORA_EXPEDIENTE' });
    await service.verificarIntervalosLongos();
    expect(enviados).toHaveLength(0);
  });

  it('alerta quando o fiscal ainda está realmente em INTERVALO', async () => {
    const { service, enviados } = montar({ statusPainel: 'INTERVALO' });
    await service.verificarIntervalosLongos();
    expect(enviados.some((m) => m.titulo.includes('Intervalo'))).toBe(true);
  });
});
