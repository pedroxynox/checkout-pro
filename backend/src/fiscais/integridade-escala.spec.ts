import {
  EntradaEscalaGeral,
  FichaEscalaFiscal,
  detectarEscalasIncoerentes,
} from './integridade-escala';

/**
 * O diagnóstico de coerência ficha ↔ escala semanal.
 *
 * A ficha é a fonte da escala, e a sincronização a regenera a cada edição — mas
 * com saídas antecipadas que deixam a escala antiga viva. Como a **detecção
 * automática de falta** lê a escala semanal e a **escala publicada** lê a ficha,
 * cada divergência aqui é uma hora diferente cobrada de uma pessoa real.
 *
 * Estes testes provam que o diagnóstico encontra cada uma dessas portas — e,
 * igualmente importante, que **não grita** quando não há problema.
 */
describe('detectarEscalasIncoerentes', () => {
  const CONTA = { id: 'u1', login: '1001' };

  const FISCAL = { id: 'fiscal-1', nome: 'Bia', usuarioId: 'u1' };

  /** Ficha completa e coerente: 07:00–15:20 Seg–Qui, 08:00–16:20 Sex–Sáb, folga seg. */
  function ficha(over: Partial<FichaEscalaFiscal> = {}): FichaEscalaFiscal {
    return {
      id: 'col-1',
      nome: 'Bia',
      matricula: '1001',
      usuarioId: 'u1',
      entradaSemana: '07:00',
      saidaSemana: '15:20',
      entradaFds: '08:00',
      saidaFds: '16:20',
      folgaDiaSemana: 1,
      // Fora do rodízio de domingo por padrão: quem não trabalha domingo não
      // precisa de horário de domingo, e não deve aparecer como pendência.
      entradaDom: null,
      saidaDom: null,
      grupoDomingo: null,
      ativo: true,
      ...over,
    };
  }

  /** A escala que a ficha acima geraria: folga seg(1), Ter–Qui, Sex–Sáb. */
  function escalaCoerente(): EntradaEscalaGeral[] {
    return [
      { diaSemana: 1, entrada: null, saida: null, folga: true },
      { diaSemana: 2, entrada: '07:00', saida: '15:20', folga: false },
      { diaSemana: 3, entrada: '07:00', saida: '15:20', folga: false },
      { diaSemana: 4, entrada: '07:00', saida: '15:20', folga: false },
      { diaSemana: 5, entrada: '08:00', saida: '16:20', folga: false },
      { diaSemana: 6, entrada: '08:00', saida: '16:20', folga: false },
    ].map((d) => ({
      funcionarioId: 'fiscal-1',
      colaboradorId: 'col-1',
      ...d,
    }));
  }

  const rodar = (fichas: FichaEscalaFiscal[], entradas: EntradaEscalaGeral[]) =>
    detectarEscalasIncoerentes(fichas, [FISCAL], [CONTA], entradas);

  it('não aponta nada quando a escala corresponde à ficha', async () => {
    const r = rodar([ficha()], escalaCoerente());

    expect(r.ok).toBe(true);
    expect(r.coerentes).toBe(1);
    expect(r.incoerentes).toEqual([]);
  });

  it('aponta o dia em que o HORÁRIO gravado difere da ficha, com a distância', () => {
    // A ficha diz 07:00 e a cópia semanal ficou em 06:50: dez minutos de
    // distância. A hora cobrada é a da ficha (ADR 0026, etapa 2), então isto é
    // informação sobre a cópia atrasada, não uma cobrança errada.
    const escala = escalaCoerente();
    escala[1] = { ...escala[1], entrada: '06:50' };
    const r = rodar([ficha()], escala);

    expect(r.ok).toBe(false);
    expect(r.incoerentes).toHaveLength(1);
    expect(r.incoerentes[0].dias).toEqual([
      {
        diaSemana: 2,
        ficha: { entrada: '07:00', saida: '15:20', folga: false },
        escala: { entrada: '06:50', saida: '15:20', folga: false },
        minutosDeDiferenca: 10,
      },
    ]);
    expect(r.fichasComLacuna).toBe(0);
  });

  /**
   * O caso que motivou a etapa 2, agora resolvido: a cópia semanal MAIS TARDIA
   * que a ficha. Enquanto a regra era "vale a hora mais tardia", era a cópia que
   * decidia, e o atraso real de quem chegava depois da hora da ficha não existia
   * para o sistema. Hoje a divergência é medida nos dois sentidos, e em nenhum
   * deles muda a cobrança.
   */
  it('mede a distância também quando a cópia é mais TARDIA que a ficha', () => {
    const escala = escalaCoerente();
    escala[1] = { ...escala[1], entrada: '07:25' };
    const r = rodar([ficha()], escala);

    expect(r.incoerentes[0].dias).toEqual([
      {
        diaSemana: 2,
        ficha: { entrada: '07:00', saida: '15:20', folga: false },
        escala: { entrada: '07:25', saida: '15:20', folga: false },
        minutosDeDiferenca: 25,
      },
    ]);
    // Ninguém é cobrado pela cópia, então isto não é lacuna de ficha.
    expect(r.fichasComLacuna).toBe(0);
  });

  /**
   * A última decisão que ainda depende da cópia: sem dia de folga na ficha, a
   * pessoa descansa por causa de uma linha da cópia semanal (ADR 0023, passo da
   * ficha omissa). Quando a tabela sair (etapa 3), ela ficaria escalada todos os
   * dias — por isso é lacuna de ficha, e o lugar de corrigir é o cadastro.
   */
  it('aponta a ficha SEM dia de folga que hoje descansa pela cópia semanal', () => {
    const r = rodar([ficha({ folgaDiaSemana: null })], escalaCoerente());

    expect(r.semFolgaNaFicha).toEqual([
      {
        colaboradorId: 'col-1',
        nome: 'Bia',
        matricula: '1001',
        diasDeFolgaNaEscala: [1],
      },
    ]);
    expect(r.fichasComLacuna).toBe(1);
    expect(r.nomesComLacuna).toEqual(['Bia']);
  });

  it('não acusa ficha sem folga quando a cópia também não concede folga', () => {
    // Sem folga em nenhuma das duas fontes não há descanso a perder quando a
    // cópia sair: o problema dessa pessoa é outro (ficha incompleta).
    const semFolga = escalaCoerente().filter((e) => !e.folga);
    const r = rodar([ficha({ folgaDiaSemana: null })], semFolga);

    expect(r.semFolgaNaFicha).toHaveLength(0);
  });

  /**
   * Quem está no rodízio e não tem horário de domingo trabalha domingo sem hora —
   * e, por regra de negócio, também fica sem hora em FERIADO, que usa o horário
   * de domingo. A ficha não mostrava esse campo até a ADR 0026.
   */
  it('aponta quem está no rodízio de domingo sem horário de domingo', () => {
    const r = rodar([ficha({ grupoDomingo: 'G2' })], escalaCoerente());

    expect(r.domingoSemHorario).toEqual([
      {
        colaboradorId: 'col-1',
        nome: 'Bia',
        matricula: '1001',
        grupoDomingo: 'G2',
        falta: 'AMBAS',
      },
    ]);
    expect(r.ok).toBe(false);
  });

  it('distingue falta só da entrada, só da saída ou das duas no domingo', () => {
    const soEntrada = rodar(
      [ficha({ grupoDomingo: 'G1', saidaDom: '13:00' })],
      escalaCoerente(),
    );
    const soSaida = rodar(
      [ficha({ grupoDomingo: 'G1', entradaDom: '07:00' })],
      escalaCoerente(),
    );

    expect(soEntrada.domingoSemHorario[0].falta).toBe('ENTRADA');
    expect(soSaida.domingoSemHorario[0].falta).toBe('SAIDA');
  });

  it('rodízio COM horário de domingo completo não é pendência', () => {
    const r = rodar(
      [
        ficha({
          grupoDomingo: 'G3',
          entradaDom: '07:00',
          saidaDom: '13:00',
        }),
      ],
      escalaCoerente(),
    );

    expect(r.domingoSemHorario).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it('numa folga divergente não há distância a medir', () => {
    // A folga é reconciliada em runtime pela regra única, e não há duas horas a
    // comparar. Vira divergência de cadastro, sem número a exibir.
    const escala = escalaCoerente().map((e) =>
      e.diaSemana === 3 ? { ...e, entrada: null, saida: null, folga: true } : e,
    );
    const r = rodar([ficha()], escala);

    expect(r.incoerentes[0].dias.every((d) => d.minutosDeDiferenca === 0)).toBe(
      true,
    );
    expect(r.fichasComLacuna).toBe(0);
  });

  it('aponta quando a FOLGA da escala não é a da ficha', () => {
    // A folga é reconciliada em runtime pela regra única (as duas fontes valem),
    // então isto não gera falta indevida — mas gera uma escala publicada que
    // discorda da tela de escala, e é sinal de ficha e escala fora de sincronia.
    // A escala folga na QUARTA (3); a ficha folga na SEGUNDA (1). Os dois dias
    // divergem: um tem folga onde deveria ter turno, o outro o contrário.
    const escala = escalaCoerente().map((e) =>
      e.diaSemana === 1
        ? { ...e, entrada: '07:00', saida: '15:20', folga: false }
        : e.diaSemana === 3
          ? { ...e, entrada: null, saida: null, folga: true }
          : e,
    );
    const r = rodar([ficha()], escala);

    const dias = r.incoerentes[0].dias.map((d) => d.diaSemana);
    expect(dias).toEqual([1, 3]);
    expect(r.duplicadas).toEqual([]);
  });

  it('marca `fichaVazia` quando não há horários na ficha mas sobrou escala', () => {
    // A porta mais perigosa: `temEscalaDefinida` falso faz a sincronização
    // retornar sem apagar nada, "para não apagar a escala vinda do seed". A
    // escala sobrevivente segue alimentando a detecção de falta.
    const r = rodar(
      [
        ficha({
          entradaSemana: null,
          saidaSemana: null,
          entradaFds: null,
          saidaFds: null,
          folgaDiaSemana: null,
        }),
      ],
      escalaCoerente(),
    );

    expect(r.incoerentes).toHaveLength(1);
    expect(r.incoerentes[0].fichaVazia).toBe(true);
    expect(r.incoerentes[0].dias).toHaveLength(6);
  });

  it('lista quem tem ficha preenchida e nenhuma escala gravada', () => {
    // Sem entrada na escala semanal o fiscal não existe para a detecção: nunca
    // recebe falta automática, por mais que falte.
    const r = rodar([ficha()], []);

    expect(r.semEscala.map((f) => f.nome)).toEqual(['Bia']);
    expect(r.incoerentes).toEqual([]);
  });

  it('aponta o bloco de horário pela metade', () => {
    // Entrada sem saída: `gerarEscalaSemanalFiscal` omite os dias do bloco em
    // silêncio, e a pessoa desaparece da detecção sem aviso nenhum.
    const r = rodar([ficha({ saidaFds: null })], escalaCoerente());

    expect(r.horarioIncompleto).toHaveLength(1);
    expect(r.horarioIncompleto[0].blocos).toEqual(['Sex–Sáb']);
  });

  it('conta as entradas gerais DUPLICADAS do mesmo dia', () => {
    // Sem índice único, `cadastrarEscala` podia criar duas gerais para o mesmo
    // dia. Dois leitores desempatam diferente (um pega a primeira linha, outro a
    // última), então a escala efetiva passa a depender de quem pergunta.
    const escala = escalaCoerente();
    escala.push({ ...escala[2], entrada: '09:00' });
    const r = rodar([ficha()], escala);

    expect(r.duplicadas).toEqual([
      { funcionarioId: 'fiscal-1', diaSemana: 3, quantidade: 2 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('ignora fiscais INATIVOS (a escala deles é apagada de propósito)', () => {
    const r = rodar([ficha({ ativo: false })], []);

    expect(r.ok).toBe(true);
    expect(r.semEscala).toEqual([]);
    expect(r.totalFiscaisAtivos).toBe(0);
  });

  it('reconhece a escala ligada só pelo `funcionarioId` (sem vínculo gravado)', () => {
    // Escalas antigas não têm `colaboradorId`. O diagnóstico resolve o vínculo
    // pela mesma regra do runtime (conta, e matrícula em fallback), senão
    // apontaria "sem escala" para todo mundo com escala antiga.
    const escala = escalaCoerente().map((e) => ({
      ...e,
      colaboradorId: null,
    }));
    const r = rodar([ficha()], escala);

    expect(r.ok).toBe(true);
    expect(r.semEscala).toEqual([]);
  });
});
