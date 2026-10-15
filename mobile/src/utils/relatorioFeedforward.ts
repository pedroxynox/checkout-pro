/**
 * Geração **pura** dos documentos impressos do Feedforward em HTML (para virar
 * PDF/impressão via `utils/impressao`). Sem dependências de React Native: só
 * recebe os dados e devolve strings de HTML — por isso é coberto por testes.
 *
 * Três documentos, todos em folha **A4**:
 *  - **Rodada:** uma conversa registrada (textos, nota, pontos com semáforo e
 *    revisão, foto do formulário) com campos de assinatura.
 *  - **Histórico:** capa com o resumo + uma rodada por página.
 *  - **Formulário em branco:** as perguntas da conversa com linhas para o
 *    colaborador responder à mão (é o papel que depois é fotografado).
 */
import {
  RodadaFeedforward,
  SituacaoPontoFeedforward,
} from '../api/types';
import { formatarData, formatarDataHora } from './formato';
import { esc } from './relatorioPerfil';

/** Perguntas do formulário de feedforward (fonte única: tela e impressão). */
export const PERGUNTAS_FEEDFORWARD: { secao: string; itens: string[] }[] = [
  {
    secao: '1. Autoavaliação',
    itens: [
      'Qual foi sua principal conquista desde nossa última conversa?',
      'Qual comportamento seu mais contribuiu para esse resultado?',
      'Qual é seu maior desafio hoje?',
      'O que depende exclusivamente de você para superar esse desafio?',
    ],
  },
  {
    secao: '2. Olhando para o futuro',
    itens: [
      'Como você deseja ser reconhecido pela equipe nos próximos 90 dias?',
      'Qual hábito você precisa desenvolver para alcançar esse objetivo?',
      'Qual hábito você precisa reduzir ou eliminar?',
    ],
  },
  {
    secao: '3. Cliente e equipe',
    itens: [
      'O que você pode fazer para proporcionar uma experiência ainda melhor aos clientes?',
      'Como você pode contribuir mais com seus colegas de trabalho?',
    ],
  },
];

/** Rótulos do semáforo de um ponto (fonte única: tela e impressão). */
export const ROTULO_SITUACAO_FEEDFORWARD: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: 'No prazo',
  PROXIMO: 'Vence em breve',
  VENCIDO: 'Prazo vencido',
  ATINGIDO: 'Atingido',
  NAO_ATINGIDO: 'Não atingido',
};

const COR_SITUACAO: Record<SituacaoPontoFeedforward, string> = {
  EM_DIA: '#10B981',
  PROXIMO: '#F59E0B',
  VENCIDO: '#EF4444',
  ATINGIDO: '#10B981',
  NAO_ATINGIDO: '#EF4444',
};

const ROTULO_FUNCAO: Record<string, string> = {
  OPERADOR: 'Operador(a) de caixa',
  FISCAL: 'Fiscal',
  SUPERVISOR: 'Supervisor(a)',
  GESTOR: 'Gerente',
};

/** Rótulo legível da função/cargo (mantém o valor original se desconhecido). */
export function rotuloCargo(cargo: string | null | undefined): string {
  if (!cargo) return '—';
  return ROTULO_FUNCAO[cargo] ?? cargo;
}

/** Identificação do colaborador impressa no cabeçalho. */
export interface ColaboradorImpressao {
  nome: string;
  matricula?: string | null;
  funcao?: string | null;
}

/** Opções comuns dos documentos. */
export interface OpcoesImpressao {
  /** Monta a URL absoluta de uma foto (`fotoUrl` vem relativa da API). */
  urlFoto?: (caminho: string) => string;
  /** Data de geração (injetável para testes). */
  geradoEm?: Date;
}

