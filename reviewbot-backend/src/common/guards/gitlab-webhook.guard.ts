import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * GitLab Webhook Guard
 * Validates incoming webhook requests using X-Gitlab-Token header
 * Uses constant-time comparison to prevent timing attacks
 */
@Injectable()
export class GitLabWebhookGuard implements CanActivate {
  private readonly logger = new Logger(GitLabWebhookGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-gitlab-token'];

    if (!token) {
      this.logger.warn('Webhook request missing X-Gitlab-Token header');
      throw new UnauthorizedException('Missing GitLab token');
    }

    const expectedToken = this.configService.get<string>('GITLAB_WEBHOOK_SECRET');

    if (!expectedToken) {
      this.logger.error('GITLAB_WEBHOOK_SECRET not configured in environment');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // Constant-time comparison to prevent timing attacks
    // Pad tokens to same length to prevent length leakage
    const maxLen = Math.max(token.length, expectedToken.length);
    const tokenBuf = Buffer.alloc(maxLen);
    const expectedBuf = Buffer.alloc(maxLen);

    tokenBuf.write(token);
    expectedBuf.write(expectedToken);

    const isValid = crypto.timingSafeEqual(tokenBuf, expectedBuf) && token.length === expectedToken.length;

    if (!isValid) {
      this.logger.warn('Invalid GitLab webhook token');
      throw new UnauthorizedException('Invalid GitLab token');
    }

    this.logger.debug('GitLab webhook token validated successfully');
    return true;
  }
}
