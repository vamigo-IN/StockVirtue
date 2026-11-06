'use client';

import { useEffect, useId, useState } from 'react';
import {
  type Consent,
  isCurrentConsent,
  OPEN_SETTINGS_EVENT,
  readConsent,
  saveConsent,
} from '@/lib/consent';
import styles from './ConsentBanner.module.css';

type Lang = 'en' | 'hi';

/** The banner's words, in English and Hindi (the notice's other language). */
const TEXT = {
  en: {
    title: 'Your choice about cookies',
    intro:
      'We use necessary cookies to run this site and to remember this choice. With your consent we would also use cookies for:',
    analytics: 'Analytics',
    analyticsWhy: 'to learn which pages are read, so we can improve them.',
    advertising: 'Advertising',
    advertisingWhy: 'to show ads that suit your interests and to measure them.',
    necessary: 'Necessary',
    necessaryWhy:
      'signing in, security and remembering this choice. Always on.',
    change:
      'Say no and the site works just the same. You can change your mind at any time from “Cookie settings” at the bottom of every page.',
    notice: 'Privacy notice',
    accept: 'Accept all',
    reject: 'Reject all',
    choose: 'Choose',
    save: 'Save my choices',
    on: 'On',
    language: 'हिंदी',
  },
  hi: {
    title: 'कुकीज़ के बारे में आपकी पसंद',
    intro:
      'यह साइट चलाने और आपकी पसंद याद रखने के लिए हम ज़रूरी कुकीज़ का उपयोग करते हैं। आपकी सहमति से हम इनके लिए भी कुकीज़ का उपयोग करेंगे:',
    analytics: 'विश्लेषण',
    analyticsWhy:
      'यह जानने के लिए कि कौन-से पेज पढ़े जाते हैं, ताकि हम उन्हें बेहतर बना सकें।',
    advertising: 'विज्ञापन',
    advertisingWhy: 'आपकी रुचि के विज्ञापन दिखाने और उन्हें मापने के लिए।',
    necessary: 'ज़रूरी',
    necessaryWhy: 'साइन-इन, सुरक्षा और आपकी पसंद याद रखने के लिए। हमेशा चालू।',
    change:
      'मना करने पर भी साइट वैसे ही चलेगी। आप हर पेज के नीचे “कुकी सेटिंग्स” से कभी भी अपनी पसंद बदल सकते हैं।',
    notice: 'गोपनीयता सूचना',
    accept: 'सभी स्वीकार करें',
    reject: 'सभी अस्वीकार करें',
    choose: 'चुनें',
    save: 'मेरी पसंद सहेजें',
    on: 'चालू',
    language: 'English',
  },
} satisfies Record<Lang, Record<string, string>>;

/**
 * The "choose again" line (W7 addendum §5.13), above the intro when the
 * visitor's stored choice was made under an older cookie choice version.
 * New words for the lawyer and the translator (the spec §9.8 list); TEXT
 * above stays verbatim, and the language button switches this line too.
 */
const AGAIN: Record<Lang, string> = {
  en: 'We changed how this site uses cookies since you last chose. Please choose again.',
  hi: 'आपके पिछली बार चुनने के बाद हमने इस साइट पर कुकीज़ के इस्तेमाल में बदलाव किया है। कृपया फिर से चुनें।',
};

/**
 * Records the choice (no IP address, no cookie other than its own id), with
 * the cookie choice version the banner showed: the record says
 * `cookies-<version>`.
 */
