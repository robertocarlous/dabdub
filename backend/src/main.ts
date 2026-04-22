import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService, type ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bull';
import type {
  Express,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import type { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { jwtConfig, type AppConfig } from './config';
import { QUEUE_LIST } from './queues/queue.constants';
import { User } from './users/entities/user.entity';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<AppConfig['port']>('app.port')!;
  const apiPrefix = config.get<AppConfig['apiPrefix']>('app.apiPrefix')!;
  const jwt = app.get<ConfigType<typeof jwtConfig>>(jwtConfig.KEY);
  const jwtService = app.get(JwtService);
  const userRepo = app.get<Repository<User>>(getRepositoryToken(User));

  app.enableCors();
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cheese Backend API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const dashboardPath = `/${apiPrefix}/admin/queues`;
  const queueDashboard = new ExpressAdapter();
  queueDashboard.setBasePath(dashboardPath);

  createBullBoard({
    queues: QUEUE_LIST.map(
      (name) => new BullAdapter(app.get<Queue>(getQueueToken(name))),
    ),
    serverAdapter: queueDashboard,
  });

  const expressApp = app.getHttpAdapter().getInstance() as Express;
  const dashboardRouter = queueDashboard.getRouter() as RequestHandler;
  const requireAdminQueueAccess: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      res.status(401).json({ message: 'Missing bearer token' });
      return;
    }

    try {
      const payload = jwtService.verify<{ sub: string }>(token, {
        secret: jwt.accessSecret,
      });
      const user = await userRepo.findOne({ where: { id: payload.sub } });

      if (!user || !user.isActive) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      if (!user.isAdmin) {
        res.status(403).json({ message: 'Admin access required' });
        return;
      }

      next();
    } catch {
      res.status(401).json({ message: 'Invalid bearer token' });
    }
  };

  expressApp.use(dashboardPath, requireAdminQueueAccess);
  expressApp.use(dashboardPath, dashboardRouter);

  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
}

void bootstrap();
