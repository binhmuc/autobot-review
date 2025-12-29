import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateProjectDto, UpdateProjectDto } from './dto';

/**
 * Projects Service
 * Handles CRUD operations for GitLab projects
 */
@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { namespace: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          metrics: true,
          _count: {
            select: { reviews: true },
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        metrics: true,
        reviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            developer: {
              select: { username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    return project;
  }

  async getMetrics(id: string) {
    const metrics = await this.prisma.projectMetrics.findUnique({
      where: { projectId: id },
    });

    if (!metrics) {
      // Return default metrics if none exist yet
      return {
        projectId: id,
        totalReviews: 0,
        averageScore: 0,
        totalIssues: 0,
        totalSuggestions: 0,
        lastReviewAt: null,
      };
    }

    return metrics;
  }

  async create(dto: CreateProjectDto) {
    // Check if project with same GitLab ID already exists
    const existing = await this.prisma.project.findUnique({
      where: { gitlabProjectId: dto.gitlabProjectId },
    });

    if (existing) {
      throw new ConflictException(
        `Project with GitLab ID ${dto.gitlabProjectId} already exists`,
      );
    }

    // Create project
    const project = await this.prisma.project.create({
      data: {
        gitlabProjectId: dto.gitlabProjectId,
        name: dto.name,
        namespace: dto.namespace,
        webhookUrl: dto.webhookUrl,
        webhookSecret: dto.webhookSecret,
        isActive: dto.isActive ?? true,
      },
      include: {
        metrics: true,
      },
    });

    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    // Check if project exists
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // If updating gitlabProjectId, check for conflicts
    if (dto.gitlabProjectId && dto.gitlabProjectId !== project.gitlabProjectId) {
      const existing = await this.prisma.project.findUnique({
        where: { gitlabProjectId: dto.gitlabProjectId },
      });

      if (existing) {
        throw new ConflictException(
          `Project with GitLab ID ${dto.gitlabProjectId} already exists`,
        );
      }
    }

    // Update project
    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.gitlabProjectId && { gitlabProjectId: dto.gitlabProjectId }),
        ...(dto.name && { name: dto.name }),
        ...(dto.namespace && { namespace: dto.namespace }),
        ...(dto.webhookUrl && { webhookUrl: dto.webhookUrl }),
        ...(dto.webhookSecret && { webhookSecret: dto.webhookSecret }),
        ...(dto.isActive !== undefined && {
          isActive: dto.isActive,
        }),
      },
      include: {
        metrics: true,
      },
    });

    return updated;
  }

  async remove(id: string) {
    // Check if project exists
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Delete project (cascade will delete related records)
    await this.prisma.project.delete({
      where: { id },
    });

    return { message: 'Project deleted successfully' };
  }

  async testWebhook(id: string) {
    // Check if project exists
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // This would typically send a test webhook request to GitLab
    // For now, return mock success response
    return {
      success: true,
      message: 'Webhook test would be sent to GitLab',
      project: {
        id: project.id,
        name: project.name,
        webhookSecret: '***' + project.webhookSecret.slice(-4),
      },
    };
  }
}
