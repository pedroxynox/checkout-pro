import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PessoaPonto } from './ponto.service';
import { LeitorComprovanteService } from './leitor-comprovante.service';
import { interpretarComprovante, normalizarTexto } from './ponto-ocr.parser';
import { LerComprovanteDto } from './dto/ponto.dto';

/** Resultado da leitura do comprovante, para o app confirmar/corrigir. */
export interface RespostaLeituraComprovante {
  /** Texto bruto lido (auditoria). */
  texto: string;
  nome: string | null;
  data: string | null;
  hora: string | null;
  /** Colaboradores sugeridos pelo nome lido (para o usuário confirmar). */
  candidatos: PessoaPonto[];
}

/**
 * Orquestra a leitura do comprovante (Fase B): obtém o texto (já pronto, vindo do
 * ML Kit do Android, ou via OCR do nosso servidor para a web), interpreta
 * nome/data/hora e sugere os colaboradores correspondentes. O usuário sempre
 * confirma antes de gravar a batida (o registro em si é feito pelo endpoint de
 * batidas da Fase A).
 */
@Injectable()
export class PontoOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leitor: LeitorComprovanteService,
  ) {}

  async lerComprovante(
    dto: LerComprovanteDto,
  ): Promise<RespostaLeituraComprovante> {
    const temTexto = dto.texto && dto.texto.trim().length > 0;
    if (!temTexto && !dto.imagem) {
      throw new BadRequestException(
        'Envie o texto lido ou a imagem do comprovante.',
      );
    }
    const texto = temTexto
      ? (dto.texto as string)
      : await this.leitor.extrairTexto(dto.imagem as string);

    const interpretado = interpretarComprovante(texto);
    const candidatos = interpretado.nome
      ? await this.buscarCandidatos(interpretado.nome)
      : [];

    return {
      texto: interpretado.texto,
      nome: interpretado.nome,
      data: interpretado.data,
      hora: interpretado.hora,
      candidatos,
    };
  }

  /** Fiscais mais parecidos com o nome lido (tolerante a erros do OCR). */
  private async buscarCandidatos(nome: string): Promise<PessoaPonto[]> {
    const alvo = normalizarTexto(nome);
    const tokens = alvo.split(' ').filter((t) => t.length >= 3);
    const fiscais = await this.prisma.fiscal.findMany();

    const pontuados = fiscais
      .map((f) => {
        const n = normalizarTexto(f.nome);
        let score = 0;
        if (n === alvo) score = 100;
        else if (n.includes(alvo) || alvo.includes(n)) score = 80;
        else score = tokens.filter((t) => n.includes(t)).length * 20;
        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return pontuados.map((x) => ({
      id: x.f.id,
      nome: x.f.nome,
      tipoPessoa: 'FISCAL' as const,
    }));
  }
}
