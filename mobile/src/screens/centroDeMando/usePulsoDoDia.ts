/**
 * Pulso do dia — sinais por módulo para a Home "inteligente".
 *
 * Calcula, de forma DEFENSIVA e por REGRAS (sem IA), quantas pendências cada
 * módulo tem hoje, para:
 *  - ordenar os módulos por relevância (os com pendências sobem),
 *  - mostrar um selo (badge) com a contagem no módulo, e
 *  - alimentar a aba Tarefas e o selo da barra de abas.
 *
 * As buscas usam a MESMA fonte compartilhada da Home (`dadosDoDia`), então os
 * pedidos são deduplicados entre a Home, a barra de abas e a aba Tarefas — não
 * há mais chamadas repetidas. Só busca o que o usuário pode acessar (evita
 * chamadas desnecessárias/403).
 */
import { Perfil } from '../../api/types';
import { useRequisicao } from '../../hooks/useRequisicao';
import { hojeISO } from '../../utils/formato';
import {
  buscarArrecStatus,
  buscarAtencao,
  buscarChecklist,
  buscarInsumos,
  buscarOperadoresDia,
  buscarPainelResumo,
  buscarVendaStatus,
  calcularPendencias,
  ontemISO,
} from './dadosDoDia';

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
          ? buscarArrecStatus(hoje)
          : Promise.resolve(null),
        podeAcessar('IMPORTACOES')
          ? buscarVendaStatus(hoje)
          : Promise.resolve(null),
        podeAcessar('PAINEL_VENDAS_VISUALIZAR')
          ? buscarPainelResumo(ontem)
          : Promise.resolve(null),
        podeAcessar('INSUMOS') ? buscarInsumos() : Promise.resolve([]),
        podeAcessar('INDICADORES_VISUALIZAR')
          ? buscarAtencao(hoje)
          : Promise.resolve(null),
        podeAcessar('CHECKLIST')
          ? buscarChecklist('ABERTURA', hoje)
          : Promise.resolve(null),
        podeAcessar('CHECKLIST')
          ? buscarChecklist('FECHAMENTO', hoje)
          : Promise.resolve(null),
        podeAcessar('OPERADORES_AUSENCIAS')
          ? buscarOperadoresDia(hoje)
          : Promise.resolve(null),
      ]);
    return {
      arrec,
      vendaStatus,
      painelOntem,
      insumos,
      atencao,
      ckAb,
      ckFe,
      opDia,
    };
  }, [perfil]);

  const d = req.dados;
  const pendenciasPorModulo = d
    ? calcularPendencias(
        {
          arrecHoje: d.arrec,
          vendaStatusHoje: d.vendaStatus,
          painelOntem: d.painelOntem,
          insumos: d.insumos,
          atencao: d.atencao,
          ckAb: d.ckAb,
          ckFe: d.ckFe,
          opDia: d.opDia,
        },
        podeAcessar,
      )
    : {};

  const totalPendencias = Object.values(pendenciasPorModulo).reduce(
    (soma, n) => soma + n,
    0,
  );

  return { carregando: req.carregando, pendenciasPorModulo, totalPendencias };
}

export default usePulsoDoDia;
