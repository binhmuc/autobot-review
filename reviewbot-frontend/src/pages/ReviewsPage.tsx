import { useState } from 'react';
import { useReviews } from '@/hooks/api/useReviews';
import { GitMerge, ExternalLink, AlertCircle, CheckCircle, Clock, XCircle, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ReviewStatus } from '@/types';

const getStatusConfig = (status: ReviewStatus) => {
  switch (status) {
    case 'COMPLETED':
      return { icon: <CheckCircle className="h-4 w-4" />, label: 'Completed', variant: 'success' as const };
    case 'PROCESSING':
      return { icon: <Clock className="h-4 w-4" />, label: 'Processing', variant: 'warning' as const };
    case 'PENDING':
      return { icon: <Clock className="h-4 w-4" />, label: 'Pending', variant: 'default' as const };
    case 'FAILED':
      return { icon: <XCircle className="h-4 w-4" />, label: 'Failed', variant: 'destructive' as const };
    case 'SKIPPED':
      return { icon: <AlertCircle className="h-4 w-4" />, label: 'Skipped', variant: 'secondary' as const };
  }
};

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | ''>('');
  const { data: reviewsData, isLoading, error } = useReviews({ page, limit: 20, ...(statusFilter && { status: statusFilter }) });

  if (isLoading) return <div className="py-6"><div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8"><h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Code Reviews</h1><div className="mt-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />)}</div></div></div>;
  if (error || !reviewsData) return <div className="py-6"><div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8"><h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Code Reviews</h1><div className="mt-6 rounded-xl border border-error-200 bg-error-50 p-6"><p className="text-sm text-error-600">Failed to load reviews</p></div></div></div>;

  const { data: reviews, meta } = reviewsData;

  return (
    <div className="py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <div className="flex items-center justify-between">
          <div><h1 className="text-title-lg font-semibold text-gray-900 dark:text-white">Code Reviews</h1><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{meta.total} reviews</p></div>
          <div className="flex items-center gap-2"><Filter className="h-5 w-5 text-gray-400" /><select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as ReviewStatus | ''); setPage(1); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"><option value="">All Status</option><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="SKIPPED">Skipped</option></select></div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        {reviews.length === 0 ? <div className="mt-6 rounded-xl border p-12 text-center"><GitMerge className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-2 text-sm font-semibold">No reviews</h3></div> : <div className="mt-6 space-y-4">{reviews.map(review => { const statusConfig = getStatusConfig(review.status); return <div key={review.id} className="rounded-xl border p-6"><div className="flex gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/20"><GitMerge className="h-6 w-6 text-brand-600" /></div><div className="flex-1 min-w-0"><div className="flex justify-between gap-2"><div className="flex-1 min-w-0"><h3 className="font-semibold truncate">{review.title}</h3><div className="mt-1 flex gap-2 text-sm text-gray-500">{review.project && <span>{review.project.namespace}/{review.project.name}</span>}<span>!{review.mergeRequestIid}</span></div></div><a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-500"><ExternalLink className="h-5 w-5" /></a></div><div className="mt-4 flex gap-3"><Badge variant={statusConfig.variant}><div className="flex items-center gap-1">{statusConfig.icon}{statusConfig.label}</div></Badge>{review.qualityScore !== null && review.qualityScore !== undefined && <span className="text-sm">Score: {review.qualityScore.toFixed(1)}</span>}{review.issuesFound > 0 && <span className="text-sm">{review.issuesFound} issues</span>}</div></div></div></div>; })}</div>}
        {meta.totalPages > 1 && <div className="mt-6 flex justify-between"><p className="text-sm text-gray-500">Showing {((page-1)*meta.limit)+1} to {Math.min(page*meta.limit,meta.total)} of {meta.total}</p><div className="flex gap-2"><button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Previous</button><button onClick={() => setPage(p => Math.min(meta.totalPages,p+1))} disabled={page===meta.totalPages} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Next</button></div></div>}
      </div>
    </div>
  );
}
