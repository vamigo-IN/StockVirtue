import { clsx } from 'clsx';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText } from '@/components/site-content/FactText';
import { withFacts } from '@/content/app';
import type { HomeContent } from '@/content/site/types';
import { fmtCaptureDate, stageSteps } from '../screens';
import { SampleTag, SectionHead } from './parts';
import e from './et.module.css';

const TITLE_ID = 'home-how-title';
const f2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The example contract note: an intraday round trip of 20 shares with
 * sample figures (F5: the lines a contract note lists; brokerage applies to
 * intraday trades; rates stay out of copy). Labelled as an example.
 */
const BUY = 1598;
const SELL = 1612.4;
const QTY = 20;
const CHARGES = [
  { line: 'Brokerage', amount: 40 },
  { line: 'STT', amount: 8.06 },
  { line: 'Exchange and SEBI charges', amount: 1.97 },
  { line: 'Stamp duty', amount: 0.96 },
  { line: 'GST', amount: 7.55 },
];

function ContractNote() {
  if (!withFacts(['F5'], true, null)) return null;
  const bought = BUY * QTY;
  const sold = SELL * QTY;
  const charges = CHARGES.reduce((a, c) => a + c.amount, 0);
  const net = sold - bought - charges;
  return (
    <div className={e.noteCard}>
      <div className={e.noteHead}>
        <div className={e.noteTitleRow}>
          <h3 className={e.h3}>Example contract note</h3>
          <SampleTag>Sample figures</SampleTag>
        </div>
        <p className={e.noteMeta}>HDFCBANK · NSE · intraday · {QTY} shares</p>
      </div>
      <div className={e.noteTableBox}>
        <table className={e.noteTable}>
          <caption className="sr-only">An example contract note with sample figures</caption>
          <thead>
            <tr>
              <th scope="col">LINE</th>
              <th scope="col">AMOUNT (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Bought {QTY} at {f2.format(BUY)}</td>
              <td>−{f2.format(bought)}</td>
            </tr>
            <tr>
              <td>Sold {QTY} at {f2.format(SELL)}</td>
              <td>+{f2.format(sold)}</td>
            </tr>
            {CHARGES.map((c) => (
              <tr key={c.line}>
                <td>{c.line}</td>
                <td>−{f2.format(c.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Net P&amp;L after charges</th>
              <td className={e.up}>+{f2.format(net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={e.noteFoot}>
        An example of the lines a contract note lists. The app works out the real charges on every trade.
      </p>
    </div>
  );
}

/**
 * "How a trade works" (`#inside-the-app`, the hero's second button):
 * content.stage's three steps, numbered, each with its screenshot when the
 * owner has one (content first, SCREENS second), beside the example
 * contract note. Server component.
 */
export function HowItWorks({ content }: { content: HomeContent['stage'] }) {
  const steps = stageSteps(content.steps);
  return (
    <section id="inside-the-app" className={clsx(e.section, e.white)} aria-labelledby={TITLE_ID}>
      <div className="sv-container">
        <SectionHead id={TITLE_ID} label={content.label} title={content.title} />
        <div className={e.how}>
          <ol className={e.steps}>
            {steps.map((s, i) => (
              <li key={s.id} className={e.step}>
                <span className={e.stepNum} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className={e.h3}>{s.label}</h3>
                  <FactText as="p" field={s.body} className={e.body} />
                  {s.screen ? (
                    <div className={e.stepScreen}>
                      <DeviceFrame
                        screen={s.screen}
                        size="sm"
                        showCallouts
                        caption={`Captured on ${fmtCaptureDate(s.screen.captured)}.`}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <ContractNote />
        </div>
      </div>
    </section>
  );
}
