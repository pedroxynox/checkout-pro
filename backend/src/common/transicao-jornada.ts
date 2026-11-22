/**
 * Pausa de transição da jornada (fim do 6x1 → 5x2).
 *
 * A partir de 23/11/2026 a equipe trabalha no horário novo (5x2), mas até as
 * vigências da jornada estarem publicadas e carregadas o sistema ainda só
 * conhece a ficha antiga (uma folga fixa, blocos Seg–Qui/Sex–Sáb/Dom, contrato
 * 6x1). Tudo o que é GERADO SOZINHO a partir dessa ficha sairia errado: falta
 * automática no dia da folga nova, aviso de atraso pelo horário antigo, risco de
 * TAC calculado contra a carga de 7h, "ponto em dia de folga" na folga antiga.
 *
 * Com `PAUSA_TRANSICAO_JORNADA=true` esses automatismos ficam suspensos. O
 * registro de ponto, o não-retorno do intervalo e a autocura das ocorrências
 * continuam funcionando. Os cálculos sob demanda (Central de Jornada) não são
 * afetados: eles passam a dar os números certos quando as vigências entrarem.
 *
 * Lida a cada chamada (não em cache) para que os testes possam ligar e desligar
 * pela variável de ambiente. Ver `.kiro/specs/jornada-5x2/design.md` §8.
 */
export const VARIAVEL_PAUSA_TRANSICAO_JORNADA = 'PAUSA_TRANSICAO_JORNADA';

/** `true` quando a pausa de transição da jornada está ligada. */
export function pausaTransicaoJornadaAtiva(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[VARIAVEL_PAUSA_TRANSICAO_JORNADA] === 'true';
}
