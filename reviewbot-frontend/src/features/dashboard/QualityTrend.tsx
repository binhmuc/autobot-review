import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useQualityTrend } from '@/hooks/useDashboard';

const timeRanges = [
  { label: '7 Days', value: 7 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
];

export const QualityTrend = () => {
  const [selectedRange, setSelectedRange] = useState(30);
  const { data: trendData, isLoading, error } = useQualityTrend(selectedRange);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-dark">
        <div className="h-80 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (error || !trendData) {
    return (
      <div className="rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-800 dark:bg-error-900/20">
        <p className="text-sm text-error-600 dark:text-error-400">
          Failed to load quality trend data. Please try again.
        </p>
      </div>
    );
  }

  const chartData = trendData?.map((item) => ({
    date: format(parseISO(item?.date || new Date().toISOString()), 'MMM dd'),
    score: item?.score ?? 0,
    reviews: item?.reviewCount ?? 0,
  })) || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-dark">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Quality Trend</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Average code quality score over time
          </p>
        </div>
        <div className="flex gap-2">
          {timeRanges.map((range) => (
            <button
              key={range.value}
              onClick={() => setSelectedRange(range.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                selectedRange === range.value
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            className="dark:stroke-gray-500"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            stroke="#6b7280"
            className="dark:stroke-gray-500"
            tick={{ fontSize: 12 }}
            domain={[0, 100]}
            label={{ value: 'Quality Score', angle: -90, position: 'insideLeft', fontSize: 12 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#6b7280"
            className="dark:stroke-gray-500"
            tick={{ fontSize: 12 }}
            label={{ value: 'Review Count', angle: 90, position: 'insideRight', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name="Quality Score"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="reviews"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name="Review Count"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
