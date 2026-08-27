/**
 * Desenho da escala publicada: dimensões de saída, conteúdo que precisa estar
 * visível e a folha de impressão. O SVG é texto, então dá para afirmar sobre ele
 * sem renderizar nada.
 */
import type {
  EscalaDiaPublicada,
  EscalaSemanaPublicada,
} from '../api/services/escalaExportacao';
import {
  LARGURA_DIA,
  LARGURA_SEMANA,
  htmlDeImpressao,
  nomeArquivoEscala,
  svgEscalaDia,
  svgEscalaSemana,
} from './escalaLayout';

const GERADO_EM = new Date(2026, 6, 21, 8, 5); // 21/07/2026 08:05 local

const DIA: EscalaDiaPublicada = {
  dataISO: '2026-07-21',
  diaSemana: 2, // terça
  ehFeriado: false,
  nomeFeriado: null,
  grupoFolgaDomingo: null,
  totais: { trabalhando: 2, folgas: 1, faltas: 1, atestados: 0, ferias: 0 },
  secoes: [
    {
      funcao: 'FISCAL',
      linhas: [
        {
          colaboradorId: 'f1',
          nome: 'Ana Souza',
          funcao: 'FISCAL',
          turno: 'ABERTURA',
          status: 'TRABALHA',
          entrada: '07:00',
          saida: '15:20',
          horarioEspecial: false,
        },
      ],
    },
    {
      funcao: 'OPERADOR',
      linhas: [
        {
          colaboradorId: 'o1',
          nome: 'Bruno Lima',
          funcao: 'OPERADOR',
          turno: 'FECHAMENTO',
          status: 'TRABALHA',
          entrada: '14:00',
          saida: '22:20',
          horarioEspecial: true,
        },
        {
          colaboradorId: 'o2',
          nome: 'Carla Dias',
          funcao: 'OPERADOR',
          turno: null,
          status: 'FOLGA',
          entrada: null,
          saida: null,
          horarioEspecial: false,
        },
        {
          colaboradorId: 'o3',
          nome: 'Diego Reis',
          funcao: 'OPERADOR',
          turno: 'APOIO',
          status: 'FALTA',
          entrada: '09:00',
          saida: '17:20',
          horarioEspecial: false,
        },
      ],
    },
  ],
};

const SEMANA: EscalaSemanaPublicada = {
  inicioISO: '2026-07-20',
  fimISO: '2026-07-26',
  dias: [
    { dataISO: '2026-07-20', diaSemana: 1, ehFeriado: false, nomeFeriado: null },
    { dataISO: '2026-07-21', diaSemana: 2, ehFeriado: false, nomeFeriado: null },
    { dataISO: '2026-07-22', diaSemana: 3, ehFeriado: true, nomeFeriado: 'Padroeira' },
    { dataISO: '2026-07-23', diaSemana: 4, ehFeriado: false, nomeFeriado: null },
    { dataISO: '2026-07-24', diaSemana: 5, ehFeriado: false, nomeFeriado: null },
    { dataISO: '2026-07-25', diaSemana: 6, ehFeriado: false, nomeFeriado: null },
    { dataISO: '2026-07-26', diaSemana: 0, ehFeriado: false, nomeFeriado: null },
  ],
  secoes: [
    {
      funcao: 'OPERADOR',
      pessoas: [
        {
          colaboradorId: 'o1',
          nome: 'Ana Souza',
          funcao: 'OPERADOR',
          turno: 'ABERTURA',
          celulas: [
            { status: 'FOLGA', entrada: null, saida: null },
            { status: 'TRABALHA', entrada: '07:00', saida: '15:20' },
            { status: 'TRABALHA', entrada: '09:00', saida: '17:20' },
            { status: 'TRABALHA', entrada: '07:00', saida: '15:20' },
            { status: 'TRABALHA', entrada: '08:00', saida: '17:20' },
            { status: 'TRABALHA', entrada: '08:00', saida: '17:20' },
            { status: 'FERIAS', entrada: null, saida: null },
          ],
        },
      ],
    },
  ],
};

