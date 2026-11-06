import { clsx } from 'clsx';
import { delayFor } from '@/components/market/gate';
import { Stamp } from '@/components/market/Stamp';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText } from '@/components/site-content/FactText';
import { withFacts } from '@/content/app';
import type { HomeContent } from '@/content/site/types';
import type { ContractNoteData, Snapshot, WorkedNote } from '@/market/types';
import { fmtCaptureDate, stageSteps } from '../screens';
import { SectionHead } from './parts';
import e from './et.module.css';

const TITLE_ID = 'home-how-title';
const f2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f2.format(Math.abs(n))}`;

/**
 * The lines a contract note lists and when each is charged, from the app's
 * fee schedule (backend common/fees.ts). F5: brokerage on every trade except
 * delivery share trades; rates stay out of copy.
 */
const LINES: { line: string; when: string }[] = [
  { line: 'Brokerage', when: 'Every trade except delivery share trades' },
  { line: 'STT', when: 'The sell side, and both sides of a delivery share trade' },
  { line: 'Exchange and SEBI charges', when: 'Every trade' },
  { line: 'Stamp duty', when: 'The buy side' },
  { line: 'GST', when: 'On the brokerage and the exchange and SEBI charges' },
];

/**
 * The contract note for 20 shares of a curated stock bought at the day's
 * open and sold at the last price, intraday: the API prices it with the
 * app's own charges (contract-note.ts), so every amount here is what the
 * app would charge, and the note carries its prices' Stamp.
 */
function WorkedNoteCard({ note, data, snapshot }: { note: WorkedNote; data: ContractNoteData; snapshot: Snapshot }) {
  const when = data.label === 'EOD' ? 'the last session’s prices' : 'today’s prices';
  const c = note.charges;
  const lines: [string, number][] = [
    ['Brokerage', c.brokerage],
    ['STT', c.stt],
    ['Exchange and SEBI charges', c.exchangeAndSebi],
    ['Stamp duty', c.stampDuty],
    ['GST', c.gst],
  ];
  return (
    <div className={e.noteCard} data-note="worked">
      <div className={e.noteHead}>
        <h3 className={e.h3}>Contract note</h3>
        <p className={e.noteMeta}>
          {note.symbol} · {note.exchange} · intraday · {note.qty} shares
        </p>
        <p className={e.noteLead}>
          On {when}: {note.qty} {note.name} shares bought at the day’s open and sold at the last price.
        </p>
      </div>
      <div className={e.noteTableBox}>
        <table className={e.noteTable}>
          <caption className="sr-only">
            {`A contract note on ${when}: ${note.qty} ${note.name} shares bought and sold the same day, with the app's charges, in rupees`}
          </caption>
          <thead>
            <tr>
              <th scope="col">LINE</th>
              <th scope="col">AMOUNT (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Bought {note.qty} at {f2.format(note.buy.price)}
              </td>
              <td>−{f2.format(note.buy.value)}</td>
            </tr>
            <tr>
              <td>
                Sold {note.qty} at {f2.format(note.sell.price)}
              </td>
              <td>+{f2.format(note.sell.value)}</td>
            </tr>
            {lines.map(([line, amount]) => (
              <tr key={line}>
                <td>{line}</td>
                <td>{amount ? `−${f2.format(amount)}` : f2.format(0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Net P&amp;L after charges</th>
              <td className={note.net > 0 ? e.up : note.net < 0 ? e.down : undefined}>{signed(note.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className={e.noteFoot}>
        <p>The charges are the app’s own, worked out on these prices the way it works out every trade.</p>
        <Stamp
          label={data.label}
          asOf={data.asOf}
          attribution={data.attribution}
          delay={delayFor(snapshot.right, snapshot.delayMinutes)}
        />
      </div>
    </div>
  );
}

/** Without prices: the lines and when each is charged, with no amounts. */
function NoteLines() {
  return (
    <div className={e.noteCard} data-note="lines">
      <div className={e.noteHead}>
        <h3 className={e.h3}>What a contract note lists</h3>
        <p className={e.noteMeta}>Charges, and when each applies</p>
      </div>
      <div className={e.noteTableBox}>
        <table className={e.noteTable}>
          <caption className="sr-only">The charges on a contract note and when each applies</caption>
          <thead>
            <tr>
              <th scope="col">LINE</th>
              <th scope="col">CHARGED ON</th>
            </tr>
          </thead>
          <tbody>
            {LINES.map((l) => (
              <tr key={l.line}>
                <td>{l.line}</td>
                <td className={e.noteWhen}>{l.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={e.noteFoot}>
        <p>The app works out every charge on every trade, and the P&amp;L you see is after all of them.</p>
      </div>
    </div>
  );
}

/**
 * "How a trade works" (`#inside-the-app`, the hero's second button):
 * content.stage's three steps, numbered, each with its screenshot when the
 * owner has one (content first, SCREENS second), beside the contract note:
 * a real one on today's prices with the app's charges when the API has it
 * (the gate on), else the lines it lists and when each is charged. F5 gates
 * both. Server component.
 */
export function HowItWorks({
  content,
  snapshot,
  note,
}: {
  content: HomeContent['stage'];
  /** The snapshot with the gate on and the licence not OFF; null otherwise. */
  snapshot: Snapshot | null;
  /** getContractNote() with the gate on; null otherwise. */
  note: ContractNoteData | null;
}) {
  const steps = stageSteps(content.steps);
  const showNote = !!withFacts(['F5'], true, null);
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
          {showNote ? (
            snapshot && note?.data ? (
              <WorkedNoteCard note={note.data} data={note} snapshot={snapshot} />
            ) : (
              <NoteLines />
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
