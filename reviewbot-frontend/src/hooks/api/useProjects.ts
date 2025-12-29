import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { Project, PaginatedResponse, CreateProjectDto, UpdateProjectDto, ProjectMetrics } from '@/types';

interface UseProjectsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const useProjects = (params?: UseProjectsParams) => {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<Project>>('/api/projects', { params });
      return data;
    },
  });
};

export const useProject = (id: string) => {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data } = await apiClient.get<Project>(`/api/projects/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useProjectMetrics = (id: string) => {
  return useQuery({
    queryKey: ['project-metrics', id],
    queryFn: async () => {
      const { data } = await apiClient.get<ProjectMetrics>(`/api/projects/${id}/metrics`);
      return data;
    },
    enabled: !!id,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (project: CreateProjectDto) => {
      const { data } = await apiClient.post<Project>('/api/projects', project);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, project }: { id: string; project: UpdateProjectDto }) => {
      const { data } = await apiClient.put<Project>(`/api/projects/${id}`, project);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', variables.id] });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};
