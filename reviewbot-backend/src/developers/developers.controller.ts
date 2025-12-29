import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevelopersService } from './developers.service';

/**
 * Developers Controller
 * Handles developer statistics and leaderboard
 * All endpoints are protected with JWT authentication
 */
@ApiTags('Developers')
@ApiBearerAuth()
@Controller('api/developers')
@UseGuards(JwtAuthGuard)
export class DevelopersController {
  constructor(private readonly developersService: DevelopersService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get developer statistics list', description: 'List of developers with their performance metrics' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of developers to return (default: 10)',
  })
  @ApiQuery({
    name: 'timeRange',
    required: false,
    enum: ['week', 'month', 'all'],
    description: 'Time range for statistics (default: month)',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDeveloperStatsList(
    @Query('limit') limit?: number,
    @Query('timeRange') timeRange?: 'week' | 'month' | 'all',
  ) {
    return this.developersService.getDeveloperStatsList(limit || 10, timeRange || 'month');
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get developer leaderboard', description: 'Top 10 developers ranked by code quality' })
  @ApiQuery({
    name: 'timeRange',
    required: false,
    enum: ['week', 'month', 'all'],
    description: 'Time range for leaderboard (default: month)',
  })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLeaderboard(@Query('timeRange') timeRange?: 'week' | 'month' | 'all') {
    return this.developersService.getLeaderboard(timeRange || 'month');
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get developer statistics', description: 'Individual developer performance metrics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDeveloperStats(@Param('id') id: string) {
    return this.developersService.getDeveloperStats(id);
  }
}