function log(c: Consent, source: string) {
  void fetch('/api/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: c.id,
      version: c.version,
      analytics: c.analytics,
      advertising: c.advertising,
      source,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Asks each visitor, before any optional cookie is set, whether the site may
 * use analytics and advertising cookies: one tap to accept or to refuse, or a
 * choice per purpose, in English or Hindi. Shows again when the choice lapses,
 * when the purposes change, or from "Cookie settings" in the footer.
 *
 * `version` is the site's cookie choice version (W7 addendum §5.13, from the
 * settings payload). A stored choice is current when its version is at
 * least `version`; otherwise the banner opens with the "choose again" line,
 * and its switches start off (an old "yes" isn't carried into a new
 * version). The new choice is saved under `version`, with the old id.
 */
export function ConsentBanner({
  analytics,
  advertising,
  version = 1,
}: {
  /** The analytics services in use (names), if any. */
  analytics: string[];
  /** The advertising services in use (names), if any. */
  advertising: string[];
  /** The cookie choice version (settings.cookieConsent.version). */
  version?: number;
}) {
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  /** A stored choice exists, but under an older version: ask again. */
  const [outdated, setOutdated] = useState(false);
  const [choice, setChoice] = useState({
    analytics: false,
    advertising: false,
  });
  const titleId = useId();
  const t = TEXT[lang];

  useEffect(() => {
    if (navigator.language?.toLowerCase().startsWith('hi')) setLang('hi');
  }, []);

  useEffect(() => {
    const saved = readConsent();
    if (saved && isCurrentConsent(saved, version)) {
      setOutdated(false);
      setChoice({ analytics: saved.analytics, advertising: saved.advertising });
    } else {
      setOutdated(saved !== null);
      setChoice({ analytics: false, advertising: false });
      setOpen(true);
    }
    const reopen = () => {
      const now = readConsent();
      const current = now !== null && isCurrentConsent(now, version);
      setOutdated(now !== null && !current);
      setChoice({
        analytics: current && !!now?.analytics,
        advertising: current && !!now?.advertising,
      });
      setChoosing(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, [version]);

  if (!open) return null;

  const decide = (
    next: { analytics: boolean; advertising: boolean },
    how: string,
  ) => {
    log(saveConsent(next, version), how);
    setOpen(false);
    setChoosing(false);
    setOutdated(false);
  };
  const purposes = [
    analytics.length > 0 && {
      key: 'analytics' as const,
      name: t.analytics,
      why: t.analyticsWhy,
      services: analytics,
    },
    advertising.length > 0 && {
      key: 'advertising' as const,
      name: t.advertising,
      why: t.advertisingWhy,
      services: advertising,
    },
  ].filter((p): p is Exclude<typeof p, false> => !!p);

  return (
    <div
      className={styles.banner}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      lang={lang}
    >
      <div className={styles.head}>
        <p id={titleId} className={styles.title}>
          {t.title}
        </p>
        <button
          type="button"
          className={styles.lang}
          onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
          lang={lang === 'en' ? 'hi' : 'en'}
        >
          {t.language}
        </button>
      </div>
      {outdated ? (
        <p className={styles.again} data-consent-again="">
          {AGAIN[lang]}
        </p>
      ) : null}
      <p className={styles.text}>{t.intro}</p>
      <ul
        className={
          choosing ? `${styles.purposes} ${styles.choosing}` : styles.purposes
        }
      >
        {purposes.map((p) => (
          <li key={p.key}>
            {choosing ? (
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={choice[p.key]}
                  onChange={(e) =>
                    setChoice((c) => ({ ...c, [p.key]: e.target.checked }))
                  }
                />
                <span>
                  <strong>{p.name}</strong> ({p.services.join(', ')}): {p.why}
                </span>
              </label>
            ) : (
              <span>
                <strong>{p.name}</strong> ({p.services.join(', ')}): {p.why}
              </span>
            )}
          </li>
        ))}
        {choosing && (
          <li>
            <label className={styles.toggle}>
              <input type="checkbox" checked disabled />
              <span>
                <strong>{t.necessary}</strong>: {t.necessaryWhy}
              </span>
            </label>
          </li>
        )}
      </ul>
      <p className={styles.small}>
        {t.change}{' '}
        <a href="/privacy#cookies" className={styles.link}>
          {t.notice}
        </a>
      </p>
      <div className={styles.actions}>
        {choosing ? (
          <button
            type="button"
            className={styles.primary}
            onClick={() => decide(choice, 'web.settings')}
          >
            {t.save}
          </button>
        ) : (
          <>
            {/* Refusing is exactly as easy and as visible as accepting. */}
            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                decide({ analytics: false, advertising: false }, 'web.banner')
              }
            >
              {t.reject}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setChoosing(true)}
            >
              {t.choose}
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() =>
                decide(
                  {
                    analytics: analytics.length > 0,
                    advertising: advertising.length > 0,
                  },
                  'web.banner',
                )
              }
            >
              {t.accept}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
