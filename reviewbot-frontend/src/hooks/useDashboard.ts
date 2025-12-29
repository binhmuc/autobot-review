import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { DashboardStats, QualityTrendData, DeveloperStats } from '@/types';

export const useDashboardStats = (timeRange: 'day' | 'week' | 'month' | 'year' = 'week') => {
  return useQuery({
    queryKey: ['dashboardStats', timeRange],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardStats>('/api/reviews/stats', {
        params: { timeRange },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useQualityTrend = (days: number = 30) => {
  return useQuery({
    queryKey: ['qualityTrend', days],
    queryFn: async () => {
      const { data } = await apiClient.get<QualityTrendData[]>('/api/reviews/quality-trend', {
        params: { days },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useDeveloperStats = (limit: number = 10) => {
  return useQuery({
    queryKey: ['developerStats', limit],
    queryFn: async () => {
      const { data } = await apiClient.get<DeveloperStats[]>('/api/developers/stats', {
        params: { limit },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
