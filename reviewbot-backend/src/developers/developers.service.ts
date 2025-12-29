import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Developers Service
 * Handles developer statistics and leaderboard
 */
@Injectable()
export class DevelopersService {
  constructor(private prisma: PrismaService) {}

  async getDeveloperStatsList(limit: number = 10, timeRange: 'week' | 'month' | 'all' = 'month') {
    const dateFrom = this.getDateFrom(timeRange);

    // Build conditional SQL for time range
    const timeCondition =
      timeRange !== 'all'
        ? Prisma.sql`WHERE r.created_at >= ${dateFrom}`
        : Prisma.empty;

    const developers = await this.prisma.$queryRaw<
      Array<{
        id: string;
        username: string;
        name: string;
        avatarUrl: string;
        totalReviews: bigint;
        avgScore: number;
        totalIssues: bigint;
        totalSuggestions: bigint;
        lastReviewAt: Date;
      }>
    >`
      SELECT
        d.id,
        d.username,
        d.name,
        d.avatar_url as "avatarUrl",
        COUNT(r.id) as "totalReviews",
        AVG(r.quality_score) as "avgScore",
        SUM(r.issues_found) as "totalIssues",
        SUM(r.suggestions_count) as "totalSuggestions",
        MAX(r.created_at) as "lastReviewAt"
      FROM developer d
      LEFT JOIN review r ON d.id = r.developer_id
      ${timeCondition}
      GROUP BY d.id, d.username, d.name, d.avatar_url
      HAVING COUNT(r.id) > 0
      ORDER BY d.username ASC
      LIMIT ${limit}
    `;

    return developers.map((dev) => ({
      id: dev.id,
      username: dev.username,
      name: dev.name,
      avatarUrl: dev.avatarUrl,
      totalReviews: Number(dev.totalReviews),
      avgScore: Math.round((dev.avgScore || 0) * 100) / 100,
      totalIssues: Number(dev.totalIssues),
      totalSuggestions: Number(dev.totalSuggestions),
      lastReviewAt: dev.lastReviewAt,
    }));
  }

  async getLeaderboard(timeRange: 'week' | 'month' | 'all' = 'month') {
    const dateFrom = this.getDateFrom(timeRange);

    // Build conditional SQL for time range
    const timeCondition =
      timeRange !== 'all'
        ? Prisma.sql`WHERE r.created_at >= ${dateFrom}`
        : Prisma.empty;

    const developers = await this.prisma.$queryRaw<
      Array<{
        id: string;
        username: string;
        name: string;
        avatarUrl: string;
        totalReviews: bigint;
        avgScore: number;
        totalIssues: bigint;
        totalSuggestions: bigint;
        lastReviewAt: Date;
      }>
    >`
      SELECT
        d.id,
        d.username,
        d.name,
        d.avatar_url as "avatarUrl",
        COUNT(r.id) as "totalReviews",
        AVG(r.quality_score) as "avgScore",
        SUM(r.issues_found) as "totalIssues",
        SUM(r.suggestions_count) as "totalSuggestions",
        MAX(r.created_at) as "lastReviewAt"
      FROM developer d
      LEFT JOIN review r ON d.id = r.developer_id
      ${timeCondition}
      GROUP BY d.id, d.username, d.name, d.avatar_url
      HAVING COUNT(r.id) > 0
      ORDER BY "avgScore" DESC, "totalReviews" DESC
      LIMIT 10
    `;

    return developers.map((dev, index) => ({
      id: dev.id,
      username: dev.username,
      name: dev.name,
      avatarUrl: dev.avatarUrl,
      totalReviews: Number(dev.totalReviews),
      avgScore: Math.round((dev.avgScore || 0) * 100) / 100,
      totalIssues: Number(dev.totalIssues),
      totalSuggestions: Number(dev.totalSuggestions),
      lastReviewAt: dev.lastReviewAt,
      rank: index + 1,
      badge: this.getBadge(dev.avgScore || 0),
    }));
  }

  async getDeveloperStats(id: string) {
    const [metrics, recentReviews, commonIssues] = await Promise.all([
      this.prisma.developerMetrics.findUnique({
        where: { developerId: id },
      }),
      this.prisma.review.findMany({
        where: { developerId: id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          qualityScore: true,
          createdAt: true,
          project: {
            select: { name: true },
          },
        },
      }),
      this.getCommonIssues(id),
    ]);

    return {
      metrics: metrics || {
        developerId: id,
        totalReviews: 0,
        averageScore: 0,
        totalIssues: 0,
        improvementRate: 0,
      },
      recentReviews,
      commonIssues,
    };
  }

  private async getCommonIssues(developerId: string) {
    const issues = await this.prisma.$queryRaw<
      Array<{
        type: string;
        count: bigint;
      }>
    >`
      SELECT
        jsonb_extract_path_text(issue, 'type') as type,
        COUNT(*) as count
      FROM review,
        jsonb_array_elements(review_content -> 'issues') as issue
      WHERE developer_id = ${developerId}
        AND jsonb_extract_path_text(issue, 'type') IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
      LIMIT 5
    `;

    return issues.map((issue) => ({
      type: issue.type,
      count: Number(issue.count),
    }));
  }

  private getBadge(score: number): string {
    if (score >= 90) return '🏆 Gold';
    if (score >= 75) return '🥈 Silver';
    if (score >= 60) return '🥉 Bronze';
    return '🎯 Contributor';
  }

  private getDateFrom(timeRange: string): Date {
    const now = new Date();
    if (timeRange === 'week') {
      now.setDate(now.getDate() - 7);
    } else if (timeRange === 'month') {
      now.setMonth(now.getMonth() - 1);
    }
    return now;
  }
}
