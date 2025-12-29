export interface User {
  username: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Project {
  id: string;
  gitlabProjectId: number;
  name: string;
  namespace: string;
  webhookUrl?: string;
  webhookSecret: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metrics?: ProjectMetrics;
  _count?: {
    reviews: number;
  };
}

export interface ProjectMetrics {
  id: string;
  projectId: string;
  totalReviews: number;
  averageScore: number;
  totalIssues: number;
  totalSuggestions: number;
  lastReviewAt: string | null;
  updatedAt: string;
}

export interface Review {
  id: string;
  mergeRequestId: number;
  mergeRequestIid: number;
  projectId: string;
  developerId: string;
  title: string;
  description?: string;
  reviewContent: unknown;
  qualityScore?: number;
  issuesFound: number;
  suggestionsCount: number;
  status: ReviewStatus;
  sourceUrl: string;
  targetBranch: string;
  sourceBranch: string;
  createdAt: string;
  updatedAt: string;
  project?: {
    name: string;
    namespace: string;
  };
  developer?: {
    username: string;
    avatarUrl?: string;
  };
}

export type ReviewStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface Developer {
  id: string;
  gitlabUserId: number;
  username: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateProjectDto {
  gitlabProjectId: number;
  name: string;
  namespace: string;
  webhookUrl?: string;
  webhookSecret: string;
  isActive?: boolean;
}

export interface UpdateProjectDto {
  gitlabProjectId?: number;
  name?: string;
  namespace?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  isActive?: boolean;
}

export interface DashboardStats {
  totalReviews: number;
  averageScore: number;
  averageIssues: number;
  averageSuggestions: number;
  bySeverity: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    count: number;
  }>;
  byStatus: Array<{
    status: ReviewStatus;
    count: number;
  }>;
}

export interface QualityTrendData {
  date: string;
  score: number;
  reviewCount: number;
}

export interface DeveloperStats {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  totalReviews: number;
  avgScore: number;
  totalIssues: number;
  lastReviewAt: string | null;
}
