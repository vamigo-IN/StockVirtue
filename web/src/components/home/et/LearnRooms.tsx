import Link from 'next/link';
import { clsx } from 'clsx';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText, factText } from '@/components/site-content/FactText';
import { ACADEMY_MODULES, withFacts } from '@/content/app';
import type { HomeContent } from '@/content/site/types';
import { fmtCaptureDate, resolveScreen } from '../screens';
import { ArrowRight, SampleTag, SectionHead } from './parts';
import e from './et.module.css';

const ACADEMY_TITLE_ID = 'home-academy-title';
const ROOMS_TITLE_ID = 'home-rooms-title';

/**
 * The Trading Academy (Emerald Terminal): content.learning's label, heading
 * and two paragraphs beside the seven modules and their lesson counts
 * (ACADEMY_MODULES, F9: code, from the app), and the lesson screenshot when
 * the owner has one. Server component.
 */
export function Academy({ content }: { content: HomeContent['learning'] }) {
  const title = factText(content.title);
  const total = ACADEMY_MODULES.reduce((a, m) => a + (Number.parseInt(m.value, 10) || 0), 0);
  const max = Math.max(1, ...ACADEMY_MODULES.map((m) => Number.parseInt(m.value, 10) || 0));
  const quizzes = withFacts(['F9'], 'Every lesson ends with quiz questions to answer before you move on.', null);
  const lesson = resolveScreen(content.lessonScreen, 'lesson');
  return (
    <section className={clsx(e.section, e.mint)} aria-labelledby={ACADEMY_TITLE_ID}>
      <div className="sv-container">
        <SectionHead id={ACADEMY_TITLE_ID} label={content.label} title={title ?? content.label} />
        <div className={e.split}>
          <div className={e.prose}>
            {content.paragraphs.map((p, i) => (
              <FactText key={i} as="p" field={p} />
            ))}
            {lesson ? (
              <DeviceFrame
                screen={lesson}
                size="md"
                caption={`A lesson in the app, captured on ${fmtCaptureDate(lesson.captured)}.`}
              />
            ) : null}
          </div>
          {ACADEMY_MODULES.length ? (
            <div className={e.box}>
              <div className={e.boxHead}>
                <h3 className={e.boxTitle}>The modules</h3>
                <span className={e.panelMeta}>
                  {ACADEMY_MODULES.length} modules · {total} lessons
                </span>
              </div>
              <ol className={e.modules}>
                {ACADEMY_MODULES.map((m, i) => {
                  const n = Number.parseInt(m.value, 10) || 0;
                  return (
                    <li key={m.label} className={e.module}>
                      <span className={e.moduleNo}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={e.moduleName}>{m.label}</span>
                      <span className={e.moduleCount}>
                        <span className={e.moduleBar} aria-hidden="true">
                          <span style={{ width: `${(n / max) * 100}%` }} />
                        </span>
                        {m.value}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {quizzes ? <p className={e.boxFoot}>{quizzes}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The sample leaderboard: made-up traders and returns, labelled "Sample". */
const BOARD = [
  { name: 'Trader A', ret: 6.4 },
  { name: 'Trader B', ret: 4.1 },
  { name: 'You', ret: 2.8 },
  { name: 'Trader C', ret: 1.2 },
  { name: 'Trader D', ret: -0.9 },
];

/**
 * Rooms and leaderboards (Emerald Terminal): content.learning.board (label,
 * heading, the text from 768 px and the phone sentence below it, the link
 * to /features#learning) beside a sample leaderboard on the emerald ground,
 * labelled "Sample". F11: credits are taken out before ranking. Server
 * component.
 */
export function Rooms({ content }: { content: HomeContent['learning']['board'] }) {
  const rankedOn = withFacts(['F11'], 'Ranked on trading returns only: referral bonuses and other credits are taken out.', null);
  return (
    <section className={clsx(e.section, e.white)} aria-labelledby={ROOMS_TITLE_ID}>
      <div className="sv-container">
        <div className={e.split}>
          <div>
            <SectionHead id={ROOMS_TITLE_ID} label={content.label} title={content.title} />
            <div className={e.prose}>
              <FactText as="p" field={content.body} className={e.tabletUp} />
              <FactText as="p" field={content.phoneBody} className={e.phoneOnly} />
            </div>
            <Link href="/features#learning" className={e.moreLink}>
              {content.linkLabel}
              <ArrowRight />
            </Link>
          </div>
          <div className={clsx('sv-emerald', e.board)} role="group" aria-label="Sample leaderboard">
            <div className={e.boardTop}>
              <div>
                <h3 className={e.h3}>Friday traders</h3>
                <p className={e.boardSub}>Private room · 5 traders</p>
              </div>
              <SampleTag>Sample leaderboard</SampleTag>
            </div>
            <ol className={e.boardRows}>
              {BOARD.map((r, i) => (
                <li key={r.name} className={e.boardRow}>
                  <span className={e.boardRank}>{i + 1}</span>
                  <span>{r.name}</span>
                  <span className={r.ret >= 0 ? e.up : e.down}>
                    {r.ret >= 0 ? '+' : '−'}
                    {Math.abs(r.ret).toFixed(2)}%
                  </span>
                </li>
              ))}
            </ol>
            {rankedOn ? <p className={e.boardNote}>{rankedOn}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
