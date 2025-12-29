import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Reviews Service
 * Handles review queries and aggregation
 */
@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page: number;
    limit: number;
    projectId?: string;
    developerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const { page, limit, projectId, developerId, dateFrom, dateTo } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ReviewWhereInput = {};

    if (projectId) where.projectId = projectId;
    if (developerId) where.developerId = developerId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { name: true, namespace: true } },
          developer: { select: { username: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        project: {
          select: { name: true, namespace: true, webhookUrl: true },
        },
        developer: {
          select: { username: true, name: true, avatarUrl: true },
        },
        codeChanges: true,
      },
    });

    return review;
  }

  async getStats(timeRange: 'day' | 'week' | 'month' | 'year' = 'week') {
    const dateFrom = this.getDateFrom(timeRange);

    const stats = await this.prisma.review.aggregate({
      where: {
        createdAt: { gte: dateFrom },
      },
      _count: true,
      _avg: {
        qualityScore: true,
        issuesFound: true,
        suggestionsCount: true,
      },
    });

    const byStatus = await this.prisma.review.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: dateFrom },
      },
      _count: true,
    });

    // Get severity distribution from reviewContent JSON
    // Note: The actual query structure depends on your reviewContent JSON format
    const bySeverity = await this.prisma.$queryRaw<
      Array<{ severity: string; count: bigint }>
    >`
      SELECT
        jsonb_extract_path_text(issue, 'severity') as severity,
        COUNT(*) as count
      FROM review,
        jsonb_array_elements(review_content -> 'issues') as issue
      WHERE created_at >= ${dateFrom}
        AND jsonb_extract_path_text(issue, 'severity') IS NOT NULL
      GROUP BY severity
      ORDER BY count DESC
    `;

    return {
      totalReviews: stats._count,
      averageScore: Math.round((stats._avg.qualityScore || 0) * 100) / 100,
      averageIssues: Math.round((stats._avg.issuesFound || 0) * 100) / 100,
      averageSuggestions: Math.round((stats._avg.suggestionsCount || 0) * 100) / 100,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count,
      })),
      bySeverity: bySeverity.map((item) => ({
        severity: item.severity,
        count: Number(item.count),
      })),
    };
  }

  async getTimeline(params: {
    projectId?: string;
    developerId?: string;
    days?: number;
  }) {
    const { projectId, developerId, days = 30 } = params;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    // Build conditional SQL fragments
    const projectCondition = projectId
      ? Prisma.sql`AND project_id = ${projectId}`
      : Prisma.empty;
    const developerCondition = developerId
      ? Prisma.sql`AND developer_id = ${developerId}`
      : Prisma.empty;

    const timeline = await this.prisma.$queryRaw<
      Array<{
        date: Date;
        reviews: bigint;
        avgScore: number;
        totalIssues: bigint;
      }>
    >`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as reviews,
        AVG(quality_score) as "avgScore",
        SUM(issues_found) as "totalIssues"
      FROM review
      WHERE created_at >= ${dateFrom}
        ${projectCondition}
        ${developerCondition}
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    return timeline.map((item) => ({
      date: item.date,
      reviews: Number(item.reviews),
      avgScore: Math.round((item.avgScore || 0) * 100) / 100,
      totalIssues: Number(item.totalIssues),
    }));
  }

  private getDateFrom(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case 'day':
        now.setDate(now.getDate() - 1);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        break;
    }
    return now;
  }
}
