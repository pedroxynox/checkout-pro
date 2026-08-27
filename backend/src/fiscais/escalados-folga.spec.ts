import { FiscaisService } from './fiscais.service';
import { FolgaService } from '../escala-domingo/folga.service';

/**
 * REGRESSÃO: `escaladosDoDia` respeita a folga das DUAS fontes.
 *
 * O caso real: um fiscal com folga na **terça** na ficha, cuja escala semanal
 * (`EscalaEntry`) não havia sido atualizada. O ramo dos fiscais consultava só a
 * escala, o dos operadores só a ficha — então ele era escalado, não batia ponto
 * (estava descansando) e recebia **falta automática** duas horas depois, no
 * próprio dia de descanso. A falta ainda ficava presa: a auto-cura espera uma
 * batida, que num dia de folga nunca chega.
 *
 * Como `escaladosDoDia` é a fonte única da equipe do dia e da detecção
 * automática, sair daqui é o que impede a falta de nascer.
 */
describe('FiscaisService.escaladosDoDia — respeita a folga das duas fontes', () => {
  const TERCA = new Date(Date.UTC(2026, 6, 21)); // 2026-07-21, diaSemana 2

  /**
   * @param fichaFolgaTerca a ficha do fiscal marca folga na terça
   * @param escalaFolgaTerca a escala semanal marca folga na terça
   */
  function criarServico(
    fichaFolgaTerca: boolean,
    escalaFolgaTerca: boolean,
  ): FiscaisService {
    const colaboradores = [
      {
        id: 'col-erick',
        nome: 'Erick',
        funcao: 'FISCAL',
        folgaDiaSemana: fichaFolgaTerca ? 2 : 0,
        grupoDomingo: null,
        entradaSemana: '07:00',
        entradaFds: '08:00',
        entradaDom: null,
      },
    ];
    const entradasEscala = escalaFolgaTerca
      ? [
          {
            funcionarioId: 'fiscal-erick',
            colaboradorId: 'col-erick',
            diaSemana: 2,
          },
        ]
      : [];

    const prismaFake = {
      colaborador: {
        // O `where` importa: o ramo dos operadores filtra por função (e o fiscal
        // não pode aparecer nos dois ramos), enquanto o FolgaService consulta
        // todas as fichas sem filtro.
        findMany: (args?: { where?: { funcao?: { in: string[] } } }) => {
          const funcoes = args?.where?.funcao?.in;
          return Promise.resolve(
            funcoes
              ? colaboradores.filter((c) => funcoes.includes(c.funcao))
              : colaboradores,
          );
        },
      },
      escalaEntry: { findMany: () => Promise.resolve(entradasEscala) },
    };

    // A escala consolidada é a fonte dos fiscais: aqui ela SEMPRE escala o
    // Erick, que é justamente a situação do bug (escala desatualizada).
    const escalaFake = {
      escalaConsolidada: () =>
        Promise.resolve([
          {
            funcionarioId: 'fiscal-erick',
            colaboradorId: 'col-erick',
            nome: 'Erick',
            matricula: null,
            efetiva: {
              funcionarioId: 'fiscal-erick',
              diaSemana: 2,
              entrada: '07:00',
              saida: '15:20',
              intervaloMin: 60,
              folga: false,
              especial: false,
            },
          },
        ]),
    };

    const folga = new FolgaService(prismaFake as never, undefined);

    // Ordem do construtor: prisma, eventos, notificacoes, validacaoData,
    // feriados, cicloFolha, tiposContrato, escala, escalaDomingo, ferias, folga.
    return new FiscaisService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      escalaFake as never,
      undefined,
      undefined,
      folga,
    );
  }

  it('escala o fiscal quando nenhuma fonte diz folga', async () => {
    const escalados = await criarServico(false, false).escaladosDoDia(TERCA);
    expect(escalados.map((e) => e.pessoaId)).toEqual(['fiscal-erick']);
  });

  it('NÃO escala quando a FICHA diz folga, mesmo com a escala semanal escalando', async () => {
    // Este é o bug. Antes desta regra o fiscal aparecia aqui e virava falta.
    const escalados = await criarServico(true, false).escaladosDoDia(TERCA);
    expect(escalados).toEqual([]);
  });

  it('NÃO escala quando a ESCALA diz folga', async () => {
    const escalados = await criarServico(false, true).escaladosDoDia(TERCA);
    expect(escalados).toEqual([]);
  });
});
