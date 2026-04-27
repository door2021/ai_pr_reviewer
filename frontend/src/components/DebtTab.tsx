import { useEffect, useState } from 'react';
import { debtAPI } from '@/lib/api';
import {
  AlertTriangle, CheckCircle, RefreshCw, Loader2,
  TrendingUp, ShieldAlert, Layers, ChevronRight,
} from 'lucide-react';

interface DebtSummary {
  repo_name: string;
  debt_score: number;
  total_items: number;
  by_type: Record<string, number>;
  by_severity: { high: number; medium: number; low: number };
  trend: { week: string; count: number }[];
  worst_files: { file: string; count: number }[];
  recent_items: {
    id: number;
    debt_type: string;
    severity: string;
    description: string;
    suggestion: string;
    pr_number: number | null;
    created_at: string;
  }[];
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  missing_tests:           'Missing Tests',
  missing_error_handling:  'Missing Error Handling',
  complexity:              'Complexity',
  hardcoded_values:        'Hardcoded Values',
  security:                'Security',
  dead_code:               'Dead Code',
  duplication:             'Duplication',
  outdated_patterns:       'Outdated Patterns',
  other:                   'Other',
};

function severityColor(s: string) {
  if (s === 'high')   return 'text-red-400';
  if (s === 'medium') return 'text-yellow-400';
  return 'text-blue-400';
}

function severityBg(s: string) {
  if (s === 'high')   return 'bg-red-500/10 border-red-500/20';
  if (s === 'medium') return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-blue-500/10 border-blue-500/20';
}

function scoreColor(score: number) {
  if (score <= 20) return 'text-emerald-400';
  if (score <= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreLabel(score: number) {
  if (score <= 20) return 'Healthy';
  if (score <= 50) return 'Moderate';
  if (score <= 75) return 'High Debt';
  return 'Critical';
}

function TrendChart({ trend }: { trend: { week: string; count: number }[] }) {
  const max = Math.max(...trend.map(t => t.count), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {trend.map((t, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-sm bg-primary/40 transition-all"
            style={{ height: `${Math.max(4, (t.count / max) * 52)}px` }}
            title={`${t.week}: ${t.count} items`}
          />
          {i % 3 === 0 && (
            <span className="text-[9px] text-text-muted rotate-0 leading-none">{t.week.split(' ')[0]}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DebtTab({ repoId }: { repoId: number }) {
  const [data, setData]       = useState<DebtSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [resolving, setResolving] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await debtAPI.getSummary(repoId);
      setData(res);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load debt data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [repoId]);

  const handleResolve = async (itemId: number) => {
    setResolving(itemId);
    try {
      await debtAPI.resolveItem(repoId, itemId);
      setData(prev => prev ? {
        ...prev,
        recent_items: prev.recent_items.filter(i => i.id !== itemId),
        total_items: prev.total_items - 1,
      } : prev);
    } catch {
      // silent
    } finally {
      setResolving(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-3">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-text-muted text-sm">Loading debt analysis…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
      <AlertTriangle className="w-8 h-8 text-yellow-400" />
      <p className="text-text-muted text-sm">{error}</p>
      <button onClick={load} className="text-primary text-sm hover:underline">Try again</button>
    </div>
  );

  if (!data) return null;

  const hasDebt = data.total_items > 0;

  return (
    <div className="space-y-4 p-4 overflow-y-auto h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Technical Debt</h2>
          <p className="text-xs text-text-muted">Last 90 days · {data.repo_name}</p>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-text transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── No debt state ── */}
      {!hasDebt && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-white font-medium">No debt detected</p>
          <p className="text-text-muted text-xs max-w-xs">
            Run AI reviews on merged PRs to start tracking technical debt across your codebase.
          </p>
        </div>
      )}

      {hasDebt && (
        <>
          {/* ── Score + severity row ── */}
          <div className="grid grid-cols-4 gap-2">
            {/* Debt score */}
            <div className="col-span-1 bg-surface/60 border border-border rounded-xl p-3 flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${scoreColor(data.debt_score)}`}>
                {data.debt_score}
              </span>
              <span className="text-xs text-text-muted mt-0.5">Debt Score</span>
              <span className={`text-xs font-medium mt-0.5 ${scoreColor(data.debt_score)}`}>
                {scoreLabel(data.debt_score)}
              </span>
            </div>

            {/* Severity breakdown */}
            {(['high', 'medium', 'low'] as const).map(s => (
              <div key={s} className={`bg-surface/60 border rounded-xl p-3 flex flex-col items-center justify-center ${severityBg(s)}`}>
                <span className={`text-xl font-bold ${severityColor(s)}`}>
                  {data.by_severity[s] || 0}
                </span>
                <span className="text-xs text-text-muted mt-0.5 capitalize">{s}</span>
              </div>
            ))}
          </div>

          {/* ── Trend chart ── */}
          {data.trend.some(t => t.count > 0) && (
            <div className="bg-surface/60 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-text">Debt trend — last 12 weeks</span>
              </div>
              <TrendChart trend={data.trend} />
            </div>
          )}

          {/* ── By type ── */}
          {Object.keys(data.by_type).length > 0 && (
            <div className="bg-surface/60 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-text">By category</span>
              </div>
              <div className="space-y-2">
                {Object.entries(data.by_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const max = Math.max(...Object.values(data.by_type));
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <span className="text-xs text-text-muted w-36 truncate flex-shrink-0">
                          {DEBT_TYPE_LABELS[type] || type}
                        </span>
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${(count / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-text-muted w-5 text-right flex-shrink-0">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Worst files ── */}
          {data.worst_files.length > 0 && (
            <div className="bg-surface/60 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-medium text-text">Most affected files</span>
              </div>
              <div className="space-y-1.5">
                {data.worst_files.map(({ file, count }) => (
                  <div key={file} className="flex items-center gap-2">
                    <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                    <span className="text-xs text-text flex-1 truncate font-mono">{file}</span>
                    <span className="text-xs text-yellow-400 font-semibold flex-shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent items ── */}
          {data.recent_items.length > 0 && (
            <div className="bg-surface/60 border border-border rounded-xl p-3">
              <p className="text-xs font-medium text-text mb-3">Recent debt items</p>
              <div className="space-y-2">
                {data.recent_items.map(item => (
                  <div key={item.id} className={`p-2.5 rounded-lg border text-xs ${severityBg(item.severity)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`font-bold uppercase flex-shrink-0 ${severityColor(item.severity)}`}>
                            {item.severity}
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className="text-text-muted truncate">
                            {DEBT_TYPE_LABELS[item.debt_type] || item.debt_type}
                          </span>
                          {item.pr_number && (
                            <span className="text-text-muted ml-auto flex-shrink-0">PR #{item.pr_number}</span>
                          )}
                        </div>
                        <p className="text-text">{item.description}</p>
                        {item.suggestion && (
                          <p className="text-text-muted mt-0.5">→ {item.suggestion}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleResolve(item.id)}
                        disabled={resolving === item.id}
                        className="flex-shrink-0 p-1 rounded hover:bg-emerald-500/20 text-text-muted hover:text-emerald-400 transition-colors"
                        title="Mark as resolved"
                      >
                        {resolving === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircle className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}