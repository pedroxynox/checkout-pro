import { FiscaisService } from './fiscais.service';
import { FolgaService } from '../escala-domingo/folga.service';

/**
 * REGRESSÃO: `escaladosDoDia` respeita a folga pela regra única — e na ordem
 * certa.
 *
 * O caso que criou esta regra: um fiscal com folga na **terça** na ficha, cuja
 * escala semanal (`EscalaEntry`) não havia sido atualizada. O ramo dos fiscais
 * consultava só a escala, o dos operadores só a ficha — então ele era escalado,
 * não batia ponto (estava descansando) e recebia **falta automática** duas horas
 * depois, no próprio dia de descanso. A falta ainda ficava presa: a auto-cura
 * espera uma batida, que num dia de folga nunca chega.
 *
 * O caso que a refinou (ADR 0023) está no último teste: quando a ficha afirma um
 * dia, uma linha GERAL antiga da escala **não** pode somar um segundo dia de
 * descanso. A escala geral é derivada da ficha; um derivado velho não vota contra
 * a fonte. Ela volta a valer quando a ficha se cala.
 *
 * Como `escaladosDoDia` é a fonte única da equipe do dia e da detecção
 * automática, sair daqui é o que impede a falta de nascer — e continuar aqui é o
 * que faz o ponto ser cobrado.
 */
describe('FiscaisService.escaladosDoDia — respeita a folga das duas fontes', () => {
  const TERCA = new Date(Date.UTC(2026, 6, 21)); // 2026-07-21, diaSemana 2

  /**
   * @param fichaFolgaDiaSemana dia de folga na FICHA (`null` = ficha omissa).
   *   A distinção importa: "sem folga na ficha" e "folga em outro dia" levam a
   *   respostas diferentes, e tratá-los como a mesma coisa era o que escondia o
   *   caso do ADR 0023.
   * @param escalaFolgaTerca a escala semanal GERAL marca folga na terça
   */
  function criarServico(
    fichaFolgaDiaSemana: number | null,
    escalaFolgaTerca: boolean,
  ): FiscaisService {
    const colaboradores = [
      {
        id: 'col-erick',
        nome: 'Erick',
        funcao: 'FISCAL',
        folgaDiaSemana: fichaFolgaDiaSemana,
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
            // `folga`/`especial` são lidos pela regra única: `folga` marca
            // descanso; `especial` sem folga seria uma convocação.
            folga: true,
            especial: false,
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
    const escalados = await criarServico(null, false).escaladosDoDia(TERCA);
    expect(escalados.map((e) => e.pessoaId)).toEqual(['fiscal-erick']);
  });

  it('NÃO escala quando a FICHA diz folga, mesmo com a escala semanal escalando', async () => {
    // Este é o bug original. Antes da regra única o fiscal aparecia aqui e
    // virava falta no próprio dia de descanso.
    const escalados = await criarServico(2, false).escaladosDoDia(TERCA);
    expect(escalados).toEqual([]);
  });

  it('NÃO escala quando a ESCALA diz folga e a ficha é OMISSA', async () => {
    // Sem nada na ficha não há fonte que contradiga a escala, e o viés
    // conservador continua protegendo a pessoa.
    const escalados = await criarServico(null, true).escaladosDoDia(TERCA);
    expect(escalados).toEqual([]);
  });

  it('escala quando a ficha afirma OUTRO dia e só a escala velha diz folga', async () => {
    // O caso da Yannelyt (ADR 0023): ficha na quinta, linha geral antiga na
    // terça. A terça é dia de trabalho, e o ponto dela é cobrado — antes havia
    // um dia em que ninguém era cobrado e ninguém sabia.
    const escalados = await criarServico(4, true).escaladosDoDia(TERCA);
    expect(escalados.map((e) => e.pessoaId)).toEqual(['fiscal-erick']);
  });
});
