import { IsNotEmpty, IsNumber, IsString, IsBoolean, IsOptional, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GitLab User DTO
 */
export class GitLabUserDto {
  @IsNumber()
  id: number;

  @IsString()
  @MaxLength(255)
  username: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  avatar_url?: string;
}

/**
 * GitLab Project DTO
 */
export class GitLabProjectDto {
  @IsNumber()
  id: number;

  @IsString()
  @MaxLength(500)
  name: string;

  @IsString()
  @MaxLength(500)
  namespace: string;

  @IsString()
  @MaxLength(1000)
  web_url: string;
}

/**
 * GitLab Merge Request Object Attributes
 */
export class MergeRequestObjectAttributesDto {
  @IsNumber()
  id: number;

  @IsNumber()
  iid: number;

  @IsString()
  @MaxLength(1000)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsString()
  @MaxLength(255)
  source_branch: string;

  @IsString()
  @MaxLength(255)
  target_branch: string;

  @IsString()
  @MaxLength(1000)
  url: string;

  @IsBoolean()
  work_in_progress: boolean;

  @IsString()
  @MaxLength(50)
  state: string;

  @IsString()
  @MaxLength(50)
  action: string;
}

/**
 * GitLab Merge Request Webhook Event DTO
 */
export class MergeRequestEventDto {
  @IsString()
  @IsNotEmpty()
  object_kind: string;

  @ValidateNested()
  @Type(() => MergeRequestObjectAttributesDto)
  object_attributes: MergeRequestObjectAttributesDto;

  @ValidateNested()
  @Type(() => GitLabProjectDto)
  project: GitLabProjectDto;

  @ValidateNested()
  @Type(() => GitLabUserDto)
  user: GitLabUserDto;
}
