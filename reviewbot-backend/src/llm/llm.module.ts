import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { DiffProcessor } from './diff-processor';
import { IssueVerifier } from './issue-verifier.service';
import { GitLabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [GitLabModule],
  providers: [LlmService, DiffProcessor, IssueVerifier],
  exports: [LlmService, DiffProcessor, IssueVerifier],
})
export class LlmModule {}
