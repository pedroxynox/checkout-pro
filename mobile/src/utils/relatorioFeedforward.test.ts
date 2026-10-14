/**
 * Testes do gerador puro dos documentos impressos do Feedforward: rodada,
 * histórico e formulário em branco. Garante o conteúdo, a segurança (HTML
 * escapado) e a estrutura de páginas A4.
 */
import { PontoFeedforward, RodadaFeedforward } from '../api/types';
import {
  PERGUNTAS_FEEDFORWARD,
  estrelasTexto,
  htmlFormularioFeedforward,
  htmlHistoricoFeedforward,
  htmlPaginaRodada,
  htmlRodadaFeedforward,
  resumoHistorico,
  rotuloCargo,
} from './relatorioFeedforward';

const COLAB = { nome: 'Ana Souza', matricula: '123', funcao: 'OPERADOR' };
const GERADO = new Date('2026-10-14T12:00:00.000Z');
const urlFoto = (c: string): string => `https://api.exemplo.com${c}`;

function ponto(over: Partial<PontoFeedforward> = {}): PontoFeedforward {
  return {
    id: 'p1',
    descricao: 'Agilizar o atendimento',
    prazo: '2026-11-01T00:00:00.000Z',
    status: 'PENDENTE',
    situacao: 'EM_DIA',
    revisadoPorNome: null,
    revisadoEm: null,
    observacaoRevisao: null,
    ...over,
  };
}

function rodada(over: Partial<RodadaFeedforward> = {}): RodadaFeedforward {
  return {
    id: 'r1',
    colaboradorId: 'c1',
    data: '2026-10-01T00:00:00.000Z',
    liderNome: 'Carlos Lima',
    cargo: 'OPERADOR',
    pontosFortes: 'Simpatia com os clientes',
    oportunidades: 'Organização do caixa',
    compromissoFinal: 'Chegar 10 minutos antes',
    evolucaoNota: 4,
    fotoUrl: null,
    criadoEm: '2026-10-01T12:00:00.000Z',
    pontos: [ponto()],
    ...over,
  };
}

describe('relatorioFeedforward — auxiliares', () => {
  it('estrelasTexto mostra a nota de 1 a 5 e trata ausência/limites', () => {
    expect(estrelasTexto(4)).toBe('★★★★☆ 4/5');
    expect(estrelasTexto(null)).toBe('Sem nota');
    expect(estrelasTexto(9)).toBe('★★★★★ 5/5');
    expect(estrelasTexto(0)).toBe('☆☆☆☆☆ 0/5');
  });

  it('rotuloCargo traduz a função e preserva valores desconhecidos', () => {
    expect(rotuloCargo('OPERADOR')).toBe('Operador(a) de caixa');
    expect(rotuloCargo('GESTOR')).toBe('Gerente');
    expect(rotuloCargo('OUTRA')).toBe('OUTRA');
    expect(rotuloCargo(null)).toBe('—');
  });

  it('resumoHistorico conta rodadas e pontos por estado', () => {
    const s = resumoHistorico([
      rodada({
        pontos: [
          ponto({ id: 'a', status: 'ATINGIDO', situacao: 'ATINGIDO' }),
          ponto({ id: 'b', status: 'PENDENTE', situacao: 'VENCIDO' }),
        ],
      }),
      rodada({
        id: 'r2',
        pontos: [
          ponto({ id: 'c', status: 'NAO_ATINGIDO', situacao: 'NAO_ATINGIDO' }),
          ponto({ id: 'd', status: 'PENDENTE', situacao: 'EM_DIA' }),
        ],
      }),
    ]);
    expect(s).toEqual({
      rodadas: 2,
      pontos: 4,
      atingidos: 1,
      naoAtingidos: 1,
      pendentes: 2,
      vencidos: 1,
    });
  });
});

