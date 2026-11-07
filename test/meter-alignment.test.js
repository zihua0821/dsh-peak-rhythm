// 和 dsh-meter（计价插件）的日历做一致性检查。
//
// 为什么要这条：我们的峰谷口径必须和「真实计价」一致，而真实计价是 dsh-meter 算的。
// 如果它更新了节假日表而我们没跟，这条测试会直接失败，而不是等到算错钱才发现。
//
// dsh-meter 没装时跳过（比如只装了 Aurabot 的机器）。

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { expandHolidays, HOLIDAYS } from '../calendar.mjs'

const CANDIDATES = [
  join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-meter', 'lib', 'index.js'),
  join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-meter', 'lib', 'index.js'),
]

const meterFile = CANDIDATES.find((p) => existsSync(p))

/** 从 dsh-meter 的打包产物里抠出 DEFAULT_CALENDARS.cn 的条目 */
export function extractMeterCalendar(source) {
  const m = /const DEFAULT_CALENDARS = \{\s*cn:\s*\[([\s\S]*?)\]\s*\}/.exec(source)
  if (!m) return null
  return [...m[1].matchAll(/"(\d{4}-\d{2}-\d{2}(?:\.\.\d{4}-\d{2}-\d{2})?)"/g)].map((x) => x[1])
}

test('日历：和 dsh-meter 的节假日表逐条对齐', { skip: !meterFile && '本机没装 dsh-meter，跳过' }, () => {
  const theirs = extractMeterCalendar(readFileSync(meterFile, 'utf8'))
  assert.ok(theirs, '在 dsh-meter 里找不到 DEFAULT_CALENDARS')

  const ours = Object.values(HOLIDAYS).flat()
  const oursSet = new Set(expandHolidays(ours))
  const theirsSet = new Set(expandHolidays(theirs))

  const missing = [...theirsSet].filter((d) => !oursSet.has(d))
  const extra = [...oursSet].filter((d) => !theirsSet.has(d))

  assert.deepEqual(missing, [], `计价插件里有、我们没有的放假日：${missing.join(', ')}`)
  assert.deepEqual(extra, [], `我们有、计价插件里没有的放假日：${extra.join(', ')}`)
})
