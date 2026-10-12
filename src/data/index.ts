import type { TripRepository } from './repository'
import { DemoRepo } from './demoRepo'
import { SupabaseRepo } from './supabaseRepo'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const repo: TripRepository = url && anonKey ? new SupabaseRepo(url, anonKey) : new DemoRepo()

export const isDemo = repo.mode === 'demo'

/** 開一趟示範旅程並回傳 id；非 Demo 模式回 null */
export function createDemoTrip(): string | null {
  return repo instanceof DemoRepo ? repo.createDemoTrip() : null
}
