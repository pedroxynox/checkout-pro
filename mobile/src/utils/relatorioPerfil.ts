/**
 * Geração **pura** do relatório de perfil do colaborador em HTML (para virar
 * PDF via `expo-print`). Sem dependências de React Native: só recebe os dados
 * do perfil (o mesmo objeto que a tela usa) e devolve strings de HTML/SVG.
 *
 * O HTML é montado em folha **A4**, um colaborador **por página**
 * (`page-break-after`), replicando os gráficos da tela — **barras verticais** e
 * **pizza (rosca)** — como SVG inline. Por ser puro, é coberto por testes.
 */
import { PerfilColaborador, PontoSerie } from '../api/types';
import { formatarData, formatarMoeda, formatarNumero } from './formato';

/** Cores (espelho do tema) usadas no relatório impresso. */
const COR = {
  primaria: '#0F4C81',
  primariaClara: '#E8EFF7',
  texto: '#111827',
  textoSec: '#6B7280',
  borda: '#E5E7EB',
  divisor: '#F1F5F9',
  verde: '#10B981',
  amarelo: '#F59E0B',
  vermelho: '#EF4444',
  fundo: '#FFFFFF',
} as const;

/** Paleta das fatias/barras (espelho de CORES_GRAFICO do app). */
const PALETA = [
  '#C8102E',
  '#1E9E5A',
  '#C99700',
  '#2E6FD2',
  '#8E44AD',
  '#E67E22',
  '#16A085',
  '#7F8C8D',
];

/** Escapa texto para uso seguro em HTML. */
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Início (segunda) e fim (domingo) da semana civil que contém `hojeISO`. */
export function semanaAtual(hojeISO: string): { inicio: string; fim: string } {
  const base = new Date(`${hojeISO}T00:00:00.000Z`);
  const dow = base.getUTCDay(); // 0=Dom..6=Sáb
  const deslocarInicio = (dow + 6) % 7; // dias desde a segunda
  const inicio = new Date(base);
  inicio.setUTCDate(base.getUTCDate() - deslocarInicio);
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fim: fim.toISOString().slice(0, 10),
  };
}

/**
 * Início (dia 1º) e fim (o próprio dia) do mês civil que contém `hojeISO`.
 *
 * Espelha o padrão do backend do perfil (mês corrente **até hoje**), de modo
 * que o relatório em PDF mostre exatamente os MESMOS indicadores acumulados que
 * a tela de perfil do colaborador — evitando um PDF com números "vazios" por
 * cobrir só a semana em curso.
 */
export function mesAtual(hojeISO: string): { inicio: string; fim: string } {
  return { inicio: `${hojeISO.slice(0, 7)}-01`, fim: hojeISO };
}

