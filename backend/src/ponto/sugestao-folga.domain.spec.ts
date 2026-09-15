import {
  DiaTrabalhado,
  sugerirFolgaPorBatidas,
  textoSugestaoFolga,
} from './sugestao-folga.domain';

/**
 * A sugestão do NOVO dia de folga.
 *
 * Uma batida em dia de folga quase nunca é alguém trabalhando no descanso: é a
 * folga que mudou sem o cadastro ser atualizado. Avisar "há uma divergência"
 * resolve metade — o gestor ainda tem de descobrir qual é o novo dia, e é aí que
 * se esquece de novo. As batidas já respondem isso.
 *
 * O que estes testes mais protegem é o **silêncio**: os casos em que a função
 * devolve `null`. Um palpite errado sobre a folga de alguém é pior do que não
 * palpitar, porque o gestor pode aplicá-lo sem verificar.
 */
describe('sugerirFolgaPorBatidas', () => {
  /** Dias trabalhados a partir de datas ISO (segunda = 2026-07-06). */
  const dias = (...isos: string[]): DiaTrabalhado[] =>
    isos.map((iso) => ({ data: new Date(`${iso}T00:00:00.000Z`) }));

  it('sugere quando a folga do cadastro é trabalhada e um dia nunca aparece', () => {
    // Cadastro diz folga na SEGUNDA (1). Em duas semanas ela trabalhou toda
    // segunda e nunca apareceu numa QUARTA (3) → a folga virou quarta.
    const r = sugerirFolgaPorBatidas(
      1,
      dias(
        // Semana de 06/07: seg, ter, qui, sex, sáb (sem quarta).
        '2026-07-06',
        '2026-07-07',
        '2026-07-09',
        '2026-07-10',
        '2026-07-11',
        // Semana de 13/07: idem.
        '2026-07-13',
        '2026-07-14',
        '2026-07-16',
        '2026-07-17',
        '2026-07-18',
      ),
    );

    expect(r).toEqual({ folgaAtual: 1, folgaSugerida: 3, semanas: 2 });
  });

  it('NÃO sugere com uma semana só (pode ser exceção pontual)', () => {
    const r = sugerirFolgaPorBatidas(
      1,
      dias('2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10'),
    );

    expect(r).toBeNull();
  });

  it('NÃO sugere se numa das semanas ela descansou no dia certo', () => {
    // Semana 1 sem segunda (folgou no dia certo) → não houve mudança de folga,
    // houve uma exceção pontual na outra semana. Sugerir aqui seria errado.
    const r = sugerirFolgaPorBatidas(
      1,
      dias(
        '2026-07-07',
        '2026-07-09',
        '2026-07-10',
        '2026-07-13',
        '2026-07-14',
        '2026-07-16',
        '2026-07-17',
      ),
    );

    expect(r).toBeNull();
  });

  it('NÃO sugere com DOIS candidatos (não se sabe qual é a folga)', () => {
    // Trabalhou toda segunda, mas faltam quarta E quinta nas duas semanas: pode
    // ter faltado, estado de férias, ou a semana estar incompleta.
    const r = sugerirFolgaPorBatidas(
      1,
      dias(
        '2026-07-06',
        '2026-07-07',
        '2026-07-10',
        '2026-07-13',
        '2026-07-14',
        '2026-07-17',
      ),
    );

    expect(r).toBeNull();
  });

  it('ignora o DOMINGO como candidato (a escala vem do rodízio)', () => {
    // Ela trabalhou toda segunda e nunca num domingo — mas "não trabalhou
    // domingo" é o normal de quem não está no grupo do rodízio da semana, e não
    // indica mudança de folga fixa. Sem outro candidato, não sugere.
    const r = sugerirFolgaPorBatidas(
      1,
      dias(
        '2026-07-06',
        '2026-07-07',
        '2026-07-08',
        '2026-07-09',
        '2026-07-10',
        '2026-07-11',
        '2026-07-13',
        '2026-07-14',
        '2026-07-15',
        '2026-07-16',
        '2026-07-17',
        '2026-07-18',
      ),
    );

    expect(r).toBeNull();
  });

  it('NÃO sugere sem folga no cadastro nem sem batidas', () => {
    expect(sugerirFolgaPorBatidas(null, dias('2026-07-06'))).toBeNull();
    expect(sugerirFolgaPorBatidas(1, [])).toBeNull();
  });

  it('a frase diz o que mudou e pede confirmação', () => {
    const texto = textoSugestaoFolga({
      folgaAtual: 1,
      folgaSugerida: 3,
      semanas: 3,
    });

    expect(texto).toContain('3 semanas');
    expect(texto).toContain('segunda');
    expect(texto).toContain('quarta');
    // A ação é do gestor, e a sugestão não se aplica sozinha.
    expect(texto).toContain('Confirme no cadastro');
  });

  it('sem sugestão, a frase é vazia (o aviso principal sai sem ela)', () => {
    expect(textoSugestaoFolga(null)).toBe('');
  });
});
