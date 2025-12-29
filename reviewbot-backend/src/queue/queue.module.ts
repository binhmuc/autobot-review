import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReviewProcessor } from './review-processor';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmModule } from '../llm/llm.module';
import { GitLabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [
    // Configure Bull queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST') || 'localhost';
        const redisPort = configService.get<number>('REDIS_PORT') || 6379;

        console.log(`[QueueModule] Connecting to Redis at ${redisHost}:${redisPort}`);

        return {
          redis: {
            host: redisHost,
            port: redisPort,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            tls: process.env.REDIS_USETLS === 'true' ? {} : undefined,
            retryStrategy: (times) => {
              console.log(`[QueueModule] Redis connection retry attempt ${times}`);
              const delay = Math.min(times * 50, 2000);
              console.log(`[QueueModule] Retrying in ${delay}ms...`);
              return delay;
            }
          },
          settings: {
            lockDuration: 30000,
            stalledInterval: 30000,
            maxStalledCount: 1,
          },
        };
      },
      inject: [ConfigService],
    }),
    // Register review queue
    BullModule.registerQueue({
      name: 'review-queue',
    }),
    // Dependencies
    PrismaModule,
    LlmModule,
    GitLabModule,
  ],
  providers: [ReviewProcessor],
  exports: [BullModule],
})
export class QueueModule {}
