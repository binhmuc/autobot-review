import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for creating a new project
 */
export class CreateProjectDto {
  @ApiProperty({
    example: 12345678,
    description: 'GitLab project ID',
  })
  @IsNumber()
  @IsNotEmpty()
  gitlabProjectId: number;

  @ApiProperty({
    example: 'my-awesome-project',
    description: 'Project name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'my-org',
    description: 'Project namespace',
  })
  @IsString()
  @IsNotEmpty()
  namespace: string;

  @ApiProperty({
    example: 'https://hooks.example.com/gitlab/webhooks',
    description: 'Webhook URL (optional, generated if not provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  webhookUrl?: string;

  @ApiProperty({
    example: 'very_secret_token_123',
    description: 'GitLab webhook secret token',
  })
  @IsString()
  @IsNotEmpty()
  webhookSecret: string;

  @ApiProperty({
    example: true,
    description: 'Whether the project is active for code reviews',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
