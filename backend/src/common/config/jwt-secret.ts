import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Segredo efêmero (por processo) usado apenas em desenvolvimento/teste quando
 * JWT_SECRET não está definido. É memoizado para que TODAS as instâncias do
 * JwtModule (AcessosModule e SegurancaModule) compartilhem o mesmo segredo
 * dentro do mesmo processo — caso contrário, tokens assinados por um módulo
 * não seriam validados pelo outro.
 */
let segredoEfemero: string | undefined;

/**
 * Resolve o segredo de assinatura dos tokens JWT.
 *
 * - Produção: exige JWT_SECRET. Se ausente, LANÇA (falha rápida) — evita a
 *   assinatura com um segredo padrão conhecido, que permitiria forjar tokens.
 * - Desenvolvimento/teste: usa JWT_SECRET se definido; senão gera um segredo
 *   aleatório efêmero por processo (memoizado). Assim o ambiente local funciona
 *   sem configuração, mas nunca com um segredo fixo versionado no repositório.
 */
export function resolverSegredoJwt(config: ConfigService): string {
  const definido = config.get<string>('JWT_SECRET');
  if (definido && definido.trim() !== '') {
    return definido;
  }

  const ehProducao = config.get<string>('NODE_ENV') === 'production';
  if (ehProducao) {
    throw new Error(
      'JWT_SECRET é obrigatório em produção e não está definido. ' +
        'Defina a variável de ambiente JWT_SECRET antes de iniciar a API.',
    );
  }

  if (!segredoEfemero) {
    segredoEfemero = randomBytes(48).toString('hex');
  }
  return segredoEfemero;
}
