import * as fc from 'fast-check';
import {
  ArquivoRef,
  StatusChecklist,
  TipoChecklist,
  aplicarEnvio,
  deveAlertar,
  ehImagem,
  extensaoImagemSegura,
} from './checklist.domain';

/**
 * Testes de propriedade (fast-check) do Modulo_Checklist.
 *
 * Cada teste implementa uma única propriedade de correção do design e executa
 * no mínimo 100 iterações. As decisões puras (status pelo envio, validação de
 * imagem e disparo do alerta) são exercitadas sem banco de dados.
 */

const NUM_RUNS = 100;

const tipoArb: fc.Arbitrary<TipoChecklist> = fc.constantFrom(
  'ABERTURA',
  'FECHAMENTO',
);
const statusArb: fc.Arbitrary<StatusChecklist> = fc.constantFrom(
  'PENDENTE',
  'FEITO',
);

// Gera arquivos ora imagem, ora não-imagem, por mimeType e/ou nome.
const arquivoArb: fc.Arbitrary<ArquivoRef> = fc.oneof(
  fc
    .constantFrom('image/png', 'image/jpeg', 'image/gif', 'image/webp')
    .map((mimeType) => ({ mimeType })),
  fc
    .constantFrom(
      'application/pdf',
      'text/plain',
      'application/zip',
      'video/mp4',
    )
    .map((mimeType) => ({ mimeType })),
  fc
    .constantFrom('foto.png', 'doc.pdf', 'planilha.xlsx', 'imagem.jpeg')
    .map((nome) => ({ nome })),
);

describe('Checklist — testes de propriedade', () => {
  // Feature: gestao-frente-de-caixa, Property 21: Status do checklist reflete o envio de imagem
  // Validates: Requirements 5.1.2, 5.1.5
  it('Property 21: status é FEITO se e somente se uma imagem válida foi enviada; senão PENDENTE', () => {
    fc.assert(
      fc.property(arquivoArb, (arquivo) => {
        // Checklist começa pendente.
        const resultado = aplicarEnvio('PENDENTE', arquivo);
        const ehImg = ehImagem(arquivo);
        if (ehImg) {
          return resultado.aceito === true && resultado.status === 'FEITO';
        }
        // Não-imagem: rejeitado e permanece pendente.
        return resultado.aceito === false && resultado.status === 'PENDENTE';
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: gestao-frente-de-caixa, Property 22: Arquivo não-imagem é rejeitado
  // Validates: Requirements 5.1.4
  it('Property 22: o envio é aceito se e somente se o arquivo for imagem; senão o status não muda', () => {
    fc.assert(
      fc.property(statusArb, arquivoArb, (statusAtual, arquivo) => {
        const resultado = aplicarEnvio(statusAtual, arquivo);
        const ehImg = ehImagem(arquivo);
        if (ehImg) {
          return resultado.aceito === true && resultado.status === 'FEITO';
        }
        // Rejeitado: status permanece inalterado.
        return resultado.aceito === false && resultado.status === statusAtual;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Segurança do upload: recusa tipos perigosos e força extensão segura.
  it('recusa image/svg+xml e outros image/* fora da allowlist', () => {
    expect(ehImagem({ mimeType: 'image/svg+xml' })).toBe(false);
    expect(ehImagem({ mimeType: 'image/svg+xml', nome: 'x.svg' })).toBe(false);
    expect(ehImagem({ mimeType: 'image/x-icon' })).toBe(false);
    expect(ehImagem({ nome: 'pagina.html' })).toBe(false);
    // Formatos válidos seguem aceitos.
    expect(ehImagem({ mimeType: 'image/jpeg' })).toBe(true);
    expect(ehImagem({ mimeType: 'image/png' })).toBe(true);
  });

  it('deriva extensão segura do tipo validado, ignorando o nome do cliente', () => {
    // MIME de imagem manda, mesmo que o nome tente ser .html/.svg.
    expect(
      extensaoImagemSegura({ mimeType: 'image/png', nome: 'x.html' }),
    ).toBe('png');
    expect(
      extensaoImagemSegura({ mimeType: 'image/jpeg', nome: 'x.svg' }),
    ).toBe('jpg');
    // Sem MIME, usa a extensão do nome só se estiver na allowlist (jpeg→jpg).
    expect(extensaoImagemSegura({ nome: 'foto.jpeg' })).toBe('jpg');
    // Fallback seguro quando não há pista confiável.
    expect(extensaoImagemSegura({ nome: 'arquivo' })).toBe('jpg');
  });

  // Feature: gestao-frente-de-caixa, Property 23: Disparo do alerta de checklist no horário-limite
  // Validates: Requirements 5.3.1, 5.3.2
  it('Property 23: alerta dispara se e somente se o horário-limite foi atingido e o checklist está pendente', () => {
    const limites: Record<TipoChecklist, number> = {
      ABERTURA: 9 * 60,
      FECHAMENTO: 14 * 60,
    };
    fc.assert(
      fc.property(
        tipoArb,
        fc.integer({ min: 0, max: 24 * 60 - 1 }),
        statusArb,
        (tipo, minutos, status) => {
          const alerta = deveAlertar(tipo, minutos, status);
          const esperado = minutos >= limites[tipo] && status === 'PENDENTE';
          return alerta === esperado;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
