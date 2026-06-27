'use client';

import { useActionState } from 'react';
import { loginAction, type FormState } from './actions';

const INITIAL: FormState = { ok: false, message: '' };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  return (
    <form action={action}>
      {state.message && (
        <div className="alert alert-err" role="alert">
          {state.message}
        </div>
      )}
      <div className="field">
        <label htmlFor="password">Admin password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          autoFocus
        />
      </div>
      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending}
        style={{ width: '100%' }}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
