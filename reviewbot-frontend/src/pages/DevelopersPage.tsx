import { useState } from 'react';
import { useDeveloperLeaderboard } from '@/hooks/api/useDevelopers';
import { User, FileCheck, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

const getBadgeConfig = (badge?: string) => {
  // Backend returns: "🏆 Gold", "🥈 Silver", "🥉 Bronze", "🎯 Contributor"
  if (!badge) {
    return { label: '🎯 Member', variant: 'secondary' as const };
  }
  if (badge.includes('Gold')) {
    return { label: badge, variant: 'default' as const };
  }
  if (badge.includes('Silver')) {
    return { label: badge, variant: 'secondary' as const };
  }
  if (badge.includes('Bronze')) {
    return { label: badge, variant: 'secondary' as const };
  }
  return { label: badge, variant: 'secondary' as const };
};

const getRankColor = (rank: number) => {
  if (rank === 1) return 'text-yellow-500 dark:text-yellow-400';
  if (rank === 2) return 'text-gray-500 dark:text-gray-400';
  if (rank === 3) return 'text-orange-500 dark:text-orange-400';
  return 'text-gray-400';
};

export default function DevelopersPage() {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('month');
  const { data: developers, isLoading, error } = useDeveloperLeaderboard(timeRange);

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Developer Leaderboard</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Track developer performance and code quality metrics
          </p>
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <div className="mt-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !developers) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
          <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Developer Leaderboard</h1>
          <div className="mt-6 rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
            <p className="text-sm text-error-600 dark:text-error-400">
              Failed to load developer leaderboard. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Developer Leaderboard</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {developers.length} {developers.length === 1 ? 'developer' : 'developers'} ranked by performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as 'week' | 'month' | 'all')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        {developers.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-dark">
            <User className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No developers</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              No developer activity in this time range
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {developers.map((developer, index) => {
              const badgeConfig = getBadgeConfig(developer.badge);
              const rank = developer.rank || index + 1;
              const rankColor = getRankColor(rank);

              return (
                <div
                  key={developer.id}
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-dark dark:hover:border-brand-700"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className={`text-3xl font-bold ${rankColor}`}>#{rank}</div>
                    </div>

                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      {developer.avatarUrl ? (
                        <img
                          src={developer.avatarUrl}
                          alt={developer.username}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-8 w-8 text-gray-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {developer.name || developer.username}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">@{developer.username}</p>
                        </div>
                        <Badge variant={badgeConfig.variant}>
                          {badgeConfig.label}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/20">
                            <FileCheck className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{developer.totalReviews}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Reviews</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-100 dark:bg-success-900/20">
                            <TrendingUp className="h-5 w-5 text-success-600 dark:text-success-400" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                              {developer.avgScore ? developer.avgScore.toFixed(1) : '0.0'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Score</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-100 dark:bg-warning-900/20">
                            <AlertTriangle className="h-5 w-5 text-warning-600 dark:text-warning-400" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{developer.totalIssues}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Issues</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                            <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{developer.totalSuggestions}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Suggestions</p>
                          </div>
                        </div>
                      </div>

                      {developer.lastReviewAt && (
                        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                          Last review: {format(parseISO(developer.lastReviewAt), 'PPp')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
