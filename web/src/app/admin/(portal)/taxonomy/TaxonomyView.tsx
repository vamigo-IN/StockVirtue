'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  FolderTree,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
  UserPen,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import {
  useAuthors,
  useCategories,
  useDirectory,
  useTags,
} from '@/portal/queries';
import type { Byline, Category, Tag } from '@/portal/types';

const refresh = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['taxonomy'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
};

function CategoryDialog({
  open,
  onOpenChange,
  category,
  all,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: Category | null;
  all: Category[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [parentId, setParentId] = useState(category?.parentId ?? 'none');
  const [active, setActive] = useState(category?.isActive ?? true);
  const [separate, setSeparate] = useState(category?.keepSeparate ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        description: description.trim(),
        parentId: parentId === 'none' ? null : parentId,
        isActive: active,
        keepSeparate: separate,
      };
      if (category)
        await api(`staff/categories/${category.id}`, { method: 'PUT', body });
      else await api('staff/categories', { method: 'POST', body });
      refresh(qc);
      toast.success(category ? 'Category saved.' : 'Category created.');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {category ? 'Edit category' : 'New category'}
            </DialogTitle>
            <DialogDescription>
              Categories organise the news site’s sections and URLs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-slug">Web address</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="Made from the name if empty"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label>Inside</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="w-full" aria-label="Parent category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top level</SelectItem>
                {all
                  .filter((c) => c.id !== category?.id)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="cat-active" className="font-normal">
              Shown on the site and offered to writers
            </Label>
            <Switch
              id="cat-active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="cat-separate" className="font-normal">
                Keep separate from the main news
              </Label>
              <p className="text-xs text-muted-foreground">
                Its stories show in its own homepage section and page, not in
                Top stories or the latest news. For Official updates.
              </p>
            </div>
            <Switch
              id="cat-separate"
              checked={separate}
              onCheckedChange={setSeparate}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Categories({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const [editing, setEditing] = useState<{
    open: boolean;
    category: Category | null;
  }>({ open: false, category: null });
  const [deleting, setDeleting] = useState<Category | null>(null);
  if (cats.error)
    return (
      <QueryError error={cats.error} onRetry={() => void cats.refetch()} />
    );
  if (!cats.data) return <RowsSkeleton />;
  const all = cats.data;
  const ordered = [
    ...all
      .filter((c) => !c.parentId)
      .flatMap((p) => [p, ...all.filter((c) => c.parentId === p.id)]),
    ...all.filter((c) => c.parentId && !all.some((p) => p.id === c.parentId)),
  ];
  return (
    <div className="space-y-3">
      {manage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ open: true, category: null })}>
            <Plus /> New category
          </Button>
        </div>
      )}
      {ordered.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet" />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Category</TableHead>
                <TableHead>Web address</TableHead>
                <TableHead>Articles</TableHead>
                <TableHead>Status</TableHead>
                {manage && (
                  <TableHead className="w-24 pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-4">
                    <span
                      className={c.parentId ? 'pl-5 text-sm' : 'font-medium'}
                    >
                      {c.parentId && (
                        <span className="mr-1 text-muted-foreground">↳</span>
                      )}
                      {c.name}
                    </span>
                    {c.description && (
                      <span className="block max-w-md truncate pl-0.5 text-xs text-muted-foreground">
                        {c.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    /news/category/{c.slug}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {c.articleCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {c.isActive ? (
                        <Badge
                          variant="outline"
                          className="border-success/30 bg-success/10 text-success"
                        >
                          On
                        </Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                      {c.keepSeparate && (
                        <Badge variant="outline">Own section</Badge>
                      )}
                    </div>
                  </TableCell>
                  {manage && (
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing({ open: true, category: c })}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(c)}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing.open && (
        <CategoryDialog
          key={editing.category?.id ?? 'new'}
          open
          onOpenChange={(o) =>
            !o && setEditing({ open: false, category: null })
          }
          category={editing.category}
          all={all}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={
          deleting?.articleCount
            ? `${deleting.articleCount} article(s) use it. Move them first, or switch the category off instead.`
            : 'Its sub-categories move up a level.'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await api(`staff/categories/${deleting.id}`, { method: 'DELETE' });
          refresh(qc);
          toast.success('Category deleted.');
        }}
      />
    </div>
  );
}

function Tags({ manage }: { manage: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const tags = useTags(text.trim());
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Tag | null>(null);
  return (
    <div className="space-y-3">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Find a tag"
        className="max-w-sm"
        aria-label="Find a tag"
      />
      {tags.error ? (
        <QueryError error={tags.error} />
      ) : !tags.data ? (
        <RowsSkeleton />
      ) : tags.data.length === 0 ? (
        <EmptyState icon={TagIcon} title="No tags yet">
          Writers add tags while tagging their stories.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Tag</TableHead>
                <TableHead>Web address</TableHead>
                <TableHead>Articles</TableHead>
                {manage && (
                  <TableHead className="w-24 pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-4 font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    /news/tag/{t.slug}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {t.articleCount}
                  </TableCell>
                  {manage && (
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setRenaming(t);
                          setNewName(t.name);
                        }}
                        aria-label={`Rename ${t.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(t)}
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <ConfirmDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename tag"
        description="Its web address changes with the name."
        confirmLabel="Rename"
        onConfirm={async () => {
          if (!renaming) return;
          await api(`staff/tags/${renaming.id}`, {
            method: 'PATCH',
            body: { name: newName.trim() },
          });
          refresh(qc);
          toast.success('Tag renamed.');
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
          aria-label="New tag name"
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the tag “${deleting?.name ?? ''}”?`}
        description={`It is removed from ${deleting?.articleCount ?? 0} article(s). The articles themselves stay.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await api(`staff/tags/${deleting.id}`, { method: 'DELETE' });
          refresh(qc);
          toast.success('Tag deleted.');
        }}
      />
    </div>
  );
}

function BylineDialog({
  byline,
  onClose,
  staffLinks,
}: {
  byline: Byline | null;
  onClose: () => void;
  staffLinks: boolean;
}) {
  const qc = useQueryClient();
  const directory = useDirectory(staffLinks);
  const [name, setName] = useState(byline?.name ?? '');
  const [bio, setBio] = useState(byline?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(byline?.avatarUrl ?? '');
  const [twitter, setTwitter] = useState(byline?.socials.twitter ?? '');
  const [linkedin, setLinkedin] = useState(byline?.socials.linkedin ?? '');
  const [staffId, setStaffId] = useState(byline?.staff?.id ?? 'none');
  const [active, setActive] = useState(byline?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
        socials: { twitter: twitter.trim(), linkedin: linkedin.trim() },
        isActive: active,
        ...(staffLinks ? { staffId: staffId === 'none' ? null : staffId } : {}),
      };
      if (byline)
        await api(`staff/authors/${byline.id}`, { method: 'PUT', body });
      else await api('staff/authors', { method: 'POST', body });
      refresh(qc);
      toast.success('Byline saved.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{byline ? 'Edit byline' : 'New byline'}</DialogTitle>
            <DialogDescription>
              The public author name and profile readers see on stories.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="by-name">Name</Label>
            <Input
              id="by-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="by-bio">Short bio</Label>
            <Textarea
              id="by-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="by-avatar">Photo URL</Label>
            <Input
              id="by-avatar"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://"
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="X profile URL"
              aria-label="X profile"
            />
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="LinkedIn URL"
              aria-label="LinkedIn profile"
            />
          </div>
          {staffLinks && (
            <div className="space-y-2">
              <Label>Staff member</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Linked staff member"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked (contributor)</SelectItem>
                  {(directory.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="by-active" className="font-normal">
              Offered to writers
            </Label>
            <Switch
              id="by-active"
              checked={active}
              onCheckedChange={setActive}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Bylines({
  manage,
  staffLinks,
}: {
  manage: boolean;
  staffLinks: boolean;
}) {
  const authors = useAuthors();
  const [editing, setEditing] = useState<{ byline: Byline | null } | null>(
    null,
  );
  if (authors.error)
    return (
      <QueryError
        error={authors.error}
        onRetry={() => void authors.refetch()}
      />
    );
  if (!authors.data) return <RowsSkeleton />;
  return (
    <div className="space-y-3">
      {manage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ byline: null })}>
            <Plus /> New byline
          </Button>
        </div>
      )}
      {authors.data.length === 0 ? (
        <EmptyState icon={UserPen} title="No bylines yet">
          A byline is created automatically the first time a staff member writes
          a story.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Byline</TableHead>
                <TableHead>Staff member</TableHead>
                <TableHead>Articles</TableHead>
                {manage && (
                  <TableHead className="w-16 pr-4">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {authors.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4">
                    <span className="font-medium">{a.name}</span>
                    {!a.isActive && (
                      <Badge variant="outline" className="ml-2">
                        Off
                      </Badge>
                    )}
                    <span className="block font-mono text-xs text-muted-foreground">
                      /news/author/{a.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.staff?.displayName ?? 'Contributor'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.articleCount}
                  </TableCell>
                  {manage && (
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing({ byline: a })}
                        aria-label={`Edit ${a.name}`}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && (
        <BylineDialog
          byline={editing.byline}
          onClose={() => setEditing(null)}
          staffLinks={staffLinks}
        />
      )}
    </div>
  );
}

export function TaxonomyView() {
  const me = usePortalMe();
  const manage = can(me, 'taxonomy.manage');
  return (
    <>
      <PageHeader
        title="Categories & tags"
        description={
          manage
            ? 'How stories are organised on the news site, and the bylines readers see.'
            : 'How stories are organised. Ask an editor to change these.'
        }
      />
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="bylines">Bylines</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-4">
          <Categories manage={manage} />
        </TabsContent>
        <TabsContent value="tags" className="mt-4">
          <Tags manage={manage} />
        </TabsContent>
        <TabsContent value="bylines" className="mt-4">
          <Bylines
            manage={manage}
            staffLinks={manage && can(me, 'news.assign')}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
