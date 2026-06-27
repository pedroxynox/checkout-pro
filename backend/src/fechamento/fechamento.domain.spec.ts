import { TIPOS_ARRECADACAO } from '../arrecadacao/arrecadacao.domain';
import {
  EntradaResumoFechamento,
  StatusArrecadacaoBruto,
  montarResumoFechamento,
} from './fechamento.domain';

/** Monta o record das 5 arrecadações com um mesmo status (ou overrides). */
function arrec(
  padrao: StatusArrecadacaoBruto,
  overrides: Partial<Record<string, StatusArrecadacaoBruto>> = {},
): EntradaResumoFechamento['arrecadacao'] {
  const r = {} as EntradaResumoFechamento['arrecadacao'];
  for (const t of TIPOS_ARRECADACAO) r[t] = overrides[t] ?? padrao;
  return r;
}

describe('montarResumoFechamento', () => {
  it('marca tudo pronto quando arquivos e checklists estão resolvidos', () => {
    const r = montarResumoFechamento({
      arrecadacao: arrec('ENVIADO'),
      vendasEnviado: true,
      checklistAbertura: 'FEITO',
      checklistFechamento: 'FEITO',
      diaPassou: false,
    });
    expect(r.tudoPronto).toBe(true);
    expect(r.completoArquivos).toBe(true);
    expect(r.pendentes).toEqual([]);
    expect(r.alertas).toEqual([]);
    expect(r.concluidos).toBe(r.totalItens);
  });

  it('"sem movimento" conta como resolvido nos arquivos, mas alerta se forem todas', () => {
    const r = montarResumoFechamento({
      arrecadacao: arrec('SEM_MOVIMENTO'),
      vendasEnviado: true,
      checklistAbertura: 'FEITO',
      checklistFechamento: 'FEITO',
      diaPassou: false,
    });
    expect(r.completoArquivos).toBe(true);
    expect(r.alertas.some((a) => a.includes('sem movimento'))).toBe(true);
  });

  it('hoje com pendências: status PENDENTE e lista de pendentes', () => {
    const r = montarResumoFechamento({
      arrecadacao: arrec('ENVIADO', { DEVOLUCOES: 'PENDENTE' }),
      vendasEnviado: false,
      checklistAbertura: 'FEITO',
      checklistFechamento: 'PENDENTE',
      diaPassou: false,
    });
    expect(r.tudoPronto).toBe(false);
    expect(r.completoArquivos).toBe(false);
    // Vendas + 1 arrecadação + checklist de fechamento faltam.
    expect(r.pendentes).toContain('Vendas por hora');
    expect(r.pendentes).toContain('Checklist de fechamento');
    const vendas = r.itens.find((i) => i.id === 'VENDAS');
    expect(vendas?.status).toBe('PENDENTE');
    // Vendas não enviadas → não dispara o alerta de "vendas já entraram".
    expect(r.alertas.some((a) => a.includes('vendas já entraram'))).toBe(false);
  });

  it('vendas enviadas com arrecadação faltando dispara alerta', () => {
    const r = montarResumoFechamento({
      arrecadacao: arrec('ENVIADO', { CANCELAMENTO_CUPOM: 'PENDENTE' }),
      vendasEnviado: true,
      checklistAbertura: 'FEITO',
      checklistFechamento: 'FEITO',
      diaPassou: false,
    });
    expect(r.alertas.some((a) => a.includes('vendas já entraram'))).toBe(true);
  });

  it('dia passado com pendências marca NAO_ENVIADO e alerta', () => {
    const r = montarResumoFechamento({
      arrecadacao: arrec('ENVIADO', { DEVOLUCOES: 'PENDENTE' }),
      vendasEnviado: true,
      checklistAbertura: 'FEITO',
      checklistFechamento: 'FEITO',
      diaPassou: true,
    });
    const dev = r.itens.find((i) => i.id === 'DEVOLUCOES');
    expect(dev?.status).toBe('NAO_ENVIADO');
    expect(r.alertas.some((a) => a.includes('dia já passou'))).toBe(true);
  });
});
