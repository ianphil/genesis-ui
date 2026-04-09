import React, { useState, useEffect, useCallback } from 'react';
import type { LensViewManifest } from '../../../shared/types';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { LensBriefing } from './LensBriefing';
import { LensTable } from './LensTable';

interface Props {
  view: LensViewManifest;
}

export function LensViewRenderer({ view }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const result = await window.electronAPI.lens.getViewData(view.id);
        setData(result);
      } catch (err) {
        console.error(`[LensView] Failed to load data for ${view.id}:`, err);
      }
    };
    load();
  }, [view.id]);

  const handleRefresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.lens.refreshView(view.id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  }, [view.id, loading]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{view.name}</h2>
            <p className="text-sm text-muted-foreground">{view.view} view</p>
          </div>
          {view.prompt && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
                'bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground',
                loading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Content */}
        {data ? (
          <LensViewContent view={view} data={data} />
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {view.prompt ? 'No data yet. Click Refresh to populate.' : 'No data available.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LensViewContent({ view, data }: { view: LensViewManifest; data: Record<string, unknown> }) {
  switch (view.view) {
    case 'briefing':
      return <LensBriefing data={data} schema={view.schema} />;
    case 'table':
      return <LensTable data={data} schema={view.schema} />;
    case 'form':
    default:
      return <LensFormContent data={data} schema={view.schema} />;
  }
}

function LensFormContent({ data, schema }: { data: Record<string, unknown>; schema?: Record<string, unknown> }) {
  const schemaProps = (schema as { properties?: Record<string, { title?: string }> })?.properties;
  // Use data keys as source of truth, fall back to schema for labels
  const keys = Object.keys(data);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {keys.map((key) => {
        const value = data[key];
        const label = schemaProps?.[key]?.title ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const displayValue = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object' && value !== null
            ? JSON.stringify(value, null, 2)
            : String(value ?? '—');

        return (
          <div key={key} className="flex justify-between items-start text-sm gap-4">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className="font-medium text-right break-words min-w-0">{displayValue}</span>
          </div>
        );
      })}
    </div>
  );
}
