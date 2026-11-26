#!/usr/bin/env node
// Post-deploy verification for the Earn entities (read-only: GraphQL queries and eth_call / eth_getLogs, no tx).
//
// Usage:
//   node scripts/verify-earn.mjs --config-only
//   SUBGRAPH_URL=https://.../subgraphs/name/... RPC_URL=<archive RPC> node scripts/verify-earn.mjs [--logs]
//
// Checks
//   C0  networks.json base-sepolia KittycornBank address == chains.ts BASE_SEPOLIA_KITTYCORN_BANK_ADDRESS (offline)
//   V1  per vault at the subgraph block: tToken.bank() == EarnVault.bank, asset() == underlying,
//       totalSupply() == totalSupply, sum(position.shares) == earnShares, earnShares + protocolShares == totalSupply
//   P1  per position: tToken.balanceOf(user) at the subgraph block == shares
//   E1  per position: EarnEvent rows per type == the position counters, and their summed assets == the position sums
//   L1  (--logs) per non-excluded owner: sum of on-chain Deposit / Withdraw assets == deposited / withdrawn
//       (independent of the handlers: raw logs from the RPC, chunked by LOG_CHUNK blocks, default 10000)
// Exit code 1 if any check fails.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const SUBGRAPH_URL = process.env.SUBGRAPH_URL
const RPC_URL = process.env.RPC_URL
const LOG_CHUNK = BigInt(process.env.LOG_CHUNK || '10000')

const TOPIC_DEPOSIT = '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7'
const TOPIC_WITHDRAW = '0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db'
const SEL = {
  bank: '0x76cdb03b',
  asset: '0x38d52e0f',
  totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231',
}

let failures = 0
const fail = (id, msg) => {
  failures++
  console.log(`FAIL ${id} ${msg}`)
}
const ok = (id, msg) => console.log(`ok   ${id} ${msg}`)

function checkConfig() {
  const networks = JSON.parse(readFileSync(join(ROOT, 'networks.json'), 'utf8'))
  const manifestBank = networks['base-sepolia'].KittycornBank.address.toLowerCase()
  const chains = readFileSync(join(ROOT, 'src/utils/chains.ts'), 'utf8')
  const match = chains.match(/BASE_SEPOLIA_KITTYCORN_BANK_ADDRESS\s*=\s*'(0x[0-9a-fA-F]{40})'/)
  if (!match) return fail('C0', 'BASE_SEPOLIA_KITTYCORN_BANK_ADDRESS not found in chains.ts')
  const codeBank = match[1].toLowerCase()
  if (manifestBank !== codeBank) fail('C0', `networks.json Bank ${manifestBank} != chains.ts Bank ${codeBank}`)
  else ok('C0', `Bank ${codeBank} (startBlock ${networks['base-sepolia'].KittycornBank.startBlock}) in both files`)
}

