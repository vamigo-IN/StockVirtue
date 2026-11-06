import Link from 'next/link';
import { clsx } from 'clsx';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText, factText } from '@/components/site-content/FactText';
import { ACADEMY_MODULES, withFacts } from '@/content/app';
import type { HomeContent } from '@/content/site/types';
import { fmtCaptureDate, resolveScreen } from '../screens';
import { ArrowRight, SectionHead } from './parts';
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

/**
 * How a room works, in four steps (interface strings, F11). Checked against
 * the app: rooms are private (a 6-character invite code) or public, and a
 * tournament has a start and an end (backend rooms.service.ts, the app's
 * join-by-code screen); each member's return counts from when they joined,
 * or from a tournament's start (rooms-lifecycle.service.ts re-captures the
 * baseline at the bell) and is a percentage of their own starting value
 * (so accounts of any size compete evenly); credits received are taken
 * out before ranking.
 * Words only: no leaderboard, no people, no figures.
 */
const ROOM_STEPS = withFacts(
  ['F11'],
  [
    {
      title: 'Create a room',
      body: 'Keep it private for friends or make it public. A tournament also has a start and an end time.',
    },
    {
      title: 'Share the invite code',
      body: 'Friends join a private room with its six-character code. Anyone can join a public one.',
    },
    {
      title: 'Trade as you normally would',
      body: 'Everyone trades from their own account. Returns count from when each person joins, or from a tournament’s start.',
    },
    {
      title: 'Ranked on trading returns',
      body: 'Returns are in per cent, so a bigger account has no head start, and bonuses and other credits don’t count.',
    },
  ],
  null,
);

/**
 * Rooms and leaderboards (Emerald Terminal): content.learning.board (label,
 * heading, the text from 768 px and the phone sentence below it, the link
 * to /features#learning) beside "How a room works" on the emerald ground:
 * four numbered steps in words (F11). No leaderboard: the public site never
 * shows made-up traders, or real readers' names and returns. Server
 * component.
 */
export function Rooms({ content }: { content: HomeContent['learning']['board'] }) {
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
          {ROOM_STEPS ? (
            <div className={clsx('sv-emerald', e.board)}>
              <h3 className={e.h3}>A room, step by step</h3>
              <ol className={e.roomSteps}>
                {ROOM_STEPS.map((s, i) => (
                  <li key={s.title} className={e.roomStep}>
                    <span className={e.roomNum} aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h4 className={e.roomTitle}>{s.title}</h4>
                      <p className={e.roomBody}>{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
