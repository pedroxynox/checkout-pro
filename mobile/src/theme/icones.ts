/**
 * Ícones e artes oficiais "Check-out Pro / Stok Center" (SVG da marca).
 *
 * São strings SVG renderizadas com `SvgXml` (react-native-svg), funcionando em
 * nativo e web. A cor original é o vermelho da marca (#E30613); use `recolorir`
 * para gerar variações (ex.: branco dentro das caixas vermelhas).
 *
 * Mantemos apenas os ícones efetivamente usados (tela de login). Artes não
 * utilizadas foram removidas na auditoria; estão recuperáveis no histórico Git.
 */

export const COR_MARCA = '#E30613';

export const SVG_USUARIO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="170" r="90" fill="none" stroke="#E30613" stroke-width="28"/><path d="M110 420c20-90 90-140 146-140s126 50 146 140" fill="none" stroke="#E30613" stroke-width="28"/></svg>';

export const SVG_SENHA =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="110" y="220" width="292" height="190" rx="24" fill="none" stroke="#E30613" stroke-width="24"/><path d="M170 220v-50c0-48 38-86 86-86s86 38 86 86v50" fill="none" stroke="#E30613" stroke-width="24"/></svg>';

export const SVG_OLHO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M60 256s80-120 196-120 196 120 196 120-80 120-196 120S60 256 60 256z" fill="none" stroke="#E30613" stroke-width="24"/><circle cx="256" cy="256" r="60" fill="none" stroke="#E30613" stroke-width="24"/></svg>';

export const SVG_ENTRAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M210 120l140 136-140 136" fill="none" stroke="#E30613" stroke-width="32"/><path d="M80 256h250" stroke="#E30613" stroke-width="32"/></svg>';

export const SVG_COLABORADORES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="#E30613"><circle cx="180" cy="170" r="55"/><circle cx="332" cy="170" r="55"/><circle cx="256" cy="120" r="60"/><path d="M90 340c0-50 40-90 90-90s90 40 90 90H90z"/><path d="M242 380c0-65 52-118 118-118s118 53 118 118H242z"/></g></svg>';

export const SVG_TAREFAS =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="120" y="70" width="272" height="372" rx="24" fill="none" stroke="#E30613" stroke-width="24"/><path d="M190 180h130M190 260h130M190 340h130" stroke="#E30613" stroke-width="24"/><path d="M150 180l18 18 28-34M150 260l18 18 28-34M150 340l18 18 28-34" fill="none" stroke="#E30613" stroke-width="20"/></svg>';

export const SVG_INDICADORES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="90" y="280" width="60" height="140" fill="#E30613"/><rect x="210" y="210" width="60" height="210" fill="#E30613"/><rect x="330" y="120" width="60" height="300" fill="#E30613"/></svg>';

export const SVG_SEGURANCA =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 60l150 60v120c0 110-70 180-150 212-80-32-150-102-150-212V120z" fill="none" stroke="#E30613" stroke-width="24"/><path d="M200 260l40 40 80-90" fill="none" stroke="#E30613" stroke-width="24"/></svg>';

/** Substitui a cor da marca por outra (ex.: branco para ícones em caixas vermelhas). */
export function recolorir(svg: string, cor: string): string {
  return svg.split(COR_MARCA).join(cor);
}

/** Fundo profissional da tela de login: claro no centro (texto legível) com cantos vermelhos. */
export const SVG_FUNDO_PRO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">' +
  '<rect width="1080" height="1920" fill="#F5F6F8"/>' +
  '<path d="M0 0 H470 C 300 160 150 150 0 310 Z" fill="#E31B23"/>' +
  '<path d="M0 0 H330 C 200 130 100 125 0 235 Z" fill="#C8102E"/>' +
  '<path d="M1080 0 V250 C 995 185 1015 80 1080 30 Z" fill="#E31B23" opacity="0.9"/>' +
  '<path d="M1080 1920 V1640 C 985 1730 1030 1870 840 1920 Z" fill="#E31B23"/>' +
  '<path d="M1080 1920 V1700 C 1010 1760 1040 1880 905 1920 Z" fill="#C8102E"/>' +
  '<path d="M0 1920 V1810 C 85 1848 66 1902 0 1920 Z" fill="#E31B23" opacity="0.4"/>' +
  '</svg>';
