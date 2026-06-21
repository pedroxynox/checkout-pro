import { join } from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
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
  const logger = new Logger('Bootstrap');

  // Aviso de segurança: em produção, JWT_SECRET DEVE estar definido. Sem ele, a
  // API recorreria a um segredo padrão conhecido (inseguro), permitindo forjar
  // tokens e burlar a autenticação. Não derrubamos o processo (para não
  // interromper o serviço em produção), mas registramos um alerta evidente.
  const ehProducao = configService.get<string>('NODE_ENV') === 'production';
  if (ehProducao && !configService.get<string>('JWT_SECRET')) {
    logger.error(
      'SEGURANÇA: JWT_SECRET não está definido em produção! A API está usando ' +
        'um segredo padrão inseguro. Defina a variável JWT_SECRET no ambiente ' +
        '(Render) o quanto antes — isso invalida sessões atuais (novo login).',
    );
  }

  // Escuta em 0.0.0.0 para funcionar em provedores de hospedagem (ex.: Render),
  // que encaminham o tráfego para a porta definida na variável de ambiente PORT.
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend Check-out PRO ouvindo na porta ${port}`);
}

void bootstrap();
