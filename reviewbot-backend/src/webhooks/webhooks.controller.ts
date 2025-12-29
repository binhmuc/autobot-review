import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { GitLabWebhookGuard } from '../common/guards/gitlab-webhook.guard';
import { MergeRequestEventDto } from './dto/merge-request-event.dto';

/**
 * Webhooks Controller
 * Handles incoming GitLab webhook requests
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * GitLab webhook endpoint
   * Receives and processes merge request events
   * @param token GitLab webhook token (validated by guard)
   * @param event GitLab event type
   * @param payload Webhook payload
   * @returns Processing result
   */
  @Post('gitlab')
  @HttpCode(200)
  @UseGuards(GitLabWebhookGuard)
  async handleGitLabWebhook(
    @Headers('x-gitlab-token') token: string,
    @Headers('x-gitlab-event') event: string,
    @Body() payload: any,
  ) {
    console.log('payload', payload);
    this.logger.log(`Received GitLab webhook: ${event}`);

    // Only process Merge Request events
    if (event !== 'Merge Request Hook') {
      this.logger.log(`Ignoring non-MR event: ${event}`);
      return {
        success: true,
        message: 'Event type not processed',
        event,
      };
    }

    // Validate payload structure
    if (!payload.object_attributes || !payload.project || !payload.user) {
      throw new BadRequestException('Invalid webhook payload structure');
    }

    try {
      const result = await this.webhooksService.processMergeRequest(payload);

      if (!result) {
        return {
          success: true,
          message: 'Merge request skipped (draft or closed)',
          mergeRequestIid: payload.object_attributes.iid,
        };
      }

      return {
        success: true,
        message: 'Webhook processed successfully',
        reviewId: result.id,
        mergeRequestIid: result.mergeRequestIid,
        status: result.status,
      };
    } catch (error) {
      this.logger.error('Failed to process webhook:', error);
      throw error;
    }
  }

  /**
   * Health check endpoint for webhook
   * @returns Health status
   */
  @Post('gitlab/health')
  @HttpCode(200)
  async healthCheck() {
    return {
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
