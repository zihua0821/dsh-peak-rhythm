// 峰谷节奏：状态判定 + 群聊门控。
//
// 测试必须跑在任何时刻都稳定，所以时间相关的判定全部用固定时间戳，
// 不依赖"现在几点""今天周几"。

import test from 'node:test'
import assert from 'node:assert/strict'

const mod = (await import('../index.mjs')).default
const { parseWindows, beijingClock, stateAt, decideGroup, ruleText, expandHolidays, HOLIDAYS, CALENDAR_YEARS, isHoliday } =
  await import('../index.mjs')

/** 北京时间 → 时间戳（UTC = 北京 - 8h） */
const bj = (y, m, d, hh, mm = 0) => Date.UTC(y, m - 1, d, hh - 8, mm)

// 2026-11-09 周一；2026-11-07 周六；2026-10-01 国庆（周四）
const MON_10 = bj(2026, 11, 9, 10)
const MON_13 = bj(2026, 11, 9, 13)
const SAT_10 = bj(2026, 11, 7, 10)
const HOLIDAY_10 = bj(2026, 10, 1, 10) // 国庆，周四

// ---------- 时间 ----------

test('时间：周一 10:00 高峰，12:00 出峰，14:00 再进，18:00 出峰', () => {
  assert.equal(stateAt(MON_10).peak, true)
  assert.equal(stateAt(bj(2026, 11, 9, 11, 59)).peak, true)
  assert.equal(stateAt(bj(2026, 11, 9, 12)).peak, false)
  assert.equal(stateAt(MON_13).peak, false)
  assert.equal(stateAt(bj(2026, 11, 9, 14)).peak, true)
  assert.equal(stateAt(bj(2026, 11, 9, 17, 59)).peak, true)
  assert.equal(stateAt(bj(2026, 11, 9, 18)).peak, false)
})

test('时间：周末整天算空闲', () => {
  assert.equal(stateAt(SAT_10).peak, false)
  assert.equal(stateAt(bj(2026, 11, 8, 15)).peak, false, '周日 15:00')
})

test('节假日：国庆当天（周四 10:00）算空闲，并说明原因', () => {
  const st = stateAt(HOLIDAY_10)
  assert.equal(st.peak, false)
  assert.match(st.why, /法定节假日/)
  assert.equal(st.holiday, '2026-10-01')
})

test('节假日：春节、清明、劳动节、中秋都在表里', () => {
  for (const d of ['2026-02-16', '2026-04-06', '2026-05-04', '2026-09-26', '2025-01-29', '2025-10-05']) {
    assert.ok(isHoliday(d), `${d} 应该是放假日`)
  }
  assert.ok(!isHoliday('2026-03-16'), '平常日子不是放假日')
})

test('节假日：区间展开包含首尾两天', () => {
  const days = expandHolidays(['2026-01-01..2026-01-03'])
  assert.deepEqual(days, ['2026-01-01', '2026-01-02', '2026-01-03'])
})

test('节假日：非法条目直接报错（日历读错不能静默）', () => {
  assert.throws(() => expandHolidays(['2026-02-30']), /真实日期/)
  assert.throws(() => expandHolidays(['2026-13-01']), /真实日期/)
  assert.throws(() => expandHolidays(['乱写']), /格式/)
  assert.throws(() => expandHolidays(['2026-05-05..2026-05-01']), /反了/)
})

test('节假日表覆盖 2025、2026；未覆盖年份按普通工作日算并给出提示', () => {
  assert.deepEqual(CALENDAR_YEARS, [2025, 2026])
  assert.ok(HOLIDAYS[2026].length >= 7)
  const st = stateAt(bj(2030, 3, 5, 10)) // 2030-03-05 周二 10:00，无日历
  assert.equal(st.peak, true, '没有日历的年份，工作日仍算高峰')
  assert.equal(st.unknownYear, undefined, '高峰分支不带 unknownYear')
  const off = stateAt(bj(2030, 3, 5, 13))
  assert.equal(off.peak, false)
  assert.equal(off.unknownYear, 2030, '非高峰时提示该年日历缺失')
})

test('时间换算：UTC 01:00 = 北京 09:00 周一', () => {
  const c = beijingClock(Date.UTC(2026, 10, 9, 1, 0))
  assert.equal(c.hour, 9)
  assert.equal(c.weekday, 1)
})

test('时段解析：多种分隔符都能认，非法值回落默认', () => {
  assert.deepEqual(parseWindows('9-12,14-18'), [[9, 12], [14, 18]])
  assert.deepEqual(parseWindows('9~12；14到18'), [[9, 12], [14, 18]])
  assert.deepEqual(parseWindows('乱写的'), [[9, 12], [14, 18]])
  assert.deepEqual(parseWindows(''), [[9, 12], [14, 18]])
})

