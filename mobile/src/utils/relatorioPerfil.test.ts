import {
  esc,
  fatiasDe,
  htmlPaginaOperador,
  htmlPizza,
  htmlRelatorio,
  mesAtual,
  rotuloPeriodo,
  semanaAtual,
  svgBarras,
} from './relatorioPerfil';
import { PerfilColaborador } from '../api/types';

/** Perfil mínimo (mas completo) para exercitar o gerador de relatório. */
function perfilFake(nome: string): PerfilColaborador {
  return {
    colaborador: {
      id: `id-${nome}`,
      nome,
      matricula: '123',
      login: null,
      funcao: 'OPERADOR',
      genero: null,
      ativo: true,
      turno: null,
      entradaSemana: null,
      saidaSemana: null,
      entradaFds: null,
      saidaFds: null,
      folgaDiaSemana: 0,
    },
    vinculoApp: null,
    periodo: { inicio: '2026-07-06', fim: '2026-07-12' },
    score: {
      valor: 82,
      nivel: 'BOM',
      componentes: [
        { chave: 'assiduidade', rotulo: 'Assiduidade', valor: 90, peso: 0.4 },
        { chave: 'contribuicao', rotulo: 'Contribuição', valor: 70, peso: 0.3 },
        { chave: 'disciplina', rotulo: 'Disciplina', valor: 85, peso: 0.3 },
      ],
    },
    resumo: ['Ótimo desempenho geral.', 'Sem faltas no período.'],
    indicadores: [
      {
        chave: 'TROCO_SOLIDARIO',
        titulo: 'Troco Solidário',
        valor: 500,
        formato: 'MOEDA',
        quantidade: null,
        sentido: 'MAIOR_MELHOR',
        posicao: 1,
        totalParticipantes: 5,
        tendencia: 50,
        mediaEquipe: 300,
        serie: [
          { rotulo: 'Fev', valor: 200 },
          { rotulo: 'Mar', valor: 350 },
          { rotulo: 'Abr', valor: 500 },
        ],
      },
    ],
    faltas: {
      total: 1,
      taxa: 3,
      taxaPonderada: 1,
      justificadas: 1,
      risco: 'BAIXO',
      tendencia: 0,
      porMes: [
        { rotulo: 'Mai', valor: 0 },
        { rotulo: 'Jun', valor: 2 },
        { rotulo: 'Jul', valor: 1 },
      ],
      porDiaSemana: [{ rotulo: 'Seg', valor: 1 }],
    },
    motivosCancelamento: [
      { rotulo: 'Preço', valor: 3 },
      { rotulo: 'Cliente desistiu', valor: 2 },
    ],
    insignias: [
      { id: 'assiduo', titulo: 'Assíduo', descricao: '', icone: 'star' },
    ],
    incidencias: {
      total: 2,
      porTipo: [
        { tipo: 'NAO_RETORNO_INTERVALO', rotulo: 'Não retorno do intervalo', total: 1 },
        { tipo: 'ADVERTENCIA', rotulo: 'Advertência', total: 1 },
      ],
      totalNaoRetorno: 1,
      ultimoNaoRetorno: '2026-07-10',
      diasConsecutivosSemIncidencia: 2,
      risco: 'MEDIO',
      tendencia: 'ESTAVEL',
      porDiaSemana: [
        { rotulo: 'Seg', valor: 1 },
        { rotulo: 'Ter', valor: 1 },
      ],
      frequenciaMensal: 1,
      percentualSobreEscalados: 5,
      timeline: [{ data: '2026-07-10', kind: 'NAO_RETORNO_INTERVALO' }],
    },
    contrato: {
      temAdmissao: true,
      dataAdmissao: '2026-05-01',
      diasDeCasa: 70,
      estado: 'EXPERIENCIA',
      etiqueta: 'experiencia',
      dataMarco45: '2026-06-15',
      dataMarco90: '2026-07-30',
      proximoMarco: 'MARCO_90',
      dataProximoMarco: '2026-07-30',
      diasParaProximoMarco: 20,
      efetivadoPorDecurso: false,
      decisao45: 'APROVADO',
      decisao90: null,
    },
  } as PerfilColaborador;
}

