import { entradaEsperadaConservadora } from './hora-esperada-fiscal';

/**
 * A regra que decide a hora que o sistema pode COBRAR de um fiscal.
 *
 * A ficha é a fonte; a escala semanal é um derivado que fica velho em silêncio.
 * Trocar a fonte de uma vez adiantaria a cobrança de quem tem a ficha mais cedo
 * que a escala — e criaria faltas em quem chega no horário combinado. Por isso a
 * regra é conservadora: quando as duas discordam, vale a mais TARDIA.
 *
 * A propriedade que estes testes protegem: **esta regra nunca devolve uma hora
 * mais cedo do que a que era cobrada antes** (que era sempre a da escala). Só
 * pode empatar, atrasar, ou deixar de cobrar.
 */
describe('entradaEsperadaConservadora', () => {
  it('as duas fontes concordam: devolve a hora combinada', () => {
    expect(
      entradaEsperadaConservadora({
        daEscala: '07:00',
        daFicha: '07:00',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('07:00');
  });

  it('ficha mais TARDE que a escala: usa a da ficha (não cobra antes)', () => {
    // O caso que corrige o desencontro: a ficha (e a escala publicada que a
    // equipe recebe) diz 07:00, a escala semanal ficou em 06:50. Antes o sistema
    // cobrava 06:50 e marcava falta às 08:50 em quem chegou às 07:00.
    expect(
      entradaEsperadaConservadora({
        daEscala: '06:50',
        daFicha: '07:00',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('07:00');
  });

  it('ficha mais CEDO que a escala: mantém a da escala (não adianta a cobrança)', () => {
    // Aqui a ficha é a fonte oficial, mas usá-la ADIANTARIA a cobrança de 07:00
    // para 06:50 — criando falta em quem chega 06:55. Corrigir um desencontro
    // criando faltas novas não é corrigir. A escala publicada mostra 06:50 e a
    // divergência aparece no `npm run integridade`, para o gestor resolver.
    expect(
      entradaEsperadaConservadora({
        daEscala: '07:00',
        daFicha: '06:50',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('07:00');
  });

  /**
   * A exceção de horário deixou de existir (ADR 0026): a função não recebe mais
   * esse sinal, e uma hora mais tardia na escala só vence pela regra
   * conservadora — nunca por ser "uma decisão do gestor". Aqui a escala às 10:00
   * vence as 07:00 da ficha porque é a mais tardia, e não porque é exceção.
   */
  it('sem exceção: a mais tardia vence, e é só isso', () => {
    expect(
      entradaEsperadaConservadora({
        daEscala: '10:00',
        daFicha: '07:00',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('10:00');
  });

  it('ficha SEM turno no dia: não se cobra nada', () => {
    // O caso perigoso: ficha vazia (ou sem horário para aquele bloco) e escala
    // do seed sobrevivente. A ficha é a fonte; se ela não afirma um turno, o
    // sistema não tem base para afirmar uma expectativa — e cobrar por um dado
    // que ninguém revisou é como nasciam faltas indevidas.
    expect(
      entradaEsperadaConservadora({
        daEscala: '06:50',
        daFicha: null,
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBeNull();
  });

  it('fiscal SEM ficha resolvida: mantém o comportamento antigo (a escala)', () => {
    // Sem vínculo com nenhuma ficha não há duas fontes para comparar. Tirar a
    // pessoa da lista seria uma decisão sem base — e ela deixaria de ser cobrada
    // sem que ninguém tivesse decidido isso.
    expect(
      entradaEsperadaConservadora({
        daEscala: '07:00',
        daFicha: null,
        temFicha: false,
        ehFeriado: false,
      }),
    ).toBe('07:00');
  });

  it('escala sem hora e ficha com hora: usa a da ficha', () => {
    expect(
      entradaEsperadaConservadora({
        daEscala: null,
        daFicha: '08:00',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('08:00');
  });

  it('hora ilegível de um lado não derruba o outro', () => {
    // Robustez: um horário corrompido não deve virar `null` silencioso (o que
    // tiraria a pessoa da escala) nem quebrar a comparação.
    expect(
      entradaEsperadaConservadora({
        daEscala: 'xx:yy',
        daFicha: '07:00',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('07:00');
    expect(
      entradaEsperadaConservadora({
        daEscala: '07:00',
        daFicha: 'xx:yy',
        temFicha: true,
        ehFeriado: false,
      }),
    ).toBe('07:00');
  });

  it('FERIADO: a ficha vence mesmo sendo mais cedo (é a regra, não um desencontro)', () => {
    // Em feriado vale o horário de DOMINGO da ficha. A escala semanal não conhece
    // feriados, então o valor dela não é uma opinião concorrente sobre a hora —
    // é um dado que não se aplica. Comparar as duas faria o horário de dia útil
    // vencer sempre que fosse mais tarde, desfazendo a regra.
    expect(
      entradaEsperadaConservadora({
        daEscala: '10:00',
        daFicha: '06:30',
        temFicha: true,
        ehFeriado: true,
      }),
    ).toBe('06:30');
  });

  it('FERIADO sem horário de domingo na ficha: mantém o da escala', () => {
    // O fallback é deliberado: ninguém fica sem turno e desaparece da equipe do
    // dia por não ter `entradaDom` cadastrado.
    expect(
      entradaEsperadaConservadora({
        daEscala: '10:00',
        daFicha: null,
        temFicha: true,
        ehFeriado: true,
      }),
    ).toBe('10:00');
  });

  it('NUNCA devolve uma hora mais cedo do que a escala cobrava antes', () => {
    // A propriedade central, varrida sobre uma grade de horas: a correção não
    // pode criar falta nenhuma que já não existisse. Só empatar, atrasar ou
    // deixar de cobrar.
    const horas = ['05:00', '06:50', '07:00', '08:30', '12:00', '23:59'];
    const paraMin = (h: string): number =>
      Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

    for (const daEscala of horas) {
      for (const daFicha of horas) {
        const r = entradaEsperadaConservadora({
          daEscala,
          daFicha,
          temFicha: true,
          ehFeriado: false,
        });
        // Não cobrar é sempre seguro; se cobra, não pode ser mais cedo.
        if (r != null) {
          expect(paraMin(r)).toBeGreaterThanOrEqual(paraMin(daEscala));
        }
      }
    }
  });
});
