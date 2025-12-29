import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { MergeRequestEventDto } from './dto/merge-request-event.dto';
import { ReviewStatus } from '@prisma/client';

/**
 * Webhooks Service
 * Handles processing of GitLab webhook events
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @InjectQueue('review-queue') private reviewQueue: Queue,
  ) {}

  /**
   * Process GitLab Merge Request webhook event
   * Creates or updates project, developer, and review records
   * @param payload GitLab webhook payload
   * @returns Created review record or null if skipped
   */
  async processMergeRequest(payload: MergeRequestEventDto) {
    const { object_attributes, project, user } = payload;

    // Skip draft/WIP merge requests
    if (object_attributes.work_in_progress) {
      this.logger.log(`Skipping draft MR ${object_attributes.iid} in ${project.name}`);
      return null;
    }

    // Skip closed/merged MRs (only process open or reopened)
    if (!['opened', 'update', 'reopen', 'open'].includes(object_attributes.action)) {
      this.logger.log(`Skipping MR ${object_attributes.iid} with action: ${object_attributes.action}`);
      return null;
    }

    this.logger.log(`Processing MR ${object_attributes.iid} from ${project.name}`);

    try {
      // Use transaction for atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // Upsert project
        const projectRecord = await tx.project.upsert({
          where: { gitlabProjectId: project.id },
          update: {
            name: project.name,
            namespace: project.namespace,
            updatedAt: new Date(),
          },
          create: {
            gitlabProjectId: project.id,
            name: project.name,
            namespace: project.namespace,
            webhookSecret: this.configService.get<string>('GITLAB_WEBHOOK_SECRET') || 'default_secret',
            isActive: true,
          },
        });

        // Upsert developer using username as unique key
        const developerRecord = await tx.developer.upsert({
          where: { username: user.username },
          update: {
            gitlabUserId: user.id,
            name: user.name,
            avatarUrl: user.avatar_url,
            email: user.email || null,
            updatedAt: new Date(),
          },
          create: {
            gitlabUserId: user.id,
            username: user.username,
            email: user.email || null,
            name: user.name,
            avatarUrl: user.avatar_url,
          },
        });

        // Check if review already exists for this MR
        const existingReview = await tx.review.findFirst({
          where: {
            mergeRequestId: object_attributes.id,
            projectId: projectRecord.id,
          },
        });

        if (existingReview) {
          this.logger.log(`Review already exists for MR ${object_attributes.iid}, skipping creation`);
          return existingReview;
        }

        // Create new review record
        const review = await tx.review.create({
          data: {
            mergeRequestId: object_attributes.id,
            mergeRequestIid: object_attributes.iid,
            projectId: projectRecord.id,
            developerId: developerRecord.id,
            title: object_attributes.title,
            description: object_attributes.description || '',
            sourceUrl: object_attributes.url,
            targetBranch: object_attributes.target_branch,
            sourceBranch: object_attributes.source_branch,
            status: ReviewStatus.PENDING,
            reviewContent: {},
          },
        });

        this.logger.log(`✓ Created review ${review.id} for MR ${object_attributes.iid}`);

        return review;
      });

      // Queue review for AI processing
      try {
        this.logger.log(`Attempting to queue review ${result.id} for AI processing...`);

        const job = await this.reviewQueue.add('process-review', {
          reviewId: result.id,
          projectId: project.id,
          mergeRequestIid: object_attributes.iid,
        });

        this.logger.log(`✓ Successfully queued review ${result.id} with job ID: ${job.id}`);
      } catch (queueError) {
        this.logger.error(`Failed to queue review ${result.id} for processing:`, queueError);
        // Don't throw - review was created successfully, just queuing failed
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to process MR ${object_attributes.iid}:`, error);
      throw error;
    }
  }
}
