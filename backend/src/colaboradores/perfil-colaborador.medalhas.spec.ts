import {
  calcularScore,
  gerarInsignias,
  gerarResumo,
  IndicadorPerfil,
  notaAssiduidade,
  ScoreSaude,
} from './perfil-colaborador.domain';

/**
 * Regra de negócio (pedido do produto): um não-retorno do intervalo é presença
 * incompleta E indisciplina. Portanto:
 *  - baixa a Assiduidade (não fica 100) e a Disciplina;
 *  - bloqueia as medalhas "Assíduo" e "Disciplinado";
 *  - aparece como atenção no resumo.
 * Justificados pesam menos (ponderação) e não bloqueiam medalhas.
 */
describe('Perfil — impacto do não-retorno no score, medalhas e resumo', () => {
  const scoreBom: ScoreSaude = { valor: 90, nivel: 'BOM', componentes: [] };

  function cancelBaixo(): IndicadorPerfil {
    return {
      chave: 'CANCELAMENTO_ITENS',
      titulo: 'Cancelamento de itens',
      valor: 2,
      formato: 'MOEDA',
      quantidade: null,
      sentido: 'MENOR_MELHOR',
      posicao: null,
      totalParticipantes: 3,
      tendencia: 0,
      mediaEquipe: 5,
      serie: [],
    };
  }

  describe('notaAssiduidade', () => {
    it('sem faltas nem não-retornos é 100', () => {
      expect(notaAssiduidade(0, 0)).toBe(100);
    });
    it('um não-retorno (ponderado) já derruba abaixo de 100', () => {
      expect(notaAssiduidade(0, 1)).toBeLessThan(100);
      expect(notaAssiduidade(0, 1)).toBe(92); // 100 - 1*8
    });
    it('não-retorno justificado (ponderado ~0.02) quase não pesa', () => {
      expect(notaAssiduidade(0, 0.02)).toBeGreaterThan(99);
    });
  });

  describe('calcularScore', () => {
    it('não-retorno impede assiduidade perfeita', () => {
      const semNaoRetorno = calcularScore({ taxaFaltas: 0 });
      const comNaoRetorno = calcularScore({
        taxaFaltas: 0,
        naoRetornosPonderados: 1,
      });
      const assid = (s: ScoreSaude): number =>
        s.componentes.find((c) => c.chave === 'assiduidade')?.valor ?? 0;
      expect(assid(semNaoRetorno)).toBe(100);
      expect(assid(comNaoRetorno)).toBeLessThan(100);
    });
  });

  describe('gerarInsignias', () => {
    it('sem faltas nem não-retornos: ganha Assíduo e Disciplinado', () => {
      const insignias = gerarInsignias({
        score: scoreBom,
        indicadores: [cancelBaixo()],
        faltas: { total: 0, risco: 'BAIXO' },
        naoRetornos: 0,
      });
      const ids = insignias.map((i) => i.id);
      expect(ids).toContain('assiduo');
      expect(ids).toContain('disciplinado');
    });

    it('com não-retorno (não justificado): NÃO ganha Assíduo nem Disciplinado', () => {
      const insignias = gerarInsignias({
        score: scoreBom,
        indicadores: [cancelBaixo()],
        faltas: { total: 0, risco: 'BAIXO' },
        naoRetornos: 1,
      });
      const ids = insignias.map((i) => i.id);
      expect(ids).not.toContain('assiduo');
      expect(ids).not.toContain('disciplinado');
    });
  });

  describe('gerarResumo', () => {
    const base = {
      nome: 'Ana Souza',
      funcao: 'OPERADOR',
      score: scoreBom,
      indicadores: [] as IndicadorPerfil[],
      faltas: { total: 0, taxa: 0, risco: 'BAIXO' },
    };

    it('sem faltas nem não-retornos: assiduidade exemplar', () => {
      const frases = gerarResumo({ ...base, naoRetornos: 0 });
      expect(frases.join(' ')).toContain('assiduidade exemplar');
    });

    it('com não-retorno: sem "exemplar" e com atenção à disciplina', () => {
      const frases = gerarResumo({ ...base, naoRetornos: 2 });
      const texto = frases.join(' ');
      expect(texto).not.toContain('assiduidade exemplar');
      expect(texto).toContain('não-retorno(s) do intervalo');
    });
  });
});
