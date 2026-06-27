'use client';

import { useActionState } from 'react';
import { saveAction, type FormState } from '../actions';
import type { SiteSettings } from '@/lib/settings';

const INITIAL: FormState = { ok: false, message: '' };

export function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [state, action, pending] = useActionState(saveAction, INITIAL);

  return (
    <form action={action}>
      {state.message && (
        <div
          className={state.ok ? 'alert alert-ok' : 'alert alert-err'}
          role={state.ok ? 'status' : 'alert'}
        >
          {state.message}
        </div>
      )}

      <div className="admin-card admin-section">
        <h3>General</h3>
        <div className="field">
          <label htmlFor="siteTitle">Site title</label>
          <input
            id="siteTitle"
            name="siteTitle"
            className="input"
            defaultValue={initial.siteTitle}
          />
          <div className="hint">Used in the browser tab and SEO title.</div>
        </div>
        <div className="field">
          <label htmlFor="siteDescription">Meta description</label>
          <textarea
            id="siteDescription"
            name="siteDescription"
            className="textarea"
            defaultValue={initial.siteDescription}
          />
          <div className="hint">Shown in search results &amp; social previews.</div>
        </div>
        <div className="field">
          <label htmlFor="contactEmail">Contact email</label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="input"
            defaultValue={initial.contactEmail}
          />
        </div>
        <div className="field">
          <label htmlFor="playStoreUrl">Google Play URL</label>
          <input
            id="playStoreUrl"
            name="playStoreUrl"
            className="input"
            defaultValue={initial.playStoreUrl}
          />
        </div>
      </div>

      <div className="admin-card admin-section">
        <h3>Social links</h3>
        <div className="hint" style={{ marginBottom: 12 }}>
          Leave blank to hide a network in the footer.
        </div>
        {(
          [
            ['twitter', 'X / Twitter'],
            ['instagram', 'Instagram'],
            ['linkedin', 'LinkedIn'],
            ['youtube', 'YouTube'],
            ['facebook', 'Facebook'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              name={key}
              className="input"
              placeholder="https://…"
              defaultValue={initial.social[key] ?? ''}
            />
          </div>
        ))}
      </div>

      <div className="admin-card admin-section">
        <h3>Code injection</h3>
        <div className="hint" style={{ marginBottom: 12 }}>
          Paste raw HTML for site / domain verification (Google Search Console,
          Bing, Meta) and analytics (GA4, GTM, Pixel). Injected server-side, so
          tags appear in the page source and scripts run on load.{' '}
          <strong>Only paste code you trust.</strong>
        </div>
        <div className="field">
          <label htmlFor="headCode">Header code (top of page)</label>
          <textarea
            id="headCode"
            name="headCode"
            className="textarea code-input"
            rows={6}
            defaultValue={initial.headCode}
            placeholder='<meta name="google-site-verification" content="…" />'
          />
          <div className="hint">
            Best place for verification meta tags and analytics snippets.
          </div>
        </div>
        <div className="field">
          <label htmlFor="bodyStartCode">Body start code</label>
          <textarea
            id="bodyStartCode"
            name="bodyStartCode"
            className="textarea code-input"
            rows={4}
            defaultValue={initial.bodyStartCode}
            placeholder="<!-- e.g. GTM noscript -->"
          />
        </div>
        <div className="field">
          <label htmlFor="bodyEndCode">Body end code</label>
          <textarea
            id="bodyEndCode"
            name="bodyEndCode"
            className="textarea code-input"
            rows={4}
            defaultValue={initial.bodyEndCode}
            placeholder="<!-- e.g. chat widget -->"
          />
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save & publish'}
        </button>
      </div>
    </form>
  );
}
