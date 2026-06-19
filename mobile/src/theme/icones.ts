/**
 * Ícones oficiais "Check-out Pro / Stok Center" (SVG fornecidos pela marca).
 *
 * São strings SVG renderizadas com `SvgXml` (react-native-svg), funcionando em
 * nativo e web. A cor original é o vermelho da marca (#E30613); use `recolorir`
 * para gerar variações (ex.: branco dentro das caixas vermelhas).
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

export const SVG_METAS =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="none" stroke="#E30613" stroke-width="28"><circle cx="256" cy="256" r="180"/><circle cx="256" cy="256" r="110"/><path d="M256 256L380 132"/></g><circle cx="380" cy="132" r="28" fill="#E30613"/></svg>';

export const SVG_TAREFAS =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="120" y="70" width="272" height="372" rx="24" fill="none" stroke="#E30613" stroke-width="24"/><path d="M190 180h130M190 260h130M190 340h130" stroke="#E30613" stroke-width="24"/><path d="M150 180l18 18 28-34M150 260l18 18 28-34M150 340l18 18 28-34" fill="none" stroke="#E30613" stroke-width="20"/></svg>';

export const SVG_INDICADORES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="90" y="280" width="60" height="140" fill="#E30613"/><rect x="210" y="210" width="60" height="210" fill="#E30613"/><rect x="330" y="120" width="60" height="300" fill="#E30613"/></svg>';

export const SVG_SEGURANCA =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 60l150 60v120c0 110-70 180-150 212-80-32-150-102-150-212V120z" fill="none" stroke="#E30613" stroke-width="24"/><path d="M200 260l40 40 80-90" fill="none" stroke="#E30613" stroke-width="24"/></svg>';

export const SVG_LOGO_CHECKOUT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300"><text x="20" y="140" font-size="110" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#FFFFFF">CHECK-OUT</text><rect x="760" y="40" width="260" height="120" rx="24" fill="#E30613"/><text x="810" y="125" font-size="90" font-family="Arial" font-weight="700" fill="#FFFFFF">PRO</text><text x="260" y="250" font-size="70" letter-spacing="14" font-family="Arial" fill="#FFFFFF">WORKFORCE</text></svg>';

/** Substitui a cor da marca por outra (ex.: branco para ícones em caixas vermelhas). */
export function recolorir(svg: string, cor: string): string {
  return svg.split(COR_MARCA).join(cor);
}


// ===== Artes oficiais (logos e fundo) =====

/** Logo "Stok Center". Texto branco no original; use recolorir para o tema claro. */
export const SVG_LOGO_STOK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300"><text x="80" y="170" font-size="140" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#ffffff" stroke="#333333" stroke-width="10">Stok</text><text x="360" y="250" font-size="60" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#ffffff">CENTER</text></svg>';

/** Wordmark "CHECK-OUT PRO WORKFORCE". */
export const SVG_WORKFORCE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400"><text x="40" y="150" font-size="120" font-family="Arial" fill="#ffffff">CHECK-OUT</text><rect x="820" y="40" width="260" height="130" rx="20" fill="#e31b23"/><text x="855" y="140" font-size="100" font-family="Arial" fill="white" font-weight="700">PRO</text><text x="250" y="280" font-size="70" letter-spacing="16" font-family="Arial" fill="#ffffff">WORKFORCE</text></svg>';

/** Fundo da tela de login (claro com triângulos vermelhos nos cantos). */
export const SVG_FUNDO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#f5f5f5"/><stop offset="1" stop-color="#e8e8e8"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><polygon points="0,0 380,0 0,820" fill="#e31b23"/><polygon points="720,1920 1080,1920 1080,1500" fill="#e31b23"/></svg>';


// ===== Carrinho (logo) e fundo com ondas vermelhas =====

/** Carrinho de compras (cor da marca; use recolorir para branco). */
export const SVG_CARRINHO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#E30613" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>';

/** Fundo da tela: claro com ondas vermelhas no topo e na base. */
export const SVG_FUNDO_ONDAS =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice">' +
  '<rect width="1080" height="1920" fill="#F1F2F4"/>' +
  '<path d="M0 0 H1080 V250 C880 340 740 170 540 240 C340 310 180 250 0 320 Z" fill="#E31B23"/>' +
  '<path d="M0 0 H1080 V140 C820 240 690 110 450 185 C300 230 140 200 0 240 Z" fill="#C8102E"/>' +
  '<path d="M0 300 C140 380 70 560 0 650 Z" fill="#E31B23" opacity="0.18"/>' +
  '<path d="M1080 360 C940 420 1000 560 1080 640 Z" fill="#E31B23" opacity="0.12"/>' +
  '<path d="M0 1920 H1080 V1680 C840 1590 760 1810 470 1735 C250 1680 150 1775 0 1745 Z" fill="#E31B23"/>' +
  '<path d="M0 1920 H1080 V1780 C860 1700 770 1870 500 1810 C280 1762 150 1850 0 1830 Z" fill="#C8102E" opacity="0.85"/>' +
  '</svg>';


/** Fundo profissional: claro no centro (texto legível) com cantos vermelhos. */
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
