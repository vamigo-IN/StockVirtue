import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import { SITE } from '@/lib/site';
import { LoginForm } from './LoginForm';

export default async function AdminLoginPage() {
  if (await isAuthed()) redirect('/admin/dashboard');
  return (
    <div className="admin-login">
      <div className="admin-card">
        <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Admin sign-in</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Manage {SITE.name} website settings &amp; code injection.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
