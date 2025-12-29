import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

/**
 * Reviews Controller
 * Handles review queries and statistics
 * All endpoints are protected with JWT authentication
 */
@ApiTags('Reviews')
@ApiBearerAuth()
@Controller('api/reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reviews', description: 'List reviews with filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'projectId', required: false, type: String, description: 'Filter by project ID' })
  @ApiQuery({ name: 'developerId', required: false, type: String, description: 'Filter by developer ID' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Filter from date (ISO 8601)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Filter to date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('projectId') projectId?: string,
    @Query('developerId') developerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.reviewsService.findAll({
      page,
      limit,
      projectId,
      developerId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get review statistics', description: 'Aggregate statistics for reviews' })
  @ApiQuery({
    name: 'timeRange',
    required: false,
    enum: ['day', 'week', 'month', 'year'],
    description: 'Time range for statistics (default: week)',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStats(@Query('timeRange') timeRange?: 'day' | 'week' | 'month' | 'year') {
    return this.reviewsService.getStats(timeRange || 'week');
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get review timeline', description: 'Daily review trends over time' })
  @ApiQuery({ name: 'projectId', required: false, type: String, description: 'Filter by project ID' })
  @ApiQuery({ name: 'developerId', required: false, type: String, description: 'Filter by developer ID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days (default: 30)' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTimeline(
    @Query('projectId') projectId?: string,
    @Query('developerId') developerId?: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ) {
    return this.reviewsService.getTimeline({ projectId, developerId, days });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get review by ID', description: 'Retrieve a single review with code changes' })
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }
}
