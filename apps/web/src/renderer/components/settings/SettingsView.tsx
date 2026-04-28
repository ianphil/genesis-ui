import React, { useState, useEffect } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { MarketplaceSource } from '../../../shared/types';

const ADD_ACCOUNT_VALUE = '__add-account__';

function MarketplaceSection() {
  const [sources, setSources] = useState<MarketplaceSource[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    window.electronAPI.settings.getMarketplaceSources()
      .then(setSources)
      .catch(() => {/* silently ignore */});
  }, []);

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await window.electronAPI.settings.addMarketplaceSource(url, newLabel.trim() || undefined);
      if (result.success) {
        setSources(prev => [...prev, { url, label: newLabel.trim() || undefined }]);
        setNewUrl('');
        setNewLabel('');
      } else {
        setAddError(result.error ?? 'Failed to add source');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (url: string) => {
    await window.electronAPI.settings.removeMarketplaceSource(url);
    setSources(prev => prev.filter(s => s.url !== url));
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Marketplace</h2>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {/* Default source — always present, non-removable */}
        <div className="flex items-center justify-between p-3 px-4">
          <div>
            <p className="text-sm font-medium">Genesis Minds</p>
            <p className="text-xs text-muted-foreground">ianphil/genesis-minds</p>
          </div>
          <span className="text-xs text-muted-foreground/50">default</span>
        </div>

        {sources.map((source) => (
          <div key={source.url} className="flex items-center justify-between p-3 px-4">
            <div>
              {source.label && <p className="text-sm font-medium">{source.label}</p>}
              <p className={source.label ? 'text-xs text-muted-foreground' : 'text-sm'}>{source.url}</p>
            </div>
            <button
              onClick={() => void handleRemove(source.url)}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Remove source"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {/* Add new source form */}
        <div className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground mb-3">Add a private marketplace (GitHub repo slug or HTTPS URL)</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setAddError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              placeholder="owner/repo or https://..."
              className="flex-1 min-w-0 bg-transparent border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-foreground/50 placeholder:text-muted-foreground/40 transition-colors"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-36 bg-transparent border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:border-foreground/50 placeholder:text-muted-foreground/40 transition-colors"
            />
            <button
              onClick={() => void handleAdd()}
              disabled={!newUrl.trim() || adding}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-40 hover:opacity-80 transition-opacity"
            >
              Add
            </button>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>
      </div>
    </section>
  );
}

export function SettingsView() {
  const [login, setLogin] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Array<{ login: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshAccountState = async () => {
      setError(false);
      const [status, availableAccounts] = await Promise.all([
        window.electronAPI.auth.getStatus(),
        window.electronAPI.auth.listAccounts(),
      ]);
      if (cancelled) return;
      setLogin(status.login ?? null);
      setAccounts([...availableAccounts].sort((a, b) => a.login.localeCompare(b.login)));
      setLoading(false);
    };

    refreshAccountState()
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    const unsubAccountSwitched = window.electronAPI.auth.onAccountSwitched(() => {
      void refreshAccountState().catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsubAccountSwitched();
    };
  }, []);

  const handleAccountChange = async (value: string) => {
    if (value === ADD_ACCOUNT_VALUE) {
      await window.electronAPI.auth.startLogin();
      return;
    }

    if (value === login) return;

    const previousLogin = login;
    setLogin(value);
    try {
      await window.electronAPI.auth.switchAccount(value);
    } catch {
      setLogin(previousLogin);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Account</h2>
        <div className="rounded-lg border border-border bg-card p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Unable to load account info</p>
          ) : login || accounts.length > 0 ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Signed in as</p>
                <Select value={login ?? undefined} onValueChange={(value) => { void handleAccountChange(value); }}>
                  <SelectTrigger className="mt-2 min-w-56">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.login} value={account.login}>
                        {account.login}
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value={ADD_ACCOUNT_VALUE}>+ Add Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button
                onClick={() => window.electronAPI.auth.logout()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut size={16} />
                Log out
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not signed in</p>
          )}
        </div>
      </section>

      <MarketplaceSection />
    </div>
  );
}
