import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Props {
  data: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

const iconMap: Record<string, string> = {
  inbox: '📥',
  initiatives: '🎯',
  initiative: '🎯',
  domains: '🌐',
  domain: '🌐',
  calendar: '📅',
  meetings: '📅',
  teams: '💬',
  email: '📧',
  agent: '🤖',
  model: '🧠',
  extensions: '🔧',
  status: '🟢',
  mind: '🧩',
  count: '📊',
};

function getEmoji(key: string): string {
  const lower = key.toLowerCase();
  for (const [keyword, emoji] of Object.entries(iconMap)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '📋';
}

function formatTitle(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '—');
}

export function LensBriefing({ data, schema }: Props) {
  const keys = Object.keys(data);
  const schemaProps = (schema as { properties?: Record<string, { title?: string }> })?.properties;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {keys.map((key) => {
        const value = data[key];
        const label = schemaProps?.[key]?.title ?? formatTitle(key);
        const emoji = getEmoji(key);
        const isNumber = typeof value === 'number';

        return (
          <Card key={key} className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <span>{emoji}</span>
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isNumber ? (
                <p className="text-2xl font-bold">{value}</p>
              ) : (
                <p className="text-sm font-medium">{formatValue(value)}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
