import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { origensCorsDoAmbiente } from './common/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve as imagens dos procedimentos guiados (passo a passo das normativas)
  // como arquivos estáticos em /assets. Ficam versionadas no repositório
  // (backend/assets), portanto persistem entre os deploys do Render.
  app.useStaticAssets(join(__dirname, '..', 'assets'), { prefix: '/assets/' });

  // Cabeçalhos de segurança HTTP (helmet). CORP definido como "cross-origin"
  // para que as imagens estáticas em /assets possam ser carregadas pelo app
  // web hospedado em outro domínio (ex.: checkout-pro-web.onrender.com).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Habilita CORS para que a versão WEB (rodando em outro domínio, ex.:
  // checkout-pro-web.onrender.com) possa chamar a API do navegador. As origens
  // permitidas vêm de CORS_ORIGINS (allowlist); em produção, defina essa
  // variável para restringir quem pode chamar a API. Sem ela (dev), a origem
  // é refletida. A autenticação é via token Bearer (sem cookies), portanto NÃO
  // habilitamos credentials. No app nativo (APK) o CORS não se aplica.
  app.enableCors({ origin: origensCorsDoAmbiente() });

  // Validação global de DTOs com class-validator / class-transformer.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const logger = new Logger('Bootstrap');

  // Escuta em 0.0.0.0 para funcionar em provedores de hospedagem (ex.: Render),
  // que encaminham o tráfego para a porta definida na variável de ambiente PORT.
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend Check-out PRO ouvindo na porta ${port}`);
}

void bootstrap();