// ---------- 门控 ----------

test('门控：高峰时「本来要回」被压下来', () => {
  const out = decideGroup({ reply: true, mode: 'interject' }, { ms: MON_10, peakKeep: 0, rand: () => 0.99 })
  assert.equal(out.reply, false)
  assert.match(out.reason, /高峰/)
})

test('门控：高峰按保留率放行', () => {
  assert.equal(decideGroup({ reply: true }, { ms: MON_10, peakKeep: 100, rand: () => 0.99 }), undefined)
  assert.equal(decideGroup({ reply: true }, { ms: MON_10, peakKeep: 30, rand: () => 0.1 }), undefined)
  assert.equal(decideGroup({ reply: true }, { ms: MON_10, peakKeep: 30, rand: () => 0.5 }).reply, false)
})

test('门控：高峰时被 @ 不压', () => {
  assert.equal(decideGroup({ reply: true, mode: 'must' }, { ms: MON_10, peakKeep: 0, rand: () => 0.99 }), undefined)
})

test('门控：空闲时「本来不回」按概率插话', () => {
  const hit = decideGroup({ reply: false }, { ms: MON_13, offpeakInterject: 100, rand: () => 0.5 })
  assert.equal(hit.reply, true)
  assert.equal(hit.mode, 'interject')
  assert.equal(decideGroup({ reply: false }, { ms: MON_13, offpeakInterject: 10, rand: () => 0.5 }), undefined)
})

test('门控：节假日按空闲处理（国庆 10:00 允许插话）', () => {
  const out = decideGroup({ reply: false }, { ms: HOLIDAY_10, offpeakInterject: 100, rand: () => 0.5 })
  assert.equal(out.reply, true)
})

test('门控：周末按空闲处理', () => {
  const out = decideGroup({ reply: false }, { ms: SAT_10, offpeakInterject: 100, rand: () => 0.5 })
  assert.equal(out.reply, true)
})

test('门控：关掉开关就完全不干预', () => {
  assert.equal(decideGroup({ reply: true }, { ms: MON_10, enabled: false, peakKeep: 0, rand: () => 0.99 }), undefined)
  assert.equal(decideGroup({ reply: false }, { ms: MON_13, enabled: false, offpeakInterject: 100, rand: () => 0.5 }), undefined)
})

test('规则：高峰多一句「少接话」，空闲不加', () => {
  assert.match(ruleText({}, MON_10), /高峰/)
  assert.equal(ruleText({}, MON_13), '')
  assert.equal(ruleText({}, HOLIDAY_10), '', '节假日不算高峰，不加这句')
})

// ---------- 接线 ----------

function fakeApi(over = {}) {
  const handlers = {}
  const logs = []
  const commands = {}
  const state = { rules: '' }
  return {
    handlers,
    logs,
    commands,
    get rules() { return state.rules },
    api: {
      settings: () => ({ ...mod.defaults, ...over }),
      log: {
        info: (...a) => logs.push(['info', a.join(' ')]),
        debug: (...a) => logs.push(['debug', a.join(' ')]),
        warn: (...a) => logs.push(['warn', a.join(' ')]),
        error: (...a) => logs.push(['error', a.join(' ')]),
      },
      on: (name, fn) => { handlers[name] = fn },
      rule: (fn) => { state.rules = fn() },
      command: (def) => { commands[def.name] = def },
    },
  }
}

test('接线：group/decide 挂上了', () => {
  const { api, handlers } = fakeApi()
  mod.setup(api)
  assert.equal(typeof handlers['group/decide'], 'function')
})

test('接线：/峰谷 报出状态、参数和日历覆盖', async () => {
  const { api, commands } = fakeApi({ peakKeep: 20, offpeakInterject: 15, windows: '9-12,14-18' })
  mod.setup(api)
  const text = await commands['峰谷'].run()
  assert.match(text, /高峰时段：9-12,14-18/)
  assert.match(text, /高峰保留回复：20%/)
  assert.match(text, /空闲主动插话：15%/)
  assert.match(text, /节假日表覆盖：2025、2026/)
})

test('模块定义：id/名字/参数', () => {
  assert.equal(mod.id, 'peak-rhythm')
  assert.equal(mod.name, '峰谷节奏')
  assert.equal(mod.api, 1)
  assert.deepEqual(mod.settings.map((s) => s.key).sort(), ['enabled', 'offpeakInterject', 'peakKeep', 'windows'])
})
