'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/portal/api';
import type { NewsSourceView, SourceItemDetail } from '@/portal/types';

/**
 * A manual submission (spec §8): a tip, a press release received by email,
 * a link a reporter spotted. It goes through the same duplicate and stock
 * checks as fetched items.
 */
export function ManualItemDialog({
  open,
  onOpenChange,
  manualSources,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualSources: NewsSourceView[];
  onAdded: (item: SourceItemDetail) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [when, setWhen] = useState('');
  // No manual source yet: the server creates "Manual submissions".
  const first = manualSources[0]?.id ?? 'default';
  const [sourceId, setSourceId] = useState(first);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setUrl('');
      setSummary('');
      setWhen('');
      setSourceId(first);
    }
  }, [open, first]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const item = await api<SourceItemDetail>('staff/source-items', {
        method: 'POST',
        body: {
          title: title.trim(),
          ...(url.trim() ? { url: url.trim() } : {}),
          ...(summary.trim() ? { summary: summary.trim() } : {}),
          ...(when ? { publishedAt: new Date(when).toISOString() } : {}),
          ...(sourceId !== 'default' ? { sourceId } : {}),
        },
      });
      toast.success(
        item.status === 'DUPLICATE'
          ? 'Added, but it looks like a story already in the list.'
          : 'Added to Incoming news.',
      );
      onAdded(item);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add a tip</DialogTitle>
            <DialogDescription>
              A press release, an announcement or a link worth a story. It is
              checked for duplicates and companies like any incoming item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="tip-title">Headline</Label>
            <Input
              id="tip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              required
              minLength={5}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-url">Link (optional)</Label>
            <Input
              id="tip-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tip-summary">What it says (optional)</Label>
            <Textarea
              id="tip-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="The key facts, in your words or quoted from the release."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tip-when">Published (optional)</Label>
              <Input
                id="tip-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            {manualSources.length > 1 && (
              <ChoiceSelect
                id="tip-source"
                label="Source"
                value={sourceId}
                onChange={setSourceId}
                choices={manualSources.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || title.trim().length < 5}>
              {saving ? 'Adding…' : 'Add to Incoming news'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
