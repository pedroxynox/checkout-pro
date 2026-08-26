/**
 * Testes do relatório de MARCAÇÕES INVÁLIDAS do ciclo (26→25).
 *
 * Cobre o que o gestor precisa para ajustar o ponto: quantas marcações faltam,
 * quais, as horas registradas ao lado — e, sobretudo, que dias legítimos NÃO
 * entrem no relatório (a jornada curta de duas batidas, o dia completo e o dia
 * sem registro). "Agora" é fixado em 10/07/2026, então os dias usados
 * (fim de junho / início de julho) estão encerrados.
 */
import { CentralJornadaService } from './central-jornada.service';

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function batida(id: string, iso: string, hhmm: string) {
  return {
    id,
    pessoaId: 'c1',
    colaboradorId: 'c1',
    data: dia(iso),
    hora: new Date(`${iso}T${hhmm}:00.000Z`),
  };
}

/** Ficha de colaborador como a Central a carrega do banco. */
interface FichaTeste {
  id: string;
  nome: string;
  funcao: string;
  matricula: string;
  usuarioId: string | null;
  folgaDiaSemana: number | null;
  grupoDomingo: string | null;
  entradaSemana: string | null;
  entradaFds: string | null;
  entradaDom: string | null;
  tipoContratoJornadaId: string | null;
}

/** Ficha da colaboradora com turno de entrada às 08:00 em todos os dias úteis. */
const FICHA: FichaTeste = {
  id: 'c1',
  nome: 'Ana Souza',
  funcao: 'OPERADOR',
  matricula: 'ANA',
  usuarioId: null,
  folgaDiaSemana: null,
  grupoDomingo: null,
  entradaSemana: '08:00',
  entradaFds: '08:00',
  entradaDom: null,
  tipoContratoJornadaId: null,
};

