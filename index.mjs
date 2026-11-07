// 峰谷节奏：DeepSeek 高峰时段少说话、空闲时段活跃一点。
//
// 这是 **Aurabot 的独立模块**，不依赖任何其他插件。
//
// 峰谷规则和 dsh-meter（计价插件）完全对齐：
//   - 高峰 = 北京时间 周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00
//   - 其余时间（含周末整天、法定节假日整天）= 空闲，官方半价
//   - 调休补班日不算高峰（规则是"周一到周五减节假日"，不是"工作日"）
//
// 干预点只有一个：`group/decide`——群里"这条回不回"的最终决定。
//   - 高峰：本来要回 → 按概率压下来（安静）
//   - 空闲：本来不回 → 按概率插一句（活跃）
// 私聊、被 @（mode=must）一律不干预：那是该回的话。

import { HOLIDAYS, CALENDAR_YEARS, expandHolidays, hasYear, isHoliday } from './calendar.mjs'

export { HOLIDAYS, CALENDAR_YEARS, expandHolidays, isHoliday, hasYear }

const DEFAULT_WINDOWS = '9-12,14-18'

/** 解析 "9-12,14-18" → [[9,12],[14,18]]；非法值回落到默认 */
export function parseWindows(text) {
  const out = []
  for (const part of String(text || '').split(/[,，;；]+/)) {
    const m = /^\s*(\d{1,2})\s*[-~到]\s*(\d{1,2})\s*$/.exec(part)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2])
    if (a >= 0 && a < 24 && b > a && b <= 24) out.push([a, b])
  }
  return out.length ? out : parseWindows(DEFAULT_WINDOWS)
}

/** 北京时间（UTC+8，无夏令时）的年月日、小时、星期 */
export function beijingClock(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600_000)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(), // 0 = 周日
  }
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * 判断某一刻是不是高峰（含节假日）。
 * @returns {{peak: boolean, why: string, holiday?: string, unknownYear?: number}}
 */
export function stateAt(ms = Date.now(), windows = parseWindows(DEFAULT_WINDOWS)) {
  const { year, month, day, hour, weekday } = beijingClock(ms)
  const dateStr = `${year}-${pad(month)}-${pad(day)}`
  const weekend = weekday === 0 || weekday === 6

  // 法定节假日：整天算空闲（哪怕落在周一到周五）
  if (isHoliday(dateStr)) return { peak: false, why: `法定节假日（${dateStr}）`, holiday: dateStr }
  if (weekend) return { peak: false, why: '周末，空闲时段' }

  for (const [a, b] of windows) {
    if (hour >= a && hour < b) return { peak: true, why: `工作日 ${a}:00-${b}:00 高峰` }
  }
  // 该年的节假日表还没发布：工作日照旧算高峰，但要把这件事说出来
  if (!hasYear(year)) return { peak: false, why: `工作日非高峰（${year} 年节假日表未发布）`, unknownYear: year }
  return { peak: false, why: '工作日非高峰，空闲时段' }
}

/**
 * 群消息门控（纯函数，方便测试）。
 * @param {{reply?: boolean, mode?: string}} decision
 * @param {{enabled?: boolean, windows?: string, peakKeep?: number, offpeakInterject?: number, ms?: number, rand?: () => number}} opts
 * @returns {object|undefined} 要覆盖的决定；undefined = 不干预
 */
export function decideGroup(decision, opts = {}) {
  if (!decision) return undefined
  if (opts.enabled === false) return undefined
  if (decision.mode === 'must') return undefined

  const st = stateAt(opts.ms ?? Date.now(), parseWindows(opts.windows))
  const roll = (opts.rand ?? Math.random)()

  if (st.peak) {
    if (!decision.reply) return undefined
    const keep = Math.max(0, Math.min(100, Number(opts.peakKeep))) / 100
    if (roll < keep) return undefined
    return { reply: false, reason: '高峰时段，安静', why: st.why }
  }

  if (decision.reply) return undefined
  const rate = Math.max(0, Math.min(100, Number(opts.offpeakInterject))) / 100
  if (!(roll < rate)) return undefined
  return { reply: true, mode: 'interject', reason: '空闲时段，主动一点', why: st.why }
}

/** 高峰时给她的规则里多一句话（纯函数） */
export function ruleText(opts = {}, ms = Date.now()) {
  const st = stateAt(ms, parseWindows(opts.windows))
  if (!st.peak) return ''
  return '现在是 DeepSeek 的高峰时段，你已经把群里的插话压得很低；别人没叫你时，能不接话就不接。'
}

export default {
  id: 'peak-rhythm',
  name: '峰谷节奏',
  api: 1,
  description: 'DeepSeek 高峰时段少说话、空闲时段活跃一点（含法定节假日，和计价插件同口径）',
  defaults: {
    enabled: true,
    peakKeep: 20,         // 高峰时保留回复的百分比
    offpeakInterject: 15, // 空闲时对「本来不回」的消息插话的百分比
    windows: DEFAULT_WINDOWS,
  },
  settings: [
    { key: 'enabled', label: '启用峰谷节奏', type: 'switch', hint: '关掉就完全按原来的逻辑回话' },
    { key: 'peakKeep', label: '高峰时保留回复（%）', type: 'number', min: 0, max: 100, step: 5, hint: '0 = 高峰完全不回（被 @ 和私聊除外），100 = 不受影响' },
    { key: 'offpeakInterject', label: '空闲时主动插话（%）', type: 'number', min: 0, max: 100, step: 5, hint: '对「本来判定不回」的群消息额外插话的概率，0 = 不主动' },
    { key: 'windows', label: '高峰时段', type: 'text', placeholder: '9-12,14-18', hint: '按北京时间、工作日生效；格式如 9-12,14-18。周末和法定节假日整天算空闲' },
  ],

  setup(api) {
    const log = api.log
    const s = () => ({ ...api.settings() })

    api.rule(() => ruleText(s()))

    api.on('group/decide', (decision) => {
      const cfg = s()
      const out = decideGroup(decision, { ...cfg })
      if (!out) return undefined
      log.info(`${out.reason}（${out.why}）`)
      const { why, ...override } = out
      return override
    })

    api.command({
      name: '峰谷',
      description: '看当前峰谷状态、节假日表和本模块参数',
      run: async () => {
        const cfg = s()
        const st = stateAt(Date.now(), parseWindows(cfg.windows))
        const thisYear = beijingClock().year
        const lines = [
          `现在：${st.peak ? '**高峰**' : '空闲（低谷）'} —— ${st.why}`,
          `高峰保留回复：${cfg.peakKeep}%　空闲主动插话：${cfg.offpeakInterject}%`,
          `高峰时段：${cfg.windows}（工作日，北京时间；不含法定节假日）　开关：${cfg.enabled === false ? '关' : '开'}`,
          `节假日表覆盖：${CALENDAR_YEARS.join('、')} 年${hasYear(thisYear) ? '' : `（**${thisYear} 年还没发布，暂按普通工作日算**）`}`,
          st.peak ? '（现在她会尽量少说话）' : '（现在她比高峰时活跃）',
        ]
        return lines.join('\n')
      },
    })

    // 给测试和排查用
    return {
      stateAt: (ms) => stateAt(ms, parseWindows(s().windows)),
      current: () => stateAt(Date.now(), parseWindows(s().windows)),
    }
  },
}
