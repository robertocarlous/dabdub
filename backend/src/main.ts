import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  readTelemetryConfig,
  shutdownTelemetry,
  startTelemetry,
} from './telemetry/telemetry';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  startTelemetry(readTelemetryConfig());
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('CheesePay API')
    .setDescription('Crypto-to-Fiat Settlement Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  process.once('SIGTERM', () => {
    void shutdownTelemetry();
  });
  process.once('SIGINT', () => {
    void shutdownTelemetry();
  });

  await app.listen(port);
  logger.log(`CheesePay API running on port ${port}`);
}

void bootstrap();
