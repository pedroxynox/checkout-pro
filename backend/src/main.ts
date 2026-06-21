import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve as imagens dos procedimentos guiados (passo a passo das normativas)
  // como arquivos estáticos em /assets. Ficam versionadas no repositório
  // (backend/assets), portanto persistem entre os deploys do Render.
  app.useStaticAssets(join(__dirname, '..', 'assets'), { prefix: '/assets/' });

  // Habilita CORS para que a versão WEB (rodando em outro domínio, ex.:
  // stok-center-web.onrender.com) possa chamar a API do navegador. A
  // autenticação é via token Bearer (sem cookies), então refletir a origem
  // da requisição é suficiente. No app nativo (APK) o CORS não se aplica.
  app.enableCors({
    origin: true,
    credentials: true,
  });

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

  // Escuta em 0.0.0.0 para funcionar em provedores de hospedagem (ex.: Render),
  // que encaminham o tráfego para a porta definida na variável de ambiente PORT.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Backend Stok Center ouvindo na porta ${port}`);
}

void bootstrap();
