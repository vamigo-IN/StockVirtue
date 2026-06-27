'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { login, logout, isAuthed } from '@/lib/auth';
import { saveSettings, type SiteSettings } from '@/lib/settings';

export interface FormState {
  ok: boolean;
  message: string;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ok = await login(String(formData.get('password') || ''));
  if (!ok) return { ok: false, message: 'Incorrect password.' };
  redirect('/admin/dashboard');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/admin');
}

export async function saveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthed())) {
    return { ok: false, message: 'Your session expired. Please sign in again.' };
  }
  const str = (k: string) => String(formData.get(k) || '').trim();
  const settings: SiteSettings = {
    siteTitle: str('siteTitle'),
    siteDescription: str('siteDescription'),
    contactEmail: str('contactEmail'),
    playStoreUrl: str('playStoreUrl'),
    social: {
      twitter: str('twitter'),
      instagram: str('instagram'),
      linkedin: str('linkedin'),
      youtube: str('youtube'),
      facebook: str('facebook'),
    },
    headCode: String(formData.get('headCode') || ''),
    bodyStartCode: String(formData.get('bodyStartCode') || ''),
    bodyEndCode: String(formData.get('bodyEndCode') || ''),
  };
  const res = await saveSettings(settings);
  if (!res.ok) {
    return {
      ok: false,
      message: `Couldn't save to the backend${res.error ? ` (${res.error})` : ''}. Check API_BASE / SITE_ADMIN_KEY.`,
    };
  }
  // Refresh the cached settings used across the public site.
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Settings saved and published.' };
}