describe('relatorioFeedforward — rodada', () => {
  it('traz identificação, textos, nota, pontos e assinaturas', () => {
    const html = htmlRodadaFeedforward(rodada(), COLAB, { geradoEm: GERADO });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Ana Souza');
    expect(html).toContain('Matrícula 123');
    expect(html).toContain('Operador(a) de caixa');
    expect(html).toContain('01/10/2026');
    expect(html).toContain('Líder: Carlos Lima');
    expect(html).toContain('★★★★☆ 4/5');
    expect(html).toContain('Simpatia com os clientes');
    expect(html).toContain('Organização do caixa');
    expect(html).toContain('Chegar 10 minutos antes');
    expect(html).toContain('Agilizar o atendimento');
    expect(html).toContain('01/11/2026');
    expect(html).toContain('No prazo');
    expect(html).toContain('Assinatura do(a) colaborador(a)');
    expect(html).toContain('Assinatura do(a) líder');
    expect(html).toContain('size: A4');
  });

  it('mostra a revisão (quem, quando) e a observação do ponto', () => {
    const html = htmlPaginaRodada(
      rodada({
        pontos: [
          ponto({
            status: 'ATINGIDO',
            situacao: 'ATINGIDO',
            revisadoPorNome: 'Bia Supervisora',
            revisadoEm: '2026-10-20T15:00:00.000Z',
            observacaoRevisao: 'Evoluiu muito',
          }),
        ],
      }),
      COLAB,
    );
    expect(html).toContain('Atingido');
    expect(html).toContain('Revisado por Bia Supervisora');
    expect(html).toContain('20/10/2026');
    expect(html).toContain('Evoluiu muito');
  });

  it('omite blocos vazios e avisa quando não há pontos', () => {
    const html = htmlPaginaRodada(
      rodada({
        pontosFortes: null,
        oportunidades: '   ',
        compromissoFinal: null,
        evolucaoNota: null,
        liderNome: null,
        pontos: [],
      }),
      COLAB,
    );
    expect(html).not.toContain('Pontos fortes');
    expect(html).not.toContain('Oportunidades de desenvolvimento');
    expect(html).not.toContain('Compromisso final');
    expect(html).not.toContain('Líder:');
    expect(html).toContain('Sem nota');
    expect(html).toContain('Nenhum ponto registrado nesta rodada.');
  });

  it('inclui a foto com a URL absoluta só quando há foto e montador de URL', () => {
    const comFoto = rodada({ fotoUrl: '/uploads/feedforward/a.jpg' });
    expect(htmlPaginaRodada(comFoto, COLAB, { urlFoto })).toContain(
      'src="https://api.exemplo.com/uploads/feedforward/a.jpg"',
    );
    expect(htmlPaginaRodada(comFoto, COLAB)).not.toContain('<img');
    expect(htmlPaginaRodada(rodada(), COLAB, { urlFoto })).not.toContain('<img');
  });

  it('escapa HTML dos textos (sem injeção de tags/atributos)', () => {
    const html = htmlRodadaFeedforward(
      rodada({
        pontosFortes: '<script>alert(1)</script>',
        pontos: [ponto({ descricao: '"><img src=x onerror=alert(1)>' })],
        fotoUrl: '/a.jpg" onerror="alert(1)',
      }),
      { nome: '<b>Ana</b>' },
      { urlFoto },
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('" onerror="');
    expect(html).toContain('&lt;script&gt;');
  });

  it('preserva as quebras de linha dos textos', () => {
    const html = htmlPaginaRodada(
      rodada({ pontosFortes: 'Linha 1\nLinha 2' }),
      COLAB,
    );
    expect(html).toContain('Linha 1<br />Linha 2');
  });
});

describe('relatorioFeedforward — histórico', () => {
  it('tem capa com resumo e uma página por rodada', () => {
    const rodadas = [
      rodada({ id: 'r2', data: '2026-10-01T00:00:00.000Z' }),
      rodada({ id: 'r1', data: '2026-07-01T00:00:00.000Z' }),
    ];
    const html = htmlHistoricoFeedforward(rodadas, COLAB, { geradoEm: GERADO });
    expect(html).toContain('Histórico de feedforward');
    expect(html).toContain('De 01/07/2026 a 01/10/2026');
    // capa + 2 rodadas
    expect(html.match(/class="pagina"/g)).toHaveLength(3);
    expect(html.match(/Rodada de feedforward/g)).toHaveLength(2);
    expect(html).toContain('<strong>2</strong>Rodadas');
  });

  it('sem rodadas, mostra só a capa com aviso', () => {
    const html = htmlHistoricoFeedforward([], COLAB);
    expect(html.match(/class="pagina"/g)).toHaveLength(1);
    expect(html).toContain('Nenhuma rodada de feedforward registrada.');
  });
});

describe('relatorioFeedforward — formulário em branco', () => {
  it('traz todas as perguntas, os pontos com prazo, a nota e as assinaturas', () => {
    const html = htmlFormularioFeedforward(COLAB, { geradoEm: GERADO });
    for (const grupo of PERGUNTAS_FEEDFORWARD) {
      expect(html).toContain(grupo.secao);
      for (const q of grupo.itens) expect(html).toContain(q);
    }
    expect(html).toContain('Pontos a melhorar (com prazo)');
    expect(html).toContain('Até quando');
    expect(html).toContain('Nota de evolução');
    expect(html).toContain('Compromisso final');
    expect(html).toContain('Assinatura do(a) colaborador(a)');
  });

  it('pré-preenche o colaborador quando informado', () => {
    const html = htmlFormularioFeedforward(COLAB);
    expect(html).toContain('<strong>Ana Souza</strong>');
    expect(html).toContain('<strong>123</strong>');
    expect(html).toContain('<strong>Operador(a) de caixa</strong>');
  });

  it('sem colaborador, deixa linhas em branco para preencher', () => {
    const html = htmlFormularioFeedforward(null);
    expect(html).toContain('Colaborador(a):</span><div class="traco">');
    expect(html).toContain('Matrícula:</span><div class="traco">');
    expect(html).toContain('<title>Formulário de feedforward</title>');
  });
});
