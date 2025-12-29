import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // We'll configure body parser manually
  });

  // Configure body parser with size limit (10MB)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Enable CORS for frontend with strict origin validation
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL must be set in production');
  }

  app.enableCors({
    origin: frontendUrl || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Gitlab-Token', 'X-Gitlab-Event'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      forbidNonWhitelisted: true, // Throw error if unknown properties
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('ReviewBot API')
    .setDescription('GitLab Code Review Bot - AI-powered code review automation with Claude')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter JWT token from /api/auth/login endpoint',
    })
    .addTag('Authentication', 'Admin authentication endpoints')
    .addTag('Projects', 'GitLab project management')
    .addTag('Reviews', 'Code review queries and statistics')
    .addTag('Developers', 'Developer performance and leaderboard')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep JWT token after page refresh
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'ReviewBot API Documentation',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`✓ ReviewBot Backend running on http://localhost:${port}`);
  console.log(`✓ API Documentation: http://localhost:${port}/api/docs`);
}
bootstrap();