function montar(
  batidas: ReturnType<typeof batida>[],
  ficha: FichaTeste = FICHA,
) {
  const prismaFake = {
    colaborador: { findMany: jest.fn().mockResolvedValue([ficha]) },
    batidaPonto: { findMany: jest.fn().mockResolvedValue(batidas) },
    ausencia: { findMany: jest.fn().mockResolvedValue([]) },
    fiscal: { findMany: jest.fn().mockResolvedValue([]) },
    usuario: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const feriadosFake = {
    mapaNoPeriodo: jest.fn().mockResolvedValue(new Map<number, string>()),
  };
  return new CentralJornadaService(prismaFake as never, feriadosFake as never);
}

describe('CentralJornadaService.marcacoesInvalidasCiclo', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('aponta a ENTRADA esquecida (o que o painel antigo chamava de "falta o encerramento")', async () => {
    // Seg 29/06, turno 08:00, mas a 1ª marcação é 12:00: aquela é a saída para
    // o intervalo — o que falta é a entrada.
    const service = montar([
      batida('a1', '2026-06-29', '12:00'),
      batida('a2', '2026-06-29', '13:30'),
      batida('a3', '2026-06-29', '17:20'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens).toHaveLength(1);
    const item = rel.itens[0];
    expect(item.nome).toBe('Ana Souza');
    expect(item.entradaPrevista).toBe('08:00');
    expect(item.registradas).toBe(3);
    expect(item.esperadas).toBe(4);
    expect(item.quantidadeFaltante).toBe(1);
    expect(item.tiposFaltantes).toEqual(['ENTRADA']);
    expect(item.tiposPresentes).toEqual([
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
      'ENCERRAMENTO',
    ]);
    expect(item.horasRegistradas).toEqual(['12:00', '13:30', '17:20']);
    expect(item.detalhe).toBe('Falta registrar: entrada');
    expect(item.confianca).toBe('ALTA');
    expect(item.observacao).toBeNull();
    // O registro incompleto derruba o trabalhado do dia e vira hora devida —
    // o relatório expõe esse custo (o cálculo em si não muda).
    expect(item.devidasMs).toBeGreaterThan(0);
  });

  it('aponta o ENCERRAMENTO quando a entrada e o intervalo estão registrados', async () => {
    const service = montar([
      batida('b1', '2026-06-30', '08:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '13:30'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens).toHaveLength(1);
    expect(rel.itens[0].tiposFaltantes).toEqual(['ENCERRAMENTO']);
    expect(rel.itens[0].confianca).toBe('ALTA');
    expect(rel.totais.faltaUma).toBe(1);
  });

  it('aponta as DUAS marcações do intervalo quando só há começo e fim do dia', async () => {
    // 08:00→17:20 passa da jornada máxima sem intervalo: são entrada e
    // encerramento, e o almoço não foi marcado nenhuma das duas vezes.
    const service = montar([
      batida('c1', '2026-07-01', '08:00'),
      batida('c2', '2026-07-01', '17:20'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens).toHaveLength(1);
    const item = rel.itens[0];
    expect(item.quantidadeFaltante).toBe(2);
    expect(item.tiposFaltantes).toEqual([
      'SAIDA_INTERVALO',
      'RETORNO_INTERVALO',
    ]);
    expect(item.detalhe).toBe(
      'Faltam registrar: saída para o intervalo e retorno do intervalo',
    );
    expect(item.confianca).toBe('BAIXA');
    expect(item.observacao).toContain('jornada inteira');
    expect(rel.totais.faltamDuas).toBe(1);
    expect(rel.totais.aConferir).toBe(1);
  });

  it('NÃO acusa a jornada curta válida de duas batidas (até 4h50, sem intervalo)', async () => {
    // 08:00→12:00 é um dia ENCERRADO no contrato 6x1 — não é marcação faltante.
    const service = montar([
      batida('d1', '2026-07-02', '08:00'),
      batida('d2', '2026-07-02', '12:00'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens).toEqual([]);
    expect(rel.totais.dias).toBe(0);
  });

  it('NÃO acusa o dia completo de quatro marcações nem o dia sem registro', async () => {
    const service = montar([
      batida('e1', '2026-07-03', '08:00'),
      batida('e2', '2026-07-03', '12:00'),
      batida('e3', '2026-07-03', '13:30'),
      batida('e4', '2026-07-03', '17:20'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    // Todos os outros dias do ciclo estão sem registro e também não entram.
    expect(rel.itens).toEqual([]);
    expect(rel.totais.dias).toBe(0);
    expect(rel.totais.pessoas).toBe(0);
  });

  it('consolida os totais do ciclo (dias, pessoas, por tipo e horas devidas)', async () => {
    const service = montar([
      // Seg 29/06: falta a entrada.
      batida('a1', '2026-06-29', '12:00'),
      batida('a2', '2026-06-29', '13:30'),
      batida('a3', '2026-06-29', '17:20'),
      // Ter 30/06: falta o encerramento.
      batida('b1', '2026-06-30', '08:00'),
      batida('b2', '2026-06-30', '12:00'),
      batida('b3', '2026-06-30', '13:30'),
      // Qua 01/07: faltam as duas do intervalo.
      batida('c1', '2026-07-01', '08:00'),
      batida('c2', '2026-07-01', '17:20'),
      // Qui 02/07: só a entrada registrada → faltam três.
      batida('d1', '2026-07-02', '08:00'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.totais.dias).toBe(4);
    expect(rel.totais.pessoas).toBe(1);
    expect(rel.totais.faltaUma).toBe(2);
    expect(rel.totais.faltamDuas).toBe(1);
    expect(rel.totais.faltamTresOuMais).toBe(1);
    expect(rel.totais.marcacoesFaltantes).toBe(1 + 1 + 2 + 3);
    expect(rel.totais.porTipo).toEqual({
      ENTRADA: 1, // só o dia 29/06
      SAIDA_INTERVALO: 2, // 01/07 (intervalo) e 02/07 (só entrada)
      RETORNO_INTERVALO: 2, // idem
      ENCERRAMENTO: 2, // 30/06 e 02/07
    });
    expect(rel.totais.devidasMs).toBe(
      rel.itens.reduce((s, i) => s + i.devidasMs, 0),
    );
    expect(rel.totais.devidasMs).toBeGreaterThan(0);
  });

  it('ordena do dia mais recente para o mais antigo', async () => {
    const service = montar([
      batida('a1', '2026-06-29', '08:00'),
      batida('b1', '2026-07-01', '08:00'),
      batida('c1', '2026-06-30', '08:00'),
    ]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens.map((i) => i.data.slice(0, 10))).toEqual([
      '2026-07-01',
      '2026-06-30',
      '2026-06-29',
    ]);
  });

  it('sem turno cadastrado, mantém a hipótese posicional e pede conferência', async () => {
    const semTurno = { ...FICHA, entradaSemana: null, entradaFds: null };
    const service = montar(
      [
        batida('a1', '2026-06-29', '08:00'),
        batida('a2', '2026-06-29', '12:00'),
        batida('a3', '2026-06-29', '13:30'),
      ],
      semTurno,
    );

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.itens).toHaveLength(1);
    expect(rel.itens[0].entradaPrevista).toBeNull();
    expect(rel.itens[0].tiposFaltantes).toEqual(['ENCERRAMENTO']);
    expect(rel.itens[0].confianca).toBe('BAIXA');
    expect(rel.itens[0].observacao).toContain('Sem turno cadastrado');
  });

  it('devolve o período do ciclo pedido (26→25)', async () => {
    const service = montar([]);

    const rel = await service.marcacoesInvalidasCiclo(0);

    expect(rel.periodo.deslocamento).toBe(0);
    expect(rel.periodo.rotulo).toBeTruthy();
  });
});
