/**
 * Pulso do dia — sinais por módulo para a Home "inteligente".
 *
 * Calcula, de forma DEFENSIVA e por REGRAS (sem IA), quantas pendências cada
 * módulo tem hoje, para a Home:
 *  - ordenar os módulos por relevância (os com pendências sobem), e
 *  - mostrar um selo (badge) com a contagem no módulo.
 *
 * Só busca os dados das funcionalidades que o usuário pode acessar (evita
 * chamadas desnecessárias/403). Cada chamada tem `catch` — se um serviço
 * falhar, os demais continuam e o módulo apenas não recebe contagem.
 *
 * Observação: este hook é focado em CONTAGENS por módulo. O painel
 * (ResumoDoDia) continua independente; uma futura unificação pode compartilhar
 * uma única busca.
 */
import {
  arrecadacaoService,
  checklistService,
  insumosService,
  operadoresService,
  vendasService,
} from '../../api/services';
import {
  DiaOperadores,
  InsumoProativo,
  PainelAtencao,
  PainelVendas,
  Perfil,
  StatusArrecadacao,
  StatusChecklist,
  StatusVendas,
  TipoArrecadacao,
} from '../../api/types';
import { useRequisicao } from '../../hooks/useRequisicao';
import { hojeISO } from '../../utils/formato';

/** Queda (%) de vendas considerada relevante para virar pendência. */
const QUEDA_VENDAS_RELEVANTE = 10;

/** Data de ontem (ISO), a partir de "hoje". */
function ontemISO(): string {
  const d = new Date(`${hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface PulsoDoDia {
  carregando: boolean;
  /** Nº de pendências por rota de módulo (ex.: { Insumos: 2, Checklist: 1 }). */
  pendenciasPorModulo: Record<string, number>;
  /** Soma de todas as pendências. */
  totalPendencias: number;
}

/**
 * @param perfil Perfil do usuário (dependência da busca).
 * @param podeAcessar Função de permissão (só busca o que o usuário vê).
 */
export function usePulsoDoDia(
  perfil: Perfil | null,
  podeAcessar: (funcionalidade: string) => boolean,
): PulsoDoDia {
  const req = useRequisicao(async () => {
    const hoje = hojeISO();
    const ontem = ontemISO();
    const [arrec, vendaStatus, painelOntem, insumos, atencao, ckAb, ckFe, opDia] =
      await Promise.all([
        podeAcessar('IMPORTACOES')
          ? arrecadacaoService.status(hoje).catch(() => null as StatusArrecadacao | null)
          : Promise.resolve(null as StatusArrecadacao | null),
        podeAcessar('IMPORTACOES')
          ? vendasService.status(hoje).catch(() => null as StatusVendas | null)
          : Promise.resolve(null as StatusVendas | null),
        podeAcessar('PAINEL_VENDAS_VISUALIZAR')
          ? vendasService.painel(ontem).catch(() => null as PainelVendas | null)
          : Promise.resolve(null as PainelVendas | null),
        podeAcessar('INSUMOS')
          ? insumosService.listarProativo().catch(() => [] as InsumoProativo[])
          : Promise.resolve([] as InsumoProativo[]),
        podeAcessar('INDICADORES_VISUALIZAR')
          ? arrecadacaoService.painelAtencao(hoje).catch(() => null as PainelAtencao | null)
          : Promise.resolve(null as PainelAtencao | null),
        podeAcessar('CHECKLIST')
          ? checklistService
              .status('ABERTURA', hoje)
              .catch(() => null as { status: StatusChecklist } | null)
          : Promise.resolve(null as { status: StatusChecklist } | null),
        podeAcessar('CHECKLIST')
          ? checklistService
              .status('FECHAMENTO', hoje)
              .catch(() => null as { status: StatusChecklist } | null)
          : Promise.resolve(null as { status: StatusChecklist } | null),
        podeAcessar('OPERADORES_AUSENCIAS')
          ? operadoresService.dia(hoje).catch(() => null as DiaOperadores | null)
          : Promise.resolve(null as DiaOperadores | null),
      ]);
    return { arrec, vendaStatus, painelOntem, insumos, atencao, ckAb, ckFe, opDia };
  }, [perfil]);

  const d = req.dados;
  const pendenciasPorModulo: Record<string, number> = {};

  if (d) {
    const horaAgora = new Date().getHours();

    // Importações: arquivos de arrecadação pendentes + vendas por hora.
    let cargaPendente = 0;
    if (d.arrec) {
      for (const tipo of Object.keys(d.arrec) as TipoArrecadacao[]) {
        if (d.arrec[tipo] === 'PENDENTE') cargaPendente += 1;
      }
    }
    if (d.vendaStatus && !d.vendaStatus.enviado) cargaPendente += 1;
    if (cargaPendente > 0) pendenciasPorModulo.Importacoes = cargaPendente;

    // Insumos críticos.
    const criticos = d.insumos.filter((i) => i.nivel === 'CRITICO').length;
    if (criticos > 0) pendenciasPorModulo.Insumos = criticos;

    // Checklist não feito (com janela de horário, como no painel).
    let checklist = 0;
    if (d.ckAb?.status === 'PENDENTE' && horaAgora >= 9) checklist += 1;
    if (d.ckFe?.status === 'PENDENTE' && horaAgora >= 14) checklist += 1;
    if (checklist > 0) pendenciasPorModulo.Checklist = checklist;

    // Indicadores fora da meta.
    const indicadores = d.atencao ? d.atencao.criticos + d.atencao.emAtencao : 0;
    if (indicadores > 0) pendenciasPorModulo.Indicadores = indicadores;

    // Faltas de operadores.
    const faltas = d.opDia?.faltas ?? 0;
    if (faltas > 0) pendenciasPorModulo.Operadores = faltas;

    // Painel de Vendas: queda relevante de ontem e/ou projeção abaixo da meta.
    if (d.painelOntem) {
      let vendas = 0;
      const variacao = d.painelOntem.comparativos?.dia?.variacao ?? null;
      if (variacao != null && variacao <= -QUEDA_VENDAS_RELEVANTE) vendas += 1;
      if (d.painelOntem.projecaoVsMeta != null && d.painelOntem.projecaoVsMeta < 0) {
        vendas += 1;
      }
      if (vendas > 0) pendenciasPorModulo.PainelVendas = vendas;
    }
  }

  const totalPendencias = Object.values(pendenciasPorModulo).reduce(
    (soma, n) => soma + n,
    0,
  );

  return { carregando: req.carregando, pendenciasPorModulo, totalPendencias };
}

export default usePulsoDoDia;