/** Rótulo "dd/mm/aaaa a dd/mm/aaaa" de um período. */
export function rotuloPeriodo(inicio: string, fim: string): string {
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

/** Semáforo → cor. */
function corNivel(nivel: string): string {
  if (nivel === 'BOM') return COR.verde;
  if (nivel === 'CRITICO') return COR.vermelho;
  return COR.amarelo;
}

/** Rótulo pt-BR do nível de saúde. */
function rotuloNivel(nivel: string): string {
  if (nivel === 'BOM') return 'Bom';
  if (nivel === 'CRITICO') return 'Crítico';
  return 'Atenção';
}

/**
 * Gráfico de **barras verticais** em SVG (replica `GraficoBarrasVerticais`):
 * barra destacada no máximo, rótulo embaixo e valor no topo. Escala pelo maior
 * valor; barras mínimas de 3px quando o valor é 0.
 */
export function svgBarras(
  dados: PontoSerie[],
  opts: { altura?: number; formatarTopo?: (v: number) => string } = {},
): string {
  const altura = opts.altura ?? 130;
  if (!dados || dados.length === 0) {
    return '<p class="vazio">Sem dados no período.</p>';
  }
  const max = Math.max(...dados.map((d) => d.valor), 0);
  const larguraBarra = 30;
  const gap = 16;
  const padTopo = 16;
  const padBase = 22;
  const areaH = altura - padTopo - padBase;
  const largura = dados.length * (larguraBarra + gap) + gap;

  const barras = dados
    .map((d, i) => {
      const h = max > 0 ? Math.max(3, (d.valor / max) * areaH) : 3;
      const x = gap + i * (larguraBarra + gap);
      const y = altura - padBase - h;
      const destaque = d.valor === max && max > 0;
      const fill = destaque ? COR.primaria : COR.primariaClara;
      const topo = opts.formatarTopo
        ? opts.formatarTopo(d.valor)
        : d.valor > 0
          ? formatarNumero(d.valor)
          : '';
      const centro = x + larguraBarra / 2;
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${h}" rx="3" fill="${fill}" />
        ${topo ? `<text x="${centro}" y="${y - 4}" text-anchor="middle" font-size="9" fill="${COR.textoSec}">${esc(topo)}</text>` : ''}
        <text x="${centro}" y="${altura - 6}" text-anchor="middle" font-size="9" fill="${COR.textoSec}">${esc(d.rotulo)}</text>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" width="100%" height="${altura}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${barras}</svg>`;
}

/** Uma fatia do gráfico pizza. */
export interface FatiaRelatorio {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Monta fatias (maiores + "Outros") a partir de pontos, com a paleta. */
export function fatiasDe(pontos: PontoSerie[], maximo = 6): FatiaRelatorio[] {
  const positivos = pontos.filter((p) => p.valor > 0);
  const principais = positivos.slice(0, maximo).map((p, i) => ({
    rotulo: p.rotulo,
    valor: p.valor,
    cor: PALETA[i % PALETA.length],
  }));
  const resto = positivos.slice(maximo);
  if (resto.length > 0) {
    principais.push({
      rotulo: `Outros (${resto.length})`,
      valor: resto.reduce((s, p) => s + p.valor, 0),
      cor: PALETA[PALETA.length - 1],
    });
  }
  return principais;
}

/**
 * Gráfico **pizza (rosca)** em SVG + legenda em HTML (replica `GraficoPizza`).
 * Usa arcos por `stroke-dasharray` sobre um círculo, como no app.
 */
export function htmlPizza(
  pontos: PontoSerie[],
  formatarValor: (v: number) => string = formatarNumero,
): string {
  const fatias = fatiasDe(pontos);
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) {
    return '<p class="vazio">Sem dados no período.</p>';
  }
  const tamanho = 150;
  const espessura = 28;
  const raio = (tamanho - espessura) / 2;
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;
  const arcos = fatias
    .map((f) => {
      const len = (f.valor / total) * circ;
      const arco = `<circle cx="${tamanho / 2}" cy="${tamanho / 2}" r="${raio}" fill="none" stroke="${f.cor}" stroke-width="${espessura}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-acumulado).toFixed(2)}" />`;
      acumulado += len;
      return arco;
    })
    .join('');
  const svg = `<svg viewBox="0 0 ${tamanho} ${tamanho}" width="${tamanho}" height="${tamanho}" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-90 ${tamanho / 2} ${tamanho / 2})">${arcos}</g></svg>`;

  const legenda = fatias
    .map((f) => {
      const pct = total > 0 ? (f.valor / total) * 100 : 0;
      return `<li><span class="ponto" style="background:${f.cor}"></span><span class="leg-nome">${esc(f.rotulo)}</span><span class="leg-val">${esc(formatarValor(f.valor))} · ${pct.toFixed(0)}%</span></li>`;
    })
    .join('');

  return `<div class="pizza"><div class="pizza-svg">${svg}</div><ul class="legenda">${legenda}</ul></div>`;
}

/** Formata o valor de um indicador conforme o seu formato (moeda/número). */
function valorIndicador(v: number, formato: string): string {
  return formato === 'MOEDA' ? formatarMoeda(v) : formatarNumero(v);
}

/** Seta de tendência (▲/▼/–) colorida conforme o sinal. */
function tendenciaTexto(t: number, formato: string): string {
  if (t > 0)
    return `<span style="color:${COR.verde}">▲ ${esc(valorIndicador(Math.abs(t), formato))}</span>`;
  if (t < 0)
    return `<span style="color:${COR.vermelho}">▼ ${esc(valorIndicador(Math.abs(t), formato))}</span>`;
  return `<span style="color:${COR.textoSec}">–</span>`;
}

/** Uma página A4 do relatório para um colaborador. */
export function htmlPaginaOperador(p: PerfilColaborador): string {
  const c = p.colaborador;
  const s = p.score;

  const componentes = s.componentes
    .map((comp) => {
      const largura = Math.max(0, Math.min(100, comp.valor));
      return `<div class="comp"><span class="comp-rot">${esc(comp.rotulo)}</span><span class="comp-barra"><span class="comp-fill" style="width:${largura}%"></span></span><span class="comp-val">${comp.valor}</span></div>`;
    })
    .join('');

  const resumo =
    p.resumo && p.resumo.length > 0
      ? `<ul class="resumo">${p.resumo.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
      : '';

  const linhasInd = p.indicadores
    .map((ind) => {
      const pos =
        ind.posicao != null
          ? `${ind.posicao}º de ${ind.totalParticipantes}`
          : '–';
      return `<tr><td>${esc(ind.titulo)}</td><td class="num">${esc(valorIndicador(ind.valor, ind.formato))}</td><td class="num">${esc(pos)}</td><td class="num">${esc(valorIndicador(ind.mediaEquipe, ind.formato))}</td><td class="num">${tendenciaTexto(ind.tendencia, ind.formato)}</td></tr>`;
    })
    .join('');
  const tabelaInd = p.indicadores.length
    ? `<table class="tabela"><thead><tr><th>Indicador</th><th class="num">Valor</th><th class="num">Posição</th><th class="num">Média equipe</th><th class="num">Tendência</th></tr></thead><tbody>${linhasInd}</tbody></table>`
    : '<p class="vazio">Sem indicadores no período.</p>';

  // Gráfico de barras do indicador principal (maior é melhor), últimos meses.
  const principal =
    p.indicadores.find((i) => i.sentido === 'MAIOR_MELHOR') ??
    p.indicadores[0];
  const graficoIndicador = principal
    ? `<div class="bloco"><h3>${esc(principal.titulo)} — últimos meses</h3>${svgBarras(
        principal.serie,
        {
          formatarTopo: (v) =>
            principal.formato === 'MOEDA'
              ? formatarMoeda(v)
              : formatarNumero(v),
        },
      )}</div>`
    : '';

  // Faltas.
  const f = p.faltas;
  const faltasResumo = `<div class="chips"><span class="chip"><b>${f.total}</b> faltas</span><span class="chip"><b>${f.taxa}%</b> absenteísmo</span><span class="chip"><b>${f.justificadas}</b> justificadas</span><span class="chip chip-${f.risco.toLowerCase()}">risco ${esc(f.risco)}</span></div>`;
  const graficoFaltas = `<div class="bloco"><h3>Faltas por mês</h3>${svgBarras(f.porMes)}</div>`;

  // Incidências.
  const inc = p.incidencias;
  const porTipo = inc.porTipo && inc.porTipo.length
    ? `<div class="chips">${inc.porTipo.map((t) => `<span class="chip"><b>${t.total}</b> ${esc(t.rotulo)}</span>`).join('')}</div>`
    : '<p class="vazio">Sem incidências no período.</p>';
  const graficoIncid = inc.porDiaSemana && inc.porDiaSemana.some((d) => d.valor > 0)
    ? `<div class="bloco"><h3>Incidências por dia da semana</h3>${svgBarras(inc.porDiaSemana)}</div>`
    : '';

  // Pizza: motivos de cancelamento de cupom.
  const temMotivos =
    p.motivosCancelamento && p.motivosCancelamento.some((m) => m.valor > 0);
  const graficoMotivos = temMotivos
    ? `<div class="bloco"><h3>Motivos de cancelamento de cupom</h3>${htmlPizza(p.motivosCancelamento, formatarNumero)}</div>`
    : '';

  // Tempo de casa / contrato (informativo).
  const contrato =
    p.contrato && p.contrato.temAdmissao
      ? `<div class="bloco"><h3>Tempo de casa</h3><div class="chips"><span class="chip"><b>${p.contrato.diasDeCasa}</b> dias de casa</span><span class="chip">admissão ${esc(formatarData(p.contrato.dataAdmissao ?? ''))}</span><span class="chip">${esc(p.contrato.etiqueta ?? p.contrato.estado ?? '')}</span></div></div>`
      : '';

  const insignias =
    p.insignias && p.insignias.length
      ? `<div class="bloco"><h3>Destaques</h3><div class="chips">${p.insignias.map((i) => `<span class="chip chip-ok">${esc(i.titulo)}</span>`).join('')}</div></div>`
      : '';

  const tempoCasaTopo =
    p.contrato && p.contrato.temAdmissao
      ? ` · ${p.contrato.diasDeCasa} dias de casa`
      : '';

  return `
  <section class="pagina">
    <header class="cabecalho">
      <div>
        <h1>${esc(c.nome)}</h1>
        <p class="sub">Matrícula ${esc(c.matricula)} · ${esc(c.funcao)}${c.turno ? ` · ${esc(c.turno)}` : ''}${tempoCasaTopo}</p>
      </div>
      <div class="score">
        <div class="score-num" style="color:${corNivel(s.nivel)}">${s.valor}<span>/100</span></div>
        <div class="score-nivel" style="background:${corNivel(s.nivel)}">${esc(rotuloNivel(s.nivel))}</div>
      </div>
    </header>
    <p class="periodo">Período: ${esc(rotuloPeriodo(p.periodo.inicio, p.periodo.fim))}</p>

    <div class="bloco"><h3>Saúde por componente</h3>${componentes || '<p class="vazio">—</p>'}</div>
    ${resumo ? `<div class="bloco"><h3>Resumo</h3>${resumo}</div>` : ''}

    <div class="bloco"><h3>Indicadores</h3>${tabelaInd}</div>
    ${graficoIndicador}

    <div class="bloco"><h3>Assiduidade</h3>${faltasResumo}</div>
    ${graficoFaltas}

    <div class="bloco"><h3>Incidências de escala</h3>${porTipo}</div>
    ${graficoIncid}

    ${graficoMotivos}
    ${contrato}
    ${insignias}
  </section>`;
}

/** CSS do documento (A4, uma página por colaborador). */
const ESTILO = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: ${COR.texto}; margin: 0; font-size: 11px; }
  .capa { padding: 4px 0 12px; border-bottom: 2px solid ${COR.primaria}; margin-bottom: 12px; }
  .capa h1 { margin: 0; font-size: 18px; color: ${COR.primaria}; }
  .capa p { margin: 2px 0 0; color: ${COR.textoSec}; }
  .pagina { page-break-after: always; }
  .pagina:last-child { page-break-after: auto; }
  .cabecalho { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid ${COR.borda}; padding-bottom: 6px; }
  .cabecalho h1 { margin: 0; font-size: 16px; color: ${COR.primaria}; }
  .sub { margin: 2px 0 0; color: ${COR.textoSec}; }
  .score { text-align: right; }
  .score-num { font-size: 26px; font-weight: 800; line-height: 1; }
  .score-num span { font-size: 12px; color: ${COR.textoSec}; font-weight: 600; }
  .score-nivel { display: inline-block; margin-top: 4px; color: #fff; font-weight: 700; font-size: 10px; padding: 2px 8px; border-radius: 999px; }
  .periodo { color: ${COR.textoSec}; margin: 6px 0 10px; }
  .bloco { margin: 10px 0; page-break-inside: avoid; }
  .bloco h3 { margin: 0 0 6px; font-size: 12px; color: ${COR.texto}; border-left: 3px solid ${COR.primaria}; padding-left: 6px; }
  .vazio { color: ${COR.textoSec}; font-style: italic; margin: 2px 0; }
  .comp { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .comp-rot { width: 90px; color: ${COR.textoSec}; }
  .comp-barra { flex: 1; height: 8px; background: ${COR.divisor}; border-radius: 999px; overflow: hidden; }
  .comp-fill { display: block; height: 100%; background: ${COR.primaria}; }
  .comp-val { width: 28px; text-align: right; font-weight: 700; }
  .resumo { margin: 0; padding-left: 16px; }
  .resumo li { margin: 2px 0; }
  .tabela { width: 100%; border-collapse: collapse; }
  .tabela th, .tabela td { text-align: left; padding: 4px 6px; border-bottom: 1px solid ${COR.divisor}; }
  .tabela th { color: ${COR.textoSec}; font-weight: 600; }
  .tabela .num { text-align: right; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: ${COR.divisor}; border-radius: 999px; padding: 3px 10px; color: ${COR.texto}; }
  .chip-ok { background: #ECFDF5; color: ${COR.verde}; }
  .chip-alto { background: #FEF2F2; color: ${COR.vermelho}; }
  .chip-medio { background: #FFFBEB; color: ${COR.amarelo}; }
  .chip-baixo { background: #ECFDF5; color: ${COR.verde}; }
  .pizza { display: flex; align-items: center; gap: 16px; }
  .legenda { list-style: none; margin: 0; padding: 0; flex: 1; }
  .legenda li { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
  .ponto { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .leg-nome { flex: 1; }
  .leg-val { font-weight: 700; }
`;

/** Documento HTML completo: um colaborador por página A4. */
export function htmlRelatorio(
  perfis: PerfilColaborador[],
  opts: { periodo: { inicio: string; fim: string }; titulo?: string },
): string {
  const titulo = opts.titulo ?? 'Relatório de operadores';
  const capa = `<div class="capa"><h1>${esc(titulo)}</h1><p>Período: ${esc(rotuloPeriodo(opts.periodo.inicio, opts.periodo.fim))} · ${perfis.length} ${perfis.length === 1 ? 'operador' : 'operadores'} · Gerado em ${esc(formatarData(new Date()))}</p></div>`;
  const paginas = perfis.length
    ? perfis.map(htmlPaginaOperador).join('')
    : '<p class="vazio">Nenhum operador para o período selecionado.</p>';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${ESTILO}</style></head><body>${capa}${paginas}</body></html>`;
}
