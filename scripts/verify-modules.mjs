import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const catalog = readFileSync(new URL('../src/lib/modules.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/components/DataModule.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const required = ['inventory', 'crm', 'tasks', 'content', 'pricing', 'orders', 'payments', 'payroll', 'delivery', 'afterSales']

for (const id of required) {
  assert.match(catalog, new RegExp(`\\b${id}:\\{table:`), `${id} must have a Supabase table configuration`)
  assert.match(app, new RegExp(`['"]${id}['"]`), `${id} must be reachable from the sidebar`)
}

for (const workflow of [".select('*')", '.insert(clean)', '.update(clean)', ".delete().eq('id'", 'setViewing(row)', 'setEditing(row)']) {
  assert.ok(page.includes(workflow), `shared operational page is missing workflow: ${workflow}`)
}

assert.doesNotMatch(app + page, /configure first|Configurer la première|ModulePage|placeholder page/i)
console.log(`Verified ${required.length} operational sidebar modules with list, create, view, edit and delete wiring.`)