async function gql(query, variables = {}) {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json()
  if (body.errors) throw new Error(JSON.stringify(body.errors))
  return body.data
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    const body = await res.json()
    if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`)
    return body.result
  }
}

const word = (hex) => hex.replace(/^0x/, '').padStart(64, '0')
const toHex = (n) => '0x' + BigInt(n).toString(16)
const asAddress = (result) => '0x' + result.slice(-40).toLowerCase()
async function call(to, data, block) {
  return rpc('eth_call', [{ to, data }, toHex(block)])
}

// paginate a top-level collection by id
async function all(entity, fields, where = '') {
  const rows = []
  let last = ''
  for (;;) {
    const data = await gql(
      `query($last: String!, $block: Int!) { rows: ${entity}(first: 1000, orderBy: id, where: { id_gt: $last ${where} },
        block: { number: $block }) { ${fields} } }`,
      { last, block: Number(BLOCK) },
    )
    rows.push(...data.rows)
    if (data.rows.length < 1000) return rows
    last = data.rows[data.rows.length - 1].id
  }
}

let BLOCK

async function main() {
  checkConfig()
  if (args.has('--config-only')) return
  if (!SUBGRAPH_URL || !RPC_URL) throw new Error('set SUBGRAPH_URL and RPC_URL (archive), or pass --config-only')

  BLOCK = BigInt((await gql('{ _meta { block { number } hasIndexingErrors } }'))._meta.block.number)
  console.log(`subgraph block ${BLOCK}`)

  const vaults = await all(
    'earnVaults',
    'id bank underlying symbol decimals isActive configuredAtBlock totalSupply earnShares protocolShares',
  )
  const positions = await all(
    'earnPositions',
    `id user vault { id } shares deposited withdrawn transferredIn transferredOut
     depositCount withdrawCount transferInCount transferOutCount`,
  )
  console.log(`${vaults.length} vaults, ${positions.length} positions`)

  for (const v of vaults) {
    const bank = asAddress(await call(v.id, SEL.bank, BLOCK))
    const asset = asAddress(await call(v.id, SEL.asset, BLOCK))
    const supply = BigInt(await call(v.id, SEL.totalSupply, BLOCK))
    const own = positions.filter((p) => p.vault.id === v.id)
    const sumShares = own.reduce((s, p) => s + BigInt(p.shares), 0n)
    const label = `${v.symbol} ${v.id}`
    if (bank !== v.bank.toLowerCase()) fail('V1', `${label} bank() ${bank} != ${v.bank}`)
    if (asset !== v.underlying.toLowerCase()) fail('V1', `${label} asset() ${asset} != ${v.underlying}`)
    if (supply !== BigInt(v.totalSupply)) fail('V1', `${label} totalSupply() ${supply} != ${v.totalSupply}`)
    if (sumShares !== BigInt(v.earnShares)) fail('V1', `${label} sum(position.shares) ${sumShares} != ${v.earnShares}`)
    if (BigInt(v.earnShares) + BigInt(v.protocolShares) !== BigInt(v.totalSupply))
      fail('V1', `${label} earnShares + protocolShares != totalSupply`)
    ok('V1', `${label} checked (supply ${supply}, earnShares ${v.earnShares}, ${own.length} positions)`)
  }

  for (const p of positions) {
    const balance = BigInt(await call(p.vault.id, SEL.balanceOf + word(p.user), BLOCK))
    if (balance !== BigInt(p.shares)) fail('P1', `${p.id} balanceOf ${balance} != shares ${p.shares}`)

    const events = await all('earnEvents', 'id type assets', `, position: "${p.id}"`)
    const byType = { DEPOSIT: [0, 0n], WITHDRAW: [0, 0n], TRANSFER_IN: [0, 0n], TRANSFER_OUT: [0, 0n] }
    for (const e of events) {
      byType[e.type][0]++
      byType[e.type][1] += BigInt(e.assets)
    }
    const expect = [
      ['DEPOSIT', p.depositCount, p.deposited],
      ['WITHDRAW', p.withdrawCount, p.withdrawn],
      ['TRANSFER_IN', p.transferInCount, p.transferredIn],
      ['TRANSFER_OUT', p.transferOutCount, p.transferredOut],
    ]
    for (const [type, count, sum] of expect) {
      if (byType[type][0] !== Number(count) || byType[type][1] !== BigInt(sum))
        fail('E1', `${p.id} ${type}: rows ${byType[type][0]}/${byType[type][1]} != position ${count}/${sum}`)
    }
  }
  ok('P1/E1', `${positions.length} positions checked`)

  if (args.has('--logs')) {
    for (const v of vaults) {
      const sums = new Map() // owner -> [deposited, withdrawn]
      for (let from = BigInt(v.configuredAtBlock); from <= BLOCK; from += LOG_CHUNK) {
        const to = from + LOG_CHUNK - 1n < BLOCK ? from + LOG_CHUNK - 1n : BLOCK
        const logs = await rpc('eth_getLogs', [
          { address: v.id, fromBlock: toHex(from), toBlock: toHex(to), topics: [[TOPIC_DEPOSIT, TOPIC_WITHDRAW]] },
        ])
        for (const log of logs) {
          const isDeposit = log.topics[0] === TOPIC_DEPOSIT
          // Deposit(sender, owner, assets, shares): owner = topic2; Withdraw(sender, receiver, owner, ...): topic3
          const owner = asAddress(isDeposit ? log.topics[2] : log.topics[3])
          const assets = BigInt('0x' + log.data.slice(2, 66))
          const entry = sums.get(owner) || [0n, 0n]
          entry[isDeposit ? 0 : 1] += assets
          sums.set(owner, entry)
        }
      }
      for (const p of positions.filter((x) => x.vault.id === v.id)) {
        const [deposited, withdrawn] = sums.get(p.user.toLowerCase()) || [0n, 0n]
        if (deposited !== BigInt(p.deposited)) fail('L1', `${p.id} logs deposited ${deposited} != ${p.deposited}`)
        if (withdrawn !== BigInt(p.withdrawn)) fail('L1', `${p.id} logs withdrawn ${withdrawn} != ${p.withdrawn}`)
      }
      // owners with Deposit/Withdraw logs but no position must be excluded addresses
      const tracked = new Set(positions.filter((x) => x.vault.id === v.id).map((x) => x.user.toLowerCase()))
      const untracked = [...sums.keys()].filter((o) => !tracked.has(o))
      ok('L1', `${v.symbol}: ${sums.size} owners in logs, untracked (expected excluded): ${untracked.join(', ') || '-'}`)
    }
  }
}

main()
  .then(() => {
    console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
