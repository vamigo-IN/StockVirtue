'use client';

import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { SiteConfigView } from '@/portal/types';
import { SaveRow, SwitchRow, useGroupForm, ViewLink } from './config-form';

const VERIFY = [
  {
    key: 'googleVerification',
    label: 'Google Search Console',
    tag: 'google-site-verification',
  },
  {
    key: 'bingVerification',
    label: 'Bing Webmaster Tools',
    tag: 'msvalidate.01',
  },
  {
    key: 'yandexVerification',
    label: 'Yandex Webmaster',
    tag: 'yandex-verification',
  },
] as const;

export function SearchTab({
  view,
  canEdit,
}: {
  view: SiteConfigView;
  canEdit: boolean;
}) {
  const g = useGroupForm(view, 'search');
  const f = g.form;
  const off = !canEdit || g.busy;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Titles and sharing</CardTitle>
          <CardDescription>
            How pages are named in search results and on social media.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="titleTemplate">Title format</Label>
            <Input
              id="titleTemplate"
              value={f.titleTemplate}
              onChange={(e) => g.set('titleTemplate', e.target.value)}
              placeholder="%s · StockVirtue"
              maxLength={120}
              disabled={off}
            />
            <p className="text-xs text-muted-foreground">
              <code className="font-mono">%s</code> is each page&apos;s own
              title. Blank = &ldquo;%s · StockVirtue&rdquo;. News pages keep
              their own format.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="twitterHandle">X (Twitter) handle</Label>
            <Input
              id="twitterHandle"
              value={f.twitterHandle}
              onChange={(e) => g.set('twitterHandle', e.target.value)}
              placeholder="@stockvirtue"
              maxLength={16}
              disabled={off}
            />
            <p className="text-xs text-muted-foreground">
              Named on cards when a page is shared on X.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="keywords">Keywords</Label>
            <Input
              id="keywords"
              value={f.keywords}
              onChange={(e) => g.set('keywords', e.target.value)}
              placeholder="stock market news, NSE, BSE, Sensex, Nifty"
              maxLength={500}
              disabled={off}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Search engines give these little weight; titles
              and descriptions matter more.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search engine verification</CardTitle>
          <CardDescription>
            Proves to each search engine that you own the site. From the meta
            tag it gives you, paste only the <b>content</b> value: for{' '}
            <code className="font-mono text-xs">
              &lt;meta name=&quot;google-site-verification&quot;
              content=&quot;abc123&quot;&gt;
            </code>{' '}
            paste <code className="font-mono text-xs">abc123</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          {VERIFY.map((v) => (
            <div key={v.key} className="space-y-2">
              <Label htmlFor={v.key}>{v.label}</Label>
              <Input
                id={v.key}
                value={f[v.key]}
                onChange={(e) => g.set(v.key, e.target.value)}
                maxLength={120}
                spellCheck={false}
                disabled={off}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Tag: <code className="font-mono">{v.tag}</code>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Indexing and robots.txt</CardTitle>
          <CardDescription>
            Which crawlers may read the site.{' '}
            <ViewLink href="/robots.txt">View robots.txt</ViewLink>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="noindex"
            label="Hide the whole site from search engines"
            hint="For a test site only. Pages ask not to be indexed and robots.txt blocks every crawler, so the site drops out of Google."
            checked={f.noindex}
            onChange={(v) => g.set('noindex', v)}
            disabled={off}
          />
          {f.noindex && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                Saving this removes stockvirtue.com from search results.
              </AlertDescription>
            </Alert>
          )}
          <SwitchRow
            id="blockAiCrawlers"
            label="Keep AI training crawlers out"
            hint="Blocks crawlers that collect pages to train AI models (GPTBot, Google-Extended, CCBot, ClaudeBot, Applebot-Extended, Bytespider, Meta and Cohere). Search engines and AI answer tools can still read the site."
            checked={f.blockAiCrawlers}
            onChange={(v) => g.set('blockAiCrawlers', v)}
            disabled={off}
          />
          <div className="space-y-2">
            <Label htmlFor="robotsExtra">Extra robots.txt lines</Label>
            <Textarea
              id="robotsExtra"
              value={f.robotsExtra}
              onChange={(e) => g.set('robotsExtra', e.target.value)}
              rows={4}
              maxLength={5000}
              spellCheck={false}
              disabled={off}
              placeholder={'User-agent: SomeBot\nDisallow: /'}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Only User-agent, Allow, Disallow, Crawl-delay, Sitemap and #
              comment lines. Added after the built-in rules.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sitemaps</CardTitle>
          <CardDescription>
            Lists of pages for search engines, refreshed whenever a story is
            published.{' '}
            <ViewLink href="/news/sitemap.xml">View the news sitemap</ViewLink>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SwitchRow
            id="sitemapCategories"
            label="Section pages"
            hint="Markets, Economy and the other news sections."
            checked={f.sitemapCategories}
            onChange={(v) => g.set('sitemapCategories', v)}
            disabled={off}
          />
          <SwitchRow
            id="sitemapTags"
            label="Tag pages"
            hint="One page per tag. Turn off if you have many thin tags."
            checked={f.sitemapTags}
            onChange={(v) => g.set('sitemapTags', v)}
            disabled={off}
          />
          <SwitchRow
            id="sitemapAuthors"
            label="Author pages"
            hint="One page per byline."
            checked={f.sitemapAuthors}
            onChange={(v) => g.set('sitemapAuthors', v)}
            disabled={off}
          />
          <SwitchRow
            id="googleNewsSitemap"
            label="Google News sitemap"
            hint={
              <>
                Stories from the last two days, for Google News.{' '}
                <ViewLink href="/news/news-sitemap.xml">View</ViewLink>
              </>
            }
            checked={f.googleNewsSitemap}
            onChange={(v) => g.set('googleNewsSitemap', v)}
            disabled={off}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LLM sitemap (llms.txt)</CardTitle>
          <CardDescription>
            A plain map of the site for AI assistants such as ChatGPT, Claude
            and Perplexity: main pages, news sections and the latest stories.{' '}
            <ViewLink href="/llms.txt">View llms.txt</ViewLink>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            id="llmsEnabled"
            label="Publish llms.txt"
            hint="Off: /llms.txt answers 404."
            checked={f.llmsEnabled}
            onChange={(v) => g.set('llmsEnabled', v)}
            disabled={off}
          />
          <div className="space-y-2">
            <Label htmlFor="llmsSummary">About the site</Label>
            <Textarea
              id="llmsSummary"
              value={f.llmsSummary}
              onChange={(e) => g.set('llmsSummary', e.target.value)}
              rows={3}
              maxLength={2000}
              disabled={off || !f.llmsEnabled}
              placeholder="StockVirtue covers Indian and global markets: news, explainers and live market data, plus a virtual-money trading simulator app."
            />
            <p className="text-xs text-muted-foreground">
              One or two sentences. Blank = the site description.
            </p>
          </div>
          <div className="w-48 space-y-2">
            <Label htmlFor="llmsArticles">Latest stories listed</Label>
            <Input
              id="llmsArticles"
              type="number"
              min={5}
              max={200}
              value={f.llmsArticles}
              onChange={(e) =>
                g.set(
                  'llmsArticles',
                  Math.min(200, Math.max(5, Number(e.target.value) || 5)),
                )
              }
              disabled={off || !f.llmsEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <SaveRow
        canEdit={canEdit}
        permission="seo.update"
        dirty={g.dirty}
        busy={g.busy}
        onSave={() =>
          void g.save(
            'Saved. robots.txt, llms.txt and the sitemaps are updated.',
          )
        }
        onDiscard={g.reset}
      />
    </div>
  );
}