describe('relatorioPerfil', () => {
  describe('semanaAtual', () => {
    it('devolve segunda a domingo cobrindo a data informada', () => {
      for (const dia of ['2026-07-06', '2026-07-09', '2026-07-12', '2026-02-01']) {
        const { inicio, fim } = semanaAtual(dia);
        expect(new Date(`${inicio}T00:00:00Z`).getUTCDay()).toBe(1); // segunda
        expect(new Date(`${fim}T00:00:00Z`).getUTCDay()).toBe(0); // domingo
        expect(inicio <= dia && dia <= fim).toBe(true);
        const dias =
          (new Date(`${fim}T00:00:00Z`).getTime() -
            new Date(`${inicio}T00:00:00Z`).getTime()) /
          86400000;
        expect(dias).toBe(6);
      }
    });
  });

  describe('mesAtual', () => {
    it('devolve do dia 1º do mês até a data informada', () => {
      expect(mesAtual('2026-07-08')).toEqual({
        inicio: '2026-07-01',
        fim: '2026-07-08',
      });
      expect(mesAtual('2026-02-15')).toEqual({
        inicio: '2026-02-01',
        fim: '2026-02-15',
      });
    });
  });

  describe('esc', () => {
    it('escapa caracteres perigosos de HTML', () => {
      expect(esc('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
      expect(esc(null)).toBe('');
    });
  });

  describe('svgBarras', () => {
    it('desenha uma barra por ponto e destaca o máximo', () => {
      const svg = svgBarras([
        { rotulo: 'A', valor: 1 },
        { rotulo: 'B', valor: 3 },
      ]);
      expect(svg.startsWith('<svg')).toBe(true);
      expect((svg.match(/<rect/g) ?? []).length).toBe(2);
      // A cor de destaque (primária) aparece no maior; a clara no menor.
      expect(svg).toContain('#0F4C81');
      expect(svg).toContain('#E8EFF7');
      expect(svg).toContain('>A<');
      expect(svg).toContain('>B<');
    });

    it('mostra "sem dados" quando vazio', () => {
      expect(svgBarras([])).toContain('Sem dados');
    });
  });

  describe('fatiasDe / htmlPizza', () => {
    it('agrupa em "Outros" acima do máximo de fatias', () => {
      const pontos = Array.from({ length: 9 }, (_, i) => ({
        rotulo: `m${i}`,
        valor: i + 1,
      }));
      const fatias = fatiasDe(pontos, 6);
      expect(fatias).toHaveLength(7); // 6 + "Outros"
      expect(fatias[6].rotulo).toContain('Outros');
    });

    it('desenha a rosca com uma fatia por motivo e a legenda', () => {
      const html = htmlPizza([
        { rotulo: 'Preço', valor: 3 },
        { rotulo: 'Desistência', valor: 1 },
      ]);
      expect((html.match(/<circle/g) ?? []).length).toBe(2);
      expect(html).toContain('Preço');
      expect(html).toContain('legenda');
    });

    it('mostra "sem dados" quando o total é zero', () => {
      expect(htmlPizza([{ rotulo: 'x', valor: 0 }])).toContain('Sem dados');
    });
  });

  describe('htmlPaginaOperador', () => {
    it('inclui nome, score, indicadores, gráficos e tempo de casa', () => {
      const html = htmlPaginaOperador(perfilFake('Ana Souza'));
      expect(html).toContain('Ana Souza');
      expect(html).toContain('82'); // score
      expect(html).toContain('Troco Solidário');
      expect(html).toContain('Motivos de cancelamento');
      expect(html).toContain('Não retorno do intervalo');
      expect(html).toContain('70'); // dias de casa
      expect(html).toContain('class="pagina"');
    });
  });

  describe('htmlRelatorio', () => {
    it('gera uma página por operador e uma capa com o total', () => {
      const perfis = [perfilFake('Ana'), perfilFake('Bruno'), perfilFake('Caio')];
      const html = htmlRelatorio(perfis, {
        periodo: { inicio: '2026-07-06', fim: '2026-07-12' },
      });
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect((html.match(/class="pagina"/g) ?? []).length).toBe(3);
      expect(html).toContain('3 operadores');
      expect(html).toContain('@page');
    });

    it('mostra aviso quando não há operadores', () => {
      const html = htmlRelatorio([], {
        periodo: { inicio: '2026-07-06', fim: '2026-07-12' },
      });
      expect(html).toContain('Nenhum operador');
    });
  });

  describe('rotuloPeriodo', () => {
    it('formata início e fim em pt-BR', () => {
      expect(rotuloPeriodo('2026-07-06', '2026-07-12')).toBe(
        '06/07/2026 a 12/07/2026',
      );
    });
  });
});
