import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

/**
 * Projects Controller
 * Handles CRUD operations for GitLab projects
 * All endpoints are protected with JWT authentication
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('api/projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all projects', description: 'List all projects with pagination and search' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by project name or namespace' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.projectsService.findAll({ page, limit, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID', description: 'Retrieve a single project with metrics and recent reviews' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get project metrics', description: 'Retrieve metrics for a specific project' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMetrics(@Param('id') id: string) {
    return this.projectsService.getMetrics(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create project', description: 'Register a new GitLab project for code review' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 409, description: 'Project with same GitLab ID already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project', description: 'Update project settings and configuration' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 409, description: 'Project with same GitLab ID already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project', description: 'Remove project and all associated reviews' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }

  @Post(':id/webhook/test')
  @ApiOperation({ summary: 'Test webhook', description: 'Test webhook configuration for a project' })
  @ApiResponse({ status: 200, description: 'Webhook test initiated' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async testWebhook(@Param('id') id: string) {
    return this.projectsService.testWebhook(id);
  }
}
