import { useState } from 'react';
import { useProjects } from '@/hooks/api/useProjects';
import { FolderOpen, ExternalLink, TrendingUp, FileCheck, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ProjectsPage() {
  const [page, setPage] = useState(1);
  const { data: projectsData, isLoading, error } = useProjects({ page, limit: 10 });

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Projects</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Manage GitLab projects tracked by ReviewBot
          </p>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <div className="mt-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !projectsData) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Projects</h1>
          <div className="mt-6 rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
            <p className="text-sm text-error-600 dark:text-error-400">
              Failed to load projects. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { data: projects, meta } = projectsData;

  return (
    <div className="py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Projects</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {meta.total} GitLab {meta.total === 1 ? 'project' : 'projects'} tracked
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        {projects.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-dark">
            <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No projects</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Set up GitLab webhooks to start tracking projects
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-dark dark:hover:border-brand-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/20">
                        <FolderOpen className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {project.namespace}/{project.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          GitLab Project ID: {project.gitlabProjectId}
                        </p>
                      </div>
                    </div>

                    {project.metrics && (
                      <div className="mt-4 flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-brand-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{project.metrics.totalReviews}</span> reviews
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-success-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Avg score: <span className="font-semibold">{project.metrics.averageScore.toFixed(1)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-warning-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-semibold">{project.metrics.totalIssues}</span> issues
                          </span>
                        </div>
                        {project.metrics.lastReviewAt && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            Last review: {new Date(project.metrics.lastReviewAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex flex-col items-end gap-2">
                    <Badge variant={project.isActive ? 'success' : 'secondary'}>
                      {project.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <a
                      href={`https://gitlab.com/${project.namespace}/${project.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {((page - 1) * meta.limit) + 1} to {Math.min(page * meta.limit, meta.total)} of{' '}
              {meta.total} projects
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
