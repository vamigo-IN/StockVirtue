import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { logoutAction } from '../actions';
import { SettingsForm } from './SettingsForm';

export default async function DashboardPage() {
  if (!(await isAuthed())) redirect('/admin');
  const settings = await getSettings();
  return (
    <div className="admin-wrap">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.6rem', margin: 0 }}>Website settings</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Edit public site info and inject verification / analytics code.
          </p>
        </div>
        <form action={logoutAction}>
          <button className="btn btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
