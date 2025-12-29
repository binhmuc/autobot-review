import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { ReviewsModule } from './reviews/reviews.module';
import { DevelopersModule } from './developers/developers.module';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting (60 requests per minute)
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    // Database
    PrismaModule,
    // Background jobs with Bull
    QueueModule,
    // Webhooks
    WebhooksModule,
    // Authentication
    AuthModule,
    // API Modules
    ProjectsModule,
    ReviewsModule,
    DevelopersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
