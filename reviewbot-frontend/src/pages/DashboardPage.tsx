import { MetricsOverview } from '@/features/dashboard/MetricsOverview';
import { QualityTrend } from '@/features/dashboard/QualityTrend';
import { DeveloperLeaderboard } from '@/features/dashboard/DeveloperLeaderboard';
import { RecentReviews } from '@/features/dashboard/RecentReviews';

export default function DashboardPage() {
  return (
    <div className="py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Overview of code review metrics and team performance
        </p>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="space-y-6 py-6">
          {/* Metrics Overview */}
          <MetricsOverview />

          {/* Quality Trend Chart */}
          <QualityTrend />

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Developer Leaderboard */}
            <DeveloperLeaderboard />

            {/* Recent Reviews */}
            <RecentReviews />
          </div>
        </div>
      </div>
    </div>
  );
}