describe('svgEscalaDia', () => {
  it('sai em retrato com a largura de 4K no lado curto', () => {
    // A nitidez ao ampliar no celular depende disso: é o requisito da imagem.
    const img = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    expect(img.largura).toBe(LARGURA_DIA);
    expect(img.orientacao).toBe('retrato');
    expect(img.svg.startsWith('<svg')).toBe(true);
    expect(img.svg).toContain(`width="${LARGURA_DIA}"`);
  });

  it('declara retrato mesmo quando a equipe é pequena e o desenho fica baixo', () => {
    // A altura depende de quantas pessoas há: deduzir a orientação da proporção
    // imprimiria a escala do dia em paisagem num dia de equipe reduzida.
    const img = svgEscalaDia(
      { ...DIA, secoes: [{ funcao: 'FISCAL', linhas: [DIA.secoes[0].linhas[0]] }] },
      { geradoEm: GERADO_EM },
    );

    expect(img.altura).toBeLessThan(img.largura);
    expect(img.orientacao).toBe('retrato');
    expect(htmlDeImpressao(img, 'x')).toContain('size: 210mm');
  });

  it('mostra o dia da semana, a data e as seções por função', () => {
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    expect(svg).toContain('Terça-feira');
    expect(svg).toContain('21/07/2026');
    expect(svg).toContain('Fiscais');
    expect(svg).toContain('Operadores de caixa');
  });

  it('mostra nome e horário de quem trabalha', () => {
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    expect(svg).toContain('Ana Souza');
    expect(svg).toContain('07:00 – 15:20');
  });

  it('mostra quem folga, com a palavra Folga', () => {
    // Quem não se vê na escala conclui que a esqueceram, não que descansa.
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    expect(svg).toContain('Carla Dias');
    expect(svg).toContain('Folga');
  });

  it('na falta mantém o turno previsto ao lado da palavra Falta', () => {
    // É o que diz qual horário ficou descoberto.
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    expect(svg).toContain('Falta');
    expect(svg).toContain('09:00 – 17:20');
  });

  it('o fundo zebrado não cobre o separador da linha anterior', () => {
    // No SVG quem é pintado depois cobre quem veio antes. O fundo da linha
    // zebrada começa exatamente onde está o separador da pessoa anterior, então
    // sem o recuo as linhas entre nomes desaparecem em toda linha alternada —
    // e "linhas separando cada nome" é o pedido central do documento.
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });

    const separadores = [
      ...svg.matchAll(/<line[^>]*y1="([\d.]+)"[^>]*stroke="#EDF1F6"/g),
    ].map((m) => Number(m[1]));
    const zebras = [
      ...svg.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*fill="#F7FAFC"/g),
    ].map((m) => Number(m[1]));

    expect(zebras.length).toBeGreaterThan(0);
    for (const y of zebras) {
      expect(separadores).not.toContain(y);
    }
  });

  it('marca o horário especial', () => {
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });
    expect(svg).toContain('Horário especial');
  });

  it('destaca o feriado com o nome', () => {
    const { svg } = svgEscalaDia(
      { ...DIA, ehFeriado: true, nomeFeriado: 'Padroeira' },
      { geradoEm: GERADO_EM },
    );
    expect(svg).toContain('Feriado · Padroeira');
  });

  it('no domingo informa o grupo que folga pelo rodízio', () => {
    const { svg } = svgEscalaDia(
      { ...DIA, diaSemana: 0, grupoFolgaDomingo: 'G2' },
      { geradoEm: GERADO_EM },
    );
    expect(svg).toContain('Domingo · folga G2');
  });

  it('assina o rodapé com o momento da geração', () => {
    // Sem isso, uma escala reenviada dias depois passa por atual.
    const { svg } = svgEscalaDia(DIA, { geradoEm: GERADO_EM });
    expect(svg).toContain('Escala gerada em 21/07/2026 08:05');
  });

  it('sem logo, o rodapé mostra o nome da loja em texto', () => {
    const { svg } = svgEscalaDia(DIA, {
      geradoEm: GERADO_EM,
      logoDataUri: null,
      loja: 'Comercial Zaffari · Stok Center',
    });
    expect(svg).toContain('Comercial Zaffari · Stok Center');
    expect(svg).not.toContain('<image');
  });

  it('com logo, embute a imagem no rodapé', () => {
    const { svg } = svgEscalaDia(DIA, {
      geradoEm: GERADO_EM,
      logoDataUri: 'data:image/png;base64,AAAA',
    });
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,AAAA');
  });

  it('escapa caracteres especiais dos nomes', () => {
    // Um "&" num nome quebraria o SVG inteiro (e a escala sairia em branco).
    const { svg } = svgEscalaDia(
      {
        ...DIA,
        secoes: [
          {
            funcao: 'OPERADOR',
            linhas: [
              {
                ...DIA.secoes[0].linhas[0],
                nome: 'Ana & Cia <teste>',
              },
            ],
          },
        ],
      },
      { geradoEm: GERADO_EM },
    );
    expect(svg).toContain('Ana &amp; Cia &lt;teste&gt;');
  });
});

describe('svgEscalaSemana', () => {
  it('sai em paisagem 4K, porque a grade tem sete colunas', () => {
    const img = svgEscalaSemana(SEMANA, { geradoEm: GERADO_EM });

    expect(img.largura).toBe(LARGURA_SEMANA);
    expect(img.svg).toContain(`width="${LARGURA_SEMANA}"`);
  });

  it('traz o período e o cabeçalho dos sete dias', () => {
    const { svg } = svgEscalaSemana(SEMANA, { geradoEm: GERADO_EM });

    expect(svg).toContain('20/07/2026 a 26/07/2026');
    for (const curto of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) {
      expect(svg).toContain(curto);
    }
  });

  it('cada célula mostra o horário do dia ou o estado', () => {
    const { svg } = svgEscalaSemana(SEMANA, { geradoEm: GERADO_EM });

    expect(svg).toContain('Ana Souza');
    expect(svg).toContain('07:00');
    expect(svg).toContain('Folga');
    expect(svg).toContain('Férias');
  });
});

describe('htmlDeImpressao', () => {
  it('usa folha em retrato para o dia e paisagem para a semana', () => {
    const dia = htmlDeImpressao(svgEscalaDia(DIA), 'Escala do dia');
    const semana = htmlDeImpressao(svgEscalaSemana(SEMANA), 'Escala da semana');

    expect(dia).toContain('size: 210mm');
    expect(semana).toContain('size: 297mm');
  });

  it('embute o SVG e o título', () => {
    const html = htmlDeImpressao(svgEscalaDia(DIA), 'Escala do dia 21/07/2026');

    expect(html).toContain('<title>Escala do dia 21/07/2026</title>');
    expect(html).toContain('<svg');
  });
});

describe('nomeArquivoEscala', () => {
  it('gera um nome previsível, com tipo e data', () => {
    expect(nomeArquivoEscala('dia', '2026-07-21', 'png')).toBe(
      'escala-dia-2026-07-21.png',
    );
    expect(nomeArquivoEscala('semana', '2026-07-20', 'pdf')).toBe(
      'escala-semana-2026-07-20.pdf',
    );
  });
});
