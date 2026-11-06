import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText } from '@/components/site-content/FactText';
import type { ScreenId } from '@/content/screens';
import type { DownloadMinute, LiveValues } from '@/content/site/types';
import { pickScreen, screenCaption } from './screens';
import s from './site.module.css';

/** The screens the three minutes show when supplied (spec §9.5.5). */
const MINUTE_SCREENS: ScreenId[] = ['sign-in', 'home', 'order-ticket'];

/**
 * "Your first five minutes" on /download (spec §5.5, §9.5.5): three white
 * cards (Emerald Terminal), in columns from 768 px, one under the other on
 * phones. Each is a mono number ("01", decoration), the lead ("Minute 1:
 * sign in.") and two lines of `body`, with its screen (160 × 346; 120 wide
 * on phones) above when one exists, captioned "{What it shows}, captured
 * on {date}." Without screens the minutes are text only, a complete state.
 * Server component.
 */
export function FirstFiveMinutes({
  title,
  items,
  values,
}: {
  title: string;
  items: DownloadMinute[];
  values: LiveValues;
}) {
  return (
    <section aria-labelledby="first-five-title">
      <h2 id="first-five-title" className={s.h2Fixed}>
        {title}
      </h2>
      <ol className={s.minutes} role="list">
        {items.slice(0, 3).map((m, i) => {
          const screen = pickScreen(m.screen, MINUTE_SCREENS[i] ?? 'home');
          return (
            <li key={m.id} className={s.minute}>
              <span className={s.minuteIndex} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {screen ? (
                <div className={s.minuteShot}>
                  <DeviceFrame screen={screen} size="sm" caption={screenCaption(m.screenWhat, screen)} />
                </div>
              ) : null}
              <h3 className={s.h3}>{m.lead}</h3>
              <FactText as="p" field={m.body} values={values} className="t-body text-fg-2" />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
