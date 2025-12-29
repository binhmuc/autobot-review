import { Medal, TrendingUp, FileCheck, AlertTriangle } from 'lucide-react';
import { useDeveloperStats } from '@/hooks/useDashboard';
import { format, parseISO } from 'date-fns';

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Medal className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">#{rank}</span>;
};

export const DeveloperLeaderboard = () => {
  const { data: developerStats, isLoading, error } = useDeveloperStats(10);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-dark">
        <div className="h-96 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !developerStats) {
    return (
      <div className="rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
        <p className="text-sm text-error-600 dark:text-error-400">
          Failed to load developer leaderboard. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-dark">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Developer Leaderboard
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Top performers by code quality score
        </p>
      </div>

      <div className="space-y-4">
        {developerStats?.map((stat, index) => stat ? (
          <div
            key={stat?.id || index}
            className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 transition hover:border-brand-300 dark:border-gray-800 dark:hover:border-brand-700"
          >
            <div className="flex h-10 w-10 items-center justify-center">
              {getRankIcon(index + 1)}
            </div>

            <div className="flex items-center gap-3 flex-1">
              {stat?.avatarUrl ? (
                <img
                  src={stat?.avatarUrl}
                  alt={stat?.username || 'Developer'}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/20">
                  <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
                    {stat?.username?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {stat?.name || stat?.username || 'Unknown'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  @{stat?.username || 'unknown'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="flex items-center gap-1 text-success-500">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-lg font-semibold">{(stat?.avgScore ?? 0).toFixed(1)}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Score</p>
              </div>

              <div className="text-center">
                <div className="flex items-center gap-1 text-brand-500">
                  <FileCheck className="h-4 w-4" />
                  <span className="text-sm font-semibold">{stat?.totalReviews ?? 0}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reviews</p>
              </div>

              <div className="text-center">
                <div className="flex items-center gap-1 text-warning-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-semibold">{stat?.totalIssues ?? 0}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Issues</p>
              </div>
            </div>

            {stat?.lastReviewAt && (
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Last review</p>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {format(parseISO(stat.lastReviewAt), 'MMM dd, yyyy')}
                </p>
              </div>
            )}
          </div>
        ) : null)}
      </div>
    </div>
  );
};
