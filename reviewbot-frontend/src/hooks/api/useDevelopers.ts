import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';

interface LeaderboardItem {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  totalReviews: number;
  avgScore: number;
  totalIssues: number;
  totalSuggestions: number;
  lastReviewAt: string;
  rank?: number;
  badge?: string;
}

export const useDeveloperLeaderboard = (timeRange?: 'week' | 'month' | 'all') => {
  return useQuery({
    queryKey: ['developer-leaderboard', timeRange],
    queryFn: async () => {
      const { data } = await apiClient.get<LeaderboardItem[]>('/api/developers/leaderboard', {
        params: { timeRange },
      });
      return data;
    },
  });
};

export const useDeveloperStats = (id: string) => {
  return useQuery({
    queryKey: ['developer-stats', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/developers/${id}/stats`);
      return data;
    },
    enabled: !!id,
  });
};