/** Nota 1–5 como estrelas de texto (★★★☆☆ 3/5). */
export function estrelasTexto(nota: number | null): string {
  if (nota == null) return 'Sem nota';
  const n = Math.max(0, Math.min(5, Math.round(nota)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${n}/5`;
}

/** Texto multilinha com quebras preservadas (escapado). */
function textoMultilinha(valor: string): string {
  return esc(valor).replace(/\r?\n/g, '<br />');
}

function cabecalho(
  titulo: string,
  c: ColaboradorImpressao,
  extra: string,
): string {
  const matricula = c.matricula ? ` · Matrícula ${esc(c.matricula)}` : '';
  const funcao = c.funcao ? ` · ${esc(rotuloCargo(c.funcao))}` : '';
  return `<header class="cab"><div class="marca">Check-out PRO · Feedforward</div><h1>${esc(titulo)}</h1><p class="ident"><strong>${esc(c.nome)}</strong>${matricula}${funcao}</p>${extra}</header>`;
}

function blocoTexto(titulo: string, valor: string | null): string {
  if (!valor || !valor.trim()) return '';
  return `<section class="bloco"><h3>${esc(titulo)}</h3><p>${textoMultilinha(valor)}</p></section>`;
}

function tabelaPontos(r: RodadaFeedforward): string {
  if (r.pontos.length === 0) {
    return '<section class="bloco"><h3>Pontos a melhorar (com prazo)</h3><p class="vazio">Nenhum ponto registrado nesta rodada.</p></section>';
  }
  const linhas = r.pontos
    .map((p) => {
      const revisao =
        p.status !== 'PENDENTE' && (p.revisadoPorNome || p.revisadoEm)
          ? `<div class="rev">Revisado${p.revisadoPorNome ? ` por ${esc(p.revisadoPorNome)}` : ''}${p.revisadoEm ? ` em ${esc(formatarDataHora(p.revisadoEm))}` : ''}</div>`
          : '';
      const obs = p.observacaoRevisao
        ? `<div class="obs">“${textoMultilinha(p.observacaoRevisao)}”</div>`
        : '';
      const prorrogado = p.prorrogacoes
        ? `<div class="rev">Prorrogado ${p.prorrogacoes}x${p.prazoOriginal ? ` · prazo original ${esc(formatarData(p.prazoOriginal))}` : ''}${p.motivoProrrogacao ? ` · motivo: ${esc(p.motivoProrrogacao)}` : ''}</div>`
        : '';
      return `<tr><td>${esc(p.descricao)}${prorrogado}${revisao}${obs}</td><td class="nowrap">${esc(formatarData(p.prazo))}</td><td class="nowrap"><span class="bolinha" style="background:${COR_SITUACAO[p.situacao]}"></span>${esc(ROTULO_SITUACAO_FEEDFORWARD[p.situacao])}</td></tr>`;
    })
    .join('');
  return `<section class="bloco"><h3>Pontos a melhorar (com prazo)</h3><table class="pontos"><thead><tr><th>Ponto</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></section>`;
}

function assinaturas(): string {
  return '<section class="assinaturas"><div class="assin"><div class="linha"></div>Assinatura do(a) colaborador(a)</div><div class="assin"><div class="linha"></div>Assinatura do(a) líder</div></section>';
}

/** Corpo (sem `<html>`) de uma rodada — uma página A4. */
export function htmlPaginaRodada(
  r: RodadaFeedforward,
  c: ColaboradorImpressao,
  opts: OpcoesImpressao = {},
): string {
  const lider = r.liderNome ? ` · Líder: ${esc(r.liderNome)}` : '';
  const cargo = r.cargo ? ` · Cargo na data: ${esc(rotuloCargo(r.cargo))}` : '';
  const meta = `<p class="meta">Conversa de ${esc(formatarData(r.data))}${lider}${cargo}</p><p class="meta">Nota de evolução: <strong>${esc(estrelasTexto(r.evolucaoNota))}</strong></p>`;
  const foto =
    r.fotoUrl && opts.urlFoto
      ? `<section class="bloco"><h3>Foto do formulário</h3><img class="foto" src="${esc(opts.urlFoto(r.fotoUrl))}" alt="Foto do formulário de feedforward" /></section>`
      : '';
  return `<div class="pagina">${cabecalho('Rodada de feedforward', c, meta)}${blocoTexto('Pontos fortes', r.pontosFortes)}${blocoTexto('Oportunidades de desenvolvimento', r.oportunidades)}${tabelaPontos(r)}${blocoTexto('Compromisso final', r.compromissoFinal)}${foto}${assinaturas()}</div>`;
}

/** Resumo numérico de um histórico (usado na capa do histórico impresso). */
export interface ResumoHistorico {
  rodadas: number;
  pontos: number;
  atingidos: number;
  naoAtingidos: number;
  pendentes: number;
  vencidos: number;
}

/** Conta rodadas e pontos por estado. */
export function resumoHistorico(rodadas: RodadaFeedforward[]): ResumoHistorico {
  const pontos = rodadas.flatMap((r) => r.pontos);
  return {
    rodadas: rodadas.length,
    pontos: pontos.length,
    atingidos: pontos.filter((p) => p.status === 'ATINGIDO').length,
    naoAtingidos: pontos.filter((p) => p.status === 'NAO_ATINGIDO').length,
    pendentes: pontos.filter((p) => p.status === 'PENDENTE').length,
    vencidos: pontos.filter((p) => p.situacao === 'VENCIDO').length,
  };
}

const ESTILO = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; font-size: 12px; margin: 0; }
  .pagina { page-break-after: always; break-after: page; }
  .pagina:last-child { page-break-after: auto; break-after: auto; }
  .cab { border-bottom: 2px solid #0F4C81; padding-bottom: 8px; margin-bottom: 12px; }
  .marca { color: #0F4C81; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  h1 { font-size: 20px; margin: 4px 0; }
  h3 { font-size: 13px; color: #0F4C81; margin: 0 0 4px; }
  .ident { margin: 2px 0; font-size: 13px; }
  .meta { margin: 2px 0; color: #374151; }
  .bloco { margin: 10px 0; page-break-inside: avoid; break-inside: avoid; }
  .bloco p { margin: 0; line-height: 1.45; }
  .vazio { color: #6B7280; font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #E5E7EB; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #E8EFF7; }
  .nowrap { white-space: nowrap; }
  .bolinha { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
  .rev { color: #6B7280; font-size: 11px; margin-top: 2px; }
  .obs { font-style: italic; font-size: 11px; margin-top: 2px; }
  .foto { max-width: 100%; max-height: 120mm; border: 1px solid #E5E7EB; border-radius: 4px; }
  .assinaturas { display: flex; gap: 24px; margin-top: 36px; page-break-inside: avoid; break-inside: avoid; }
  .assin { flex: 1; text-align: center; color: #374151; font-size: 11px; }
  .linha { border-top: 1px solid #111827; margin-bottom: 4px; height: 0; }
  .campo { display: flex; gap: 6px; align-items: flex-end; margin: 6px 0; }
  .campo span { white-space: nowrap; }
  .campo .traco { flex: 1; border-bottom: 1px solid #9CA3AF; height: 16px; }
  .pergunta { margin: 10px 0 2px; font-weight: 600; page-break-inside: avoid; break-inside: avoid; }
  .resp { border-bottom: 1px solid #9CA3AF; height: 22px; }
  .nota-caixas span { display: inline-block; width: 26px; height: 26px; border: 1px solid #111827; border-radius: 4px; text-align: center; line-height: 26px; margin-right: 6px; }
  .resumo { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .resumo div { border: 1px solid #E5E7EB; border-radius: 6px; padding: 8px 10px; min-width: 110px; }
  .resumo strong { display: block; font-size: 18px; color: #0F4C81; }
  .rodape { color: #6B7280; font-size: 10px; margin-top: 8px; }
`;

function documento(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(titulo)}</title><style>${ESTILO}</style></head><body>${corpo}</body></html>`;
}

function rodapeGerado(opts: OpcoesImpressao): string {
  return `<p class="rodape">Gerado em ${esc(formatarDataHora(opts.geradoEm ?? new Date()))}</p>`;
}

/** Documento completo de **uma rodada**. */
export function htmlRodadaFeedforward(
  r: RodadaFeedforward,
  c: ColaboradorImpressao,
  opts: OpcoesImpressao = {},
): string {
  return documento(
    `Feedforward — ${c.nome} — ${formatarData(r.data)}`,
    htmlPaginaRodada(r, c, opts) + rodapeGerado(opts),
  );
}

/** Documento completo do **histórico** (capa com resumo + uma rodada por página). */
export function htmlHistoricoFeedforward(
  rodadas: RodadaFeedforward[],
  c: ColaboradorImpressao,
  opts: OpcoesImpressao = {},
): string {
  const s = resumoHistorico(rodadas);
  const periodo =
    rodadas.length > 0
      ? `<p class="meta">De ${esc(formatarData(rodadas[rodadas.length - 1].data))} a ${esc(formatarData(rodadas[0].data))}</p>`
      : '';
  const cartoes = `<div class="resumo"><div><strong>${s.rodadas}</strong>Rodadas</div><div><strong>${s.pontos}</strong>Pontos a melhorar</div><div><strong>${s.atingidos}</strong>Atingidos</div><div><strong>${s.naoAtingidos}</strong>Não atingidos</div><div><strong>${s.pendentes}</strong>Pendentes</div><div><strong>${s.vencidos}</strong>Com prazo vencido</div></div>`;
  const capa = `<div class="pagina">${cabecalho('Histórico de feedforward', c, periodo)}${cartoes}${
    rodadas.length === 0
      ? '<p class="vazio">Nenhuma rodada de feedforward registrada.</p>'
      : '<p class="meta">As rodadas seguem nas próximas páginas, da mais recente para a mais antiga.</p>'
  }${rodapeGerado(opts)}</div>`;
  const paginas = rodadas.map((r) => htmlPaginaRodada(r, c, opts)).join('');
  return documento(`Histórico de feedforward — ${c.nome}`, capa + paginas);
}

/**
 * Documento do **formulário em branco**, para o colaborador responder à mão.
 * Se `c` vier, o cabeçalho já sai com o nome; senão, com linhas para preencher.
 */
export function htmlFormularioFeedforward(
  c?: ColaboradorImpressao | null,
  opts: OpcoesImpressao = {},
): string {
  const campo = (rotulo: string, valor?: string | null): string =>
    valor
      ? `<div class="campo"><span>${esc(rotulo)}: <strong>${esc(valor)}</strong></span></div>`
      : `<div class="campo"><span>${esc(rotulo)}:</span><div class="traco"></div></div>`;
  const ident = `<header class="cab"><div class="marca">Check-out PRO · Feedforward</div><h1>Formulário de feedforward</h1>${campo('Colaborador(a)', c?.nome)}${campo('Matrícula', c?.matricula)}${campo('Cargo', c?.funcao ? rotuloCargo(c.funcao) : null)}${campo('Data da conversa')}${campo('Líder')}</header>`;

  const perguntas = PERGUNTAS_FEEDFORWARD.map(
    (g) =>
      `<section class="bloco"><h3>${esc(g.secao)}</h3>${g.itens
        .map(
          (q) =>
            `<div class="pergunta">${esc(q)}</div><div class="resp"></div><div class="resp"></div>`,
        )
        .join('')}</section>`,
  ).join('');

  const linhasPontos = [1, 2, 3, 4]
    .map((i) => `<tr><td>${i}.</td><td style="height:28px"></td><td></td></tr>`)
    .join('');
  const pontos = `<section class="bloco"><h3>4. Pontos a melhorar (com prazo)</h3><table><thead><tr><th style="width:24px">#</th><th>O que vou melhorar</th><th style="width:110px">Até quando</th></tr></thead><tbody>${linhasPontos}</tbody></table></section>`;

  const nota = `<section class="bloco"><h3>5. Nota de evolução (preenchida pelo líder)</h3><div class="nota-caixas"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div></section>`;

  const compromisso = `<section class="bloco"><h3>6. Compromisso final</h3><div class="resp"></div><div class="resp"></div></section>`;

  return documento(
    c?.nome ? `Formulário de feedforward — ${c.nome}` : 'Formulário de feedforward',
    `<div class="pagina">${ident}${perguntas}${pontos}${nota}${compromisso}${assinaturas()}${rodapeGerado(opts)}</div>`,
  );
}
