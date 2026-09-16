#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { install } = require('../src/server-side-bot-installer')

function parseArgs (values) {
  const options = {}
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith('--') || values[index + 1] === undefined) throw new Error(`Invalid argument: ${values[index]}`)
    options[values[index].slice(2)] = values[index + 1]
  }
  return options
}

async function main () {
  const options = parseArgs(process.argv.slice(2))
  const root = path.resolve(__dirname, '..')
  const result = await install({
    serverDirectory: options['server-dir'] || path.resolve(root, '..', 'server', 'current'),
    packSource: path.join(root, 'server-side-bot', 'behavior-pack')
  })
  process.stdout.write(`${JSON.stringify({ event: 'server_side_bot_installed', ...result })}\n`)
  process.stdout.write('Start BDS, then use: scriptevent ownerbot:spawn LocalOwnerBot\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
