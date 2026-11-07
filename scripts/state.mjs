// 命令行看当前峰谷状态（不开 QQ 也能确认）。
//
// 用法：
//   node scripts/state.mjs            看现在
//   node scripts/state.mjs 2026-10-01 看某天（按当天 10:00 和 15:00 各算一次）

import { stateAt, beijingClock, parseWindows, HOLIDAYS, CALENDAR_YEARS } from '../index.mjs'

const arg = process.argv[2]
const show = (label, ms) => {
  const st = stateAt(ms)
  const { year, month, day, hour, weekday } = beijingClock(ms)
  const wd = '日一二三四五六'[weekday]
  console.log(`${label}　${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00（周${wd}）`)
  console.log(`   → ${st.peak ? '高峰' : '空闲'}：${st.why}${st.holiday ? `　放假日 ${st.holiday}` : ''}`)
  void ms
}

if (arg) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(arg)
  if (!m) {
    console.error('日期格式要 YYYY-MM-DD')
    process.exit(1)
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  show('10:00', Date.UTC(y, mo - 1, d, 2))  // 北京 10:00 = UTC 02:00
  show('15:00', Date.UTC(y, mo - 1, d, 7))  // 北京 15:00 = UTC 07:00
} else {
  show('现在', Date.now())
}

console.log('')
console.log(`高峰时段：${parseWindows().map(([a, b]) => `${a}-${b}`).join('、')}（工作日，北京时间，不含法定节假日）`)
console.log(`节假日表：${CALENDAR_YEARS.map((y) => `${y} 年 ${HOLIDAYS[y].length} 段`).join('，')}`)
const thisYear = beijingClock().year
if (!CALENDAR_YEARS.includes(thisYear)) {
  console.log(`⚠ ${thisYear} 年的节假日表还没加，当前按普通工作日算（新通知发布后请更新 calendar.mjs）`)
}
