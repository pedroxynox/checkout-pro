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

  // Aumenta o limite do corpo JSON para aceitar a imagem do papelito (base64)
  // enviada pela versão web ao endpoint de OCR (/ponto/ocr). O padrão do
  // Express (100kb) é pequeno para fotos.
  app.useBodyParser('json', { limit: '12mb' });

  // Serve as imagens dos procedimentos guiados (passo a passo das normativas)
  // como arquivos estáticos em /assets. Ficam versionadas no repositório
  // (backend/assets), portanto persistem entre os deploys do Render.
  app.useStaticAssets(join(__dirname, '..', 'assets'), { prefix: '/assets/' });

  // Serve os arquivos ENVIADOS pelos usuários (ex.: as FOTOS dos checklists),
  // gravados em disco pelo LocalDiskStorage sob STORAGE_DIR e expostos no
  // prefixo STORAGE_PUBLIC_URL (padrão "/arquivos"). Sem este registro, a URL
  // da imagem do checklist retornava 404 e a foto nunca aparecia/abria. Só
  // registramos quando o prefixo é um caminho local (começa com "/"); se
  // apontar para um storage externo (http...), a entrega é feita por ele.
  const storageDir = process.env.STORAGE_DIR ?? 'uploads';
  const storagePublicUrl = process.env.STORAGE_PUBLIC_URL ?? '/arquivos';
  if (storagePublicUrl.startsWith('/')) {
    app.useStaticAssets(join(process.cwd(), storageDir), {
      prefix: storagePublicUrl.endsWith('/')
        ? storagePublicUrl
        : `${storagePublicUrl}/`,
    });
  }

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
