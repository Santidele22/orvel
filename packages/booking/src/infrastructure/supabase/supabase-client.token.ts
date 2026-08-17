import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

// Single shared Supabase client for @orvel/booking infrastructure adapters.
// Provided once at the application root injector (apps/dashboard app.config.ts)
// via supabase-client.factory.ts; adapters receive it through DI, never by
// creating their own client.
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient>('SUPABASE_CLIENT');
