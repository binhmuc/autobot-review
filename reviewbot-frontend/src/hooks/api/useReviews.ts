import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { Review, PaginatedResponse } from '@/types';

interface UseReviewsParams {
  page?: number;
  limit?: number;
  projectId?: string;
  developerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const useReviews = (params?: UseReviewsParams) => {
  return useQuery({
    queryKey: ['reviews', params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<Review>>('/api/reviews', { params });
      return data;
    },
  });
};

export const useReview = (id: string) => {
  return useQuery({
    queryKey: ['review', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Review>(`/api/reviews/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useReviewStats = (timeRange?: 'day' | 'week' | 'month' | 'year') => {
  return useQuery({
    queryKey: ['review-stats', timeRange],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/reviews/stats', {
        params: { timeRange },
      });
      return data;
    },
  });
};

export const useReviewTimeline = (params?: {
  projectId?: string;
  developerId?: string;
  days?: number;
}) => {
  return useQuery({
    queryKey: ['review-timeline', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/reviews/timeline', { params });
      return data;
    },
  });
};
