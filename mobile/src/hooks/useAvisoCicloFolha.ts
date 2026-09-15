/**
 * Aviso de ciclo de folha para um período em edição.
 *
 * Um período longo (atestado, ausência a prazo, férias) pode atravessar o corte
 * 26→25 e repartir-se entre duas folhas — ou cair num ciclo já fechado, caso em
 * que o backend recusa o lançamento. Antes o gestor só descobria ao salvar.
 *
 * A pergunta vai ao backend de propósito: a regra do dia 26 mora em
 * `common/datas` e duplicá-la aqui repetiria o erro que fez o app contar dias de
 * férias por conta própria. A consulta é adiada (debounce) porque as datas mudam
 * de um em um dia enquanto se toca nas setas.
 */
import { useEffect, useState } from 'react';
import { cicloFolhaService, IntervaloCiclos } from '../api/services/cicloFolha';

/** Aviso pronto para exibir, no formato que o `SeletorPeriodo` espera. */
export interface AvisoCiclo {
  texto: string;
  tom: 'info' | 'alerta';
}

/** Espera antes de consultar, para não disparar a cada toque na seta. */
const ESPERA_MS = 400;

/** "26/06 – 25/07 (2 dias) e 26/07 – 25/08 (3 dias)" */
function listarCiclos(ciclos: IntervaloCiclos['ciclos']): string {
  return ciclos
    .map((c) => `${c.rotulo} (${c.dias} ${c.dias === 1 ? 'dia' : 'dias'})`)
    .join(' e ');
}

function montarAviso(
  dados: IntervaloCiclos,
  bloqueiaSeFechado: boolean,
): AvisoCiclo | null {
  if (dados.fechados.length > 0) {
    const quais = dados.fechados.join(' e ');
    const plural = dados.fechados.length > 1;
    return {
      tom: 'alerta',
      texto: bloqueiaSeFechado
        ? `A folha ${plural ? 'dos ciclos' : 'do ciclo'} ${quais} já está fechada, então este período não pode ser lançado. Reabra ${plural ? 'os ciclos' : 'o ciclo'} antes (exige autorização).`
        : `Este período alcança ${plural ? 'os ciclos' : 'o ciclo'} de folha ${quais}, já ${plural ? 'fechados' : 'fechado'}. O registro é permitido, mas muda o que ${plural ? 'esses ciclos mostram' : 'esse ciclo mostra'}.`,
    };
  }
  if (dados.atravessaCiclos) {
    return {
      tom: 'info',
      texto: `Este período atravessa o fechamento da folha e se reparte entre ${listarCiclos(dados.ciclos)}.`,
    };
  }
  return null;
}

/**
 * Devolve o aviso do período, ou `null` quando não há nada a dizer (o período
 * cabe num único ciclo aberto), enquanto carrega, ou se a consulta falhar —
 * um aviso é um extra, nunca deve atrapalhar o lançamento.
 */
export function useAvisoCicloFolha({
  inicio,
  fim,
  ativo = true,
  bloqueiaSeFechado = true,
}: {
  inicio: string;
  fim: string;
  /** Falso quando o formulário está fechado (evita consultas inúteis). */
  ativo?: boolean;
  /**
   * Verdadeiro quando o backend recusa o lançamento num ciclo fechado
   * (atestado e ausência a prazo, que gravam um dia de ausência por dia
   * corrido). Falso em férias, que é um intervalo único e não bloqueia.
   */
  bloqueiaSeFechado?: boolean;
}): AvisoCiclo | null {
  const [aviso, setAviso] = useState<AvisoCiclo | null>(null);

  useEffect(() => {
    if (!ativo || !inicio || !fim || fim < inicio) {
      setAviso(null);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      cicloFolhaService
        .intervalo(inicio, fim)
        .then((dados) => {
          if (vivo) setAviso(montarAviso(dados, bloqueiaSeFechado));
        })
        .catch(() => {
          // Sem permissão ou sem rede: segue sem aviso.
          if (vivo) setAviso(null);
        });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [inicio, fim, ativo, bloqueiaSeFechado]);

  return aviso;
}

export default useAvisoCicloFolha;
