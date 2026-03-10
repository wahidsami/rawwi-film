import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isProd = import.meta.env.PROD;

function readJwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and set values.';
  if (isProd) {
    throw new Error(msg);
  }
  console.warn(msg);
}

if (supabaseAnonKey) {
  const role = readJwtRole(supabaseAnonKey);
  // Frontend must only receive publishable/anon key. Never service role.
  if (role === 'service_role') {
    throw new Error('[Supabase] VITE_SUPABASE_ANON_KEY is a service_role key. This must never be exposed to frontend.');
  }
  if (isProd && role && role !== 'anon') {
    throw new Error(`[Supabase] Unexpected frontend key role "${role}". Expected anon key in production.`);
  }
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
