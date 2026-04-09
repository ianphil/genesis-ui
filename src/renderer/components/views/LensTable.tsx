import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

interface Props {
  data: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

function formatTitle(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatCell(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value ?? '—');
}

export function LensTable({ data, schema }: Props) {
  // Data should be an array for table view
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [data];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;

  // Derive columns from schema or first row
  const schemaProps = (schema as { items?: { properties?: Record<string, { title?: string }> } })?.items?.properties;
  const columns = schemaProps
    ? Object.keys(schemaProps)
    : Object.keys(rows[0]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>
                {schemaProps?.[col]?.title ?? formatTitle(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col}>{formatCell(row[col])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
