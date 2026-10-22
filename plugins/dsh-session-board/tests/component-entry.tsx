/**
 * Component-test entry point. Uses the real plugin components and the same
 * React 18 runtime as DSH; esbuild supplies only test-time resolution aliases.
 */
import { createRoot } from 'react-dom/client'
import { BoardList } from '../src/client/BoardList.tsx'
import { BoardFilterBar } from '../src/client/BoardFilterBar.tsx'
import { SessionCard } from '../src/client/SessionCard.tsx'
import { BoardOverlay } from '../src/client/BoardOverlay.tsx'
import { BatchToolbar } from '../src/client/BatchToolbar.tsx'
import { BatchController } from '../src/client/batch.ts'
import { SessionBoardSettingsPage } from '../src/client/SettingsPage.tsx'
import { en } from '../src/client/locales.ts'
import { buildEntry } from '../src/shared/board.ts'
import { DEFAULT_WIKI_CONFIG, wikiDefaults } from '../src/shared/wiki.ts'

const t = (key: string, args?: Record<string, string | number>) => {
  const template = (en as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(args?.[name] ?? match))
}
export { BoardList, BoardFilterBar, createRoot, SessionCard, BoardOverlay, BatchToolbar, BatchController, SessionBoardSettingsPage, buildEntry, DEFAULT_WIKI_CONFIG, wikiDefaults, t }
