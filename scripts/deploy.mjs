// 把模块部署到 Aurabot 的模块目录。
//
// Aurabot 只认 %USERPROFILE%\.dsh\plugins-data\aurabot\modules\<id>\index.mjs，
// 而那个目录不在 git 里。所以这里：仓库是源码，部署目录是产物。
// 部署完 Aurabot 3 秒内自己热加载（日志出现「模块「峰谷节奏」…已启动」）。
//
// 用法：node scripts/deploy.mjs [--dry]

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const SRC = dirname(import.meta.dirname)
const DEST = join(homedir(), '.dsh', 'plugins-data', 'aurabot', 'modules', 'peak-rhythm')
const FILES = ['index.mjs', 'calendar.mjs']

const dry = process.argv.includes('--dry')

if (!existsSync(join(homedir(), '.dsh', 'plugins-data', 'aurabot'))) {
  console.error('找不到 Aurabot 的数据目录：本机没装 Aurabot？')
  process.exit(1)
}

let changed = 0
for (const file of FILES) {
  const from = join(SRC, file)
  const to = join(DEST, file)
  const same = existsSync(to) && statSync(from).size === statSync(to).size
    && readFileSync(from).equals(readFileSync(to))
  if (same) {
    console.log(`= ${file}：已是最新`)
    continue
  }
  if (!dry) {
    mkdirSync(DEST, { recursive: true })
    copyFileSync(from, to)
  }
  changed += 1
  console.log(`${dry ? '将写入' : '→'} ${file}：${to}`)
}

console.log(changed
  ? `\n${changed} 个文件${dry ? '待更新' : '已更新'}，Aurabot 会在 3 秒内热加载`
  : '\n全部一致，不用动')
