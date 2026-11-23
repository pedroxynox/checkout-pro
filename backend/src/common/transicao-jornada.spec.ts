import { SaudacaoDiariaService } from '../alertas/saudacao-diaria.service';
import { FiscaisAlertasService } from '../fiscais/fiscais-alertas.service';
import { FiscaisHorarioService } from '../fiscais/fiscais-horario.service';
import { OperadorTurnoService } from '../operadores/operador-turno.service';
import {
  VARIAVEL_PAUSA_TRANSICAO_JORNADA,
  pausaTransicaoJornadaAtiva,
} from './transicao-jornada';

/**
 * Pausa de transição da jornada (spec `jornada-5x2` §8). A função só liga com o
 * texto exato "true" — o boot recusa qualquer outro valor que não "false"
 * (`env.validation.ts`), então não existe meio-termo silencioso.
 */
describe('pausaTransicaoJornadaAtiva', () => {
  it.each([
    [undefined, false],
    ['false', false],
    ['', false],
    ['true', true],
  ])('PAUSA_TRANSICAO_JORNADA=%p → %p', (valor, esperado) => {
    const env: NodeJS.ProcessEnv =
      valor === undefined ? {} : { [VARIAVEL_PAUSA_TRANSICAO_JORNADA]: valor };
    expect(pausaTransicaoJornadaAtiva(env)).toBe(esperado);
  });

  it('lê process.env por padrão (a cada chamada)', () => {
    process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA] = 'true';
    expect(pausaTransicaoJornadaAtiva()).toBe(true);
    delete process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA];
    expect(pausaTransicaoJornadaAtiva()).toBe(false);
  });
});

/**
 * Os crons que dependem do horário/carga antigos saem antes de consultar
 * qualquer coisa. Cada fake registra o primeiro acesso que o método faria; com a
 * pausa ligada ele não pode acontecer.
 */
describe('Pausa de transição — crons suspensos', () => {
  beforeEach(() => {
    process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA] = 'true';
  });
  afterEach(() => {
    delete process.env[VARIAVEL_PAUSA_TRANSICAO_JORNADA];
  });

  function fiscaisAlertas() {
    const prisma = {
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      registroPontoFiscal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notificacoes = {
      enviar: jest.fn(),
      destinatariosComPermissao: jest.fn().mockResolvedValue([]),
    };
    const service = new FiscaisAlertasService(
      prisma as never,
      notificacoes as never,
      {} as never,
    );
    return { service, prisma, notificacoes };
  }

  it('análise semanal de padrões dos fiscais (segunda 08:00)', async () => {
    const { service, prisma, notificacoes } = fiscaisAlertas();
    await service.analisarPadroes();
    expect(prisma.fiscal.findMany).not.toHaveBeenCalled();
    expect(notificacoes.enviar).not.toHaveBeenCalled();
  });

  it('aviso de cobertura baixa dos operadores (07:00)', async () => {
    const notificacoes = {
      enviar: jest.fn(),
      destinatariosComPermissao: jest.fn().mockResolvedValue([]),
    };
    const service = new OperadorTurnoService(
      {} as never,
      notificacoes as never,
    );
    const dia = jest.spyOn(service, 'diaOperadores');
    await service.avisoCoberturaCritica();
    expect(dia).not.toHaveBeenCalled();
    expect(notificacoes.enviar).not.toHaveBeenCalled();
  });

  it('lembrete de 10 min antes da entrada do fiscal', async () => {
    const prisma = {
      escalaEntry: { findMany: jest.fn().mockResolvedValue([]) },
      colaborador: { findMany: jest.fn().mockResolvedValue([]) },
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const notificacoes = { enviar: jest.fn() };
    const service = new FiscaisHorarioService(
      prisma as never,
      notificacoes as never,
    );
    await service.verificarHorarios();
    expect(prisma.escalaEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.colaborador.findMany).not.toHaveBeenCalled();
    expect(notificacoes.enviar).not.toHaveBeenCalled();
  });

  it('saudação de entrada dos fiscais', async () => {
    const relogio = { agora: jest.fn(() => new Date()) };
    const notificacoes = { enviar: jest.fn() };
    const service = new SaudacaoDiariaService(
      {} as never,
      notificacoes as never,
      relogio as never,
    );
    await service.saudarFiscais();
    expect(relogio.agora).not.toHaveBeenCalled();
    expect(notificacoes.enviar).not.toHaveBeenCalled();
  });
});
