import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';

/**
 * DTO for querying reviews with filters
 */
export class ReviewQueryDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter by project ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'Filter by developer ID',
    required: false,
  })
  @IsString()
  @IsOptional()
  developerId?: string;

  @ApiProperty({
    example: '2025-01-01T00:00:00Z',
    description: 'Filter reviews from this date',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiProperty({
    example: '2025-12-31T23:59:59Z',
    description: 'Filter reviews until this date',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

/**
 * DTO for time range query
 */
export class TimeRangeDto {
  @ApiProperty({
    example: 'week',
    description: 'Time range for statistics',
    enum: ['day', 'week', 'month', 'year'],
    required: false,
  })
  @IsEnum(['day', 'week', 'month', 'year'])
  @IsOptional()
  timeRange?: 'day' | 'week' | 'month' | 'year';
}
