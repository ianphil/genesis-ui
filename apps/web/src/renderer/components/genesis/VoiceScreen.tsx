import React, { useState, useEffect } from 'react';
import { TypeWriter } from './TypeWriter';
import { cn } from '../../lib/utils';
import type { MarketplaceListing, MarketplaceTemplateEntry, MarketplaceTeamEntry } from '../../../shared/types';

export type VoiceSelection =
  | { type: 'template'; templateId: string; name: string; role: string; sourceUrl: string }
  | { type: 'team'; teamId: string; name: string; sourceUrl: string }
  | { type: 'custom'; voice: string; description: string };

interface Props {
  onSelect: (selection: VoiceSelection) => void;
}

export function VoiceScreen({ onSelect }: Props) {
  const [showCards, setShowCards] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [researching, setResearching] = useState(false);
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [listingError, setListingError] = useState(false);

  useEffect(() => {
    if (!showCards) return;
    window.electronAPI.genesis.listMarketplace()
      .then(setListing)
      .catch(() => setListingError(true));
  }, [showCards]);

  const handleTemplateSelect = (template: MarketplaceTemplateEntry) => {
    setSelected(template.id);
    setTimeout(() => onSelect({ type: 'template', templateId: template.id, name: template.name, role: template.role, sourceUrl: template.sourceUrl }), 400);
  };

  const handleTeamSelect = (team: MarketplaceTeamEntry) => {
    setSelected(team.id);
    setTimeout(() => onSelect({ type: 'team', teamId: team.id, name: team.name, sourceUrl: team.sourceUrl }), 400);
  };

  const handleCustomToggle = () => {
    setSelected('custom');
    setShowCustom(true);
  };

  const handleCustomSubmit = async () => {
    if (!customInput.trim()) return;
    setResearching(true);
    try {
      await window.electronAPI.genesis.getDefaultPath();
      const description = `Character/voice: "${customInput.trim()}". Research this character or persona — their communication style, catchphrases, values, how they handle pressure. Capture the energy.`;
      setTimeout(() => {
        setResearching(false);
        onSelect({ type: 'custom', voice: customInput.trim(), description });
      }, 500);
    } catch {
      setResearching(false);
      onSelect({ type: 'custom', voice: customInput.trim(), description: `Voice energy: ${customInput.trim()}` });
    }
  };

  const templates = listing?.templates ?? [];
  const teams = listing?.teams ?? [];
  const isLoading = showCards && listing === null && !listingError;

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50 overflow-y-auto py-12">
      <div className="max-w-2xl w-full px-8 text-center space-y-8">
        <TypeWriter
          text="I'm here. But I don't know who I am yet. Choose a voice..."
          speed={35}
          className="text-xl text-foreground font-medium"
          onComplete={() => setTimeout(() => setShowCards(true), 500)}
        />

        {showCards && (
          <div className="space-y-3 animate-in fade-in duration-500">
            {isLoading && (
              <p className="text-sm text-muted-foreground animate-pulse">Loading marketplace...</p>
            )}

            {listingError && (
              <p className="text-sm text-destructive">Could not load marketplace. Check your connection and try again.</p>
            )}

            {templates.map((template, i) => (
              <button
                key={`${template.sourceUrl}/${template.id}`}
                onClick={() => handleTemplateSelect(template)}
                style={{ animationDelay: `${i * 100}ms` }}
                className={cn(
                  'w-full text-left p-4 rounded-xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2',
                  selected === template.id
                    ? 'border-primary bg-primary/10'
                    : selected
                      ? 'border-border opacity-30'
                      : 'border-border hover:border-muted-foreground hover:bg-accent'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{template.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{template.role}</span>
                    <span className="text-xs text-primary/70 border border-primary/30 rounded px-1.5 py-0.5">pre-built</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{template.description}</p>
              </button>
            ))}

            {teams.length > 0 && (
              <div className="pt-4 pb-1">
                <p
                  style={{ animationDelay: `${templates.length * 100}ms` }}
                  className="text-xs text-muted-foreground/60 uppercase tracking-widest text-left animate-in fade-in"
                >
                  Teams
                </p>
              </div>
            )}

            {teams.map((team, i) => (
              <button
                key={`${team.sourceUrl}/${team.id}`}
                onClick={() => handleTeamSelect(team)}
                style={{ animationDelay: `${(templates.length + 1 + i) * 100}ms` }}
                className={cn(
                  'w-full text-left p-4 rounded-xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2',
                  selected === team.id
                    ? 'border-primary bg-primary/10'
                    : selected
                      ? 'border-border opacity-30'
                      : 'border-border hover:border-muted-foreground hover:bg-accent'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{team.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{team.members.join(' · ')}</span>
                    <span className="text-xs text-blue-500/70 border border-blue-500/30 rounded px-1.5 py-0.5">team</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{team.description}</p>
              </button>
            ))}

            {/* Custom option — goes through SDK generation */}
            <button
              onClick={handleCustomToggle}
              style={{ animationDelay: `${(templates.length + teams.length + 1) * 100}ms` }}
              className={cn(
                'w-full text-left p-4 rounded-xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-2',
                selected === 'custom'
                  ? 'border-primary bg-primary/10'
                  : selected
                    ? 'border-border opacity-30'
                    : 'border-border hover:border-muted-foreground hover:bg-accent'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">✏️ Someone else...</span>
                <span className="text-xs text-muted-foreground">Describe a character or energy</span>
              </div>
              <p className="text-xs text-muted-foreground italic">"Tell me who inspires the voice and I'll research them."</p>
            </button>

            {/* Custom input */}
            {showCustom && (
              <div className="animate-in fade-in duration-300 space-y-3 pt-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); }}
                  placeholder="e.g. Tony Stark, Gandalf, your cool aunt..."
                  autoFocus
                  className="w-full bg-transparent border-b-2 border-muted-foreground/30 focus:border-foreground
                             text-lg text-center py-2 outline-none transition-colors placeholder:text-muted-foreground/30"
                />
                {customInput.trim() && (
                  <button
                    onClick={handleCustomSubmit}
                    disabled={researching}
                    className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {researching ? 'Researching...' : 'That\'s who I am'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
