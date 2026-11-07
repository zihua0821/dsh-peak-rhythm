// 中国法定节假日日历（只列「放假/休息」的日子，不列调休补班）。
//
// 为什么要这么做：DeepSeek 对高峰时段的定义是
//   「北京时间周一至周五（**不含中国法定节假日**）9:00-12:00、14:00-18:00」
// 所以判定高峰只需要知道「哪天是放假日」，不需要「哪天上班」。
// 调休补班（周末变工作日）**不会**产生高峰——这条规则是按"周一到周五减节假日"写的，
// 而且 2026 年六个调休日都落在周末，本来也不是高峰。
//
// 数据来源（国务院办公厅）：
//   2025 — 国办发明电〔2024〕12号  https://www.gov.cn/zhengce/content/202411/content_6986382.htm
//   2026 — 国办发明电〔2025〕7号   https://www.gov.cn/zhengce/content/202511/content_7047090.htm
//
// **新的一年要手动加**：国务院一般在前一年 11 月发通知。
// 没覆盖到的年份按「工作日全算高峰」处理（等于不加节假日），并在 /峰谷 里提示。

/** 每年放假日：单个日期或闭区间 `YYYY-MM-DD..YYYY-MM-DD` */
export const HOLIDAYS = {
  2025: [
    '2025-01-01',
    '2025-01-28..2025-02-04', // 春节
    '2025-04-04..2025-04-06', // 清明
    '2025-05-01..2025-05-05', // 劳动节
    '2025-05-31..2025-06-02', // 端午
    '2025-10-01..2025-10-08', // 国庆 + 中秋
  ],
  2026: [
    '2026-01-01..2026-01-03', // 元旦
    '2026-02-15..2026-02-23', // 春节
    '2026-04-04..2026-04-06', // 清明
    '2026-05-01..2026-05-05', // 劳动节
    '2026-06-19..2026-06-21', // 端午
    '2026-09-25..2026-09-27', // 中秋
    '2026-10-01..2026-10-07', // 国庆
  ],
}

/** 覆盖到的年份（升序），用于提示「哪年还没发布」 */
export const CALENDAR_YEARS = Object.keys(HOLIDAYS).map(Number).sort()

const ENTRY = /^(\d{4})-(\d{2})-(\d{2})(?:\.\.(\d{4})-(\d{2})-(\d{2}))?$/

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * 把 `2025-01-28..2025-02-04` 这类写法展开成具体日期。
 * 非法条目直接抛错——日历读错会**静默**把高峰算错，宁可启动失败。
 */
export function expandHolidays(entries = []) {
  const out = new Set()
  for (const raw of entries) {
    const m = ENTRY.exec(String(raw).trim())
    if (!m) throw new Error(`节假日条目格式不对：${raw}`)
    const [y1, m1, d1] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const y2 = m[4] ? Number(m[4]) : y1
    const m2 = m[5] ? Number(m[5]) : m1
    const d2 = m[6] ? Number(m[6]) : d1
    const okMonth = (mm) => mm >= 1 && mm <= 12
    if (!okMonth(m1) || !okMonth(m2) || d1 < 1 || d1 > daysInMonth(y1, m1) || d2 < 1 || d2 > daysInMonth(y2, m2)) {
      throw new Error(`节假日条目不是真实日期：${raw}`)
    }
    let cur = Date.UTC(y1, m1 - 1, d1)
    const end = Date.UTC(y2, m2 - 1, d2)
    if (end < cur) throw new Error(`节假日区间反了：${raw}`)
    while (cur <= end) {
      const dt = new Date(cur)
      out.add(iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()))
      cur += 86_400_000
    }
  }
  return [...out].sort()
}

/** 所有年份展开成一个 Set，模块启动时算一次 */
export const HOLIDAY_SET = new Set(
  Object.values(HOLIDAYS).flatMap((list) => expandHolidays(list)),
)

export const isHoliday = (dateStr) => HOLIDAY_SET.has(dateStr)
export const hasYear = (year) => CALENDAR_YEARS.includes(Number(year))
