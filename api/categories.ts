import type { CategoryEdit } from '../src/types'
import { handle, HttpError, json, readJson } from './_lib/http.js'
import { requireOwner } from './_lib/owner.js'
import { CATEGORIES, redis } from './_lib/store.js'

function isEdit(value: unknown): value is CategoryEdit {
  const item = value as CategoryEdit
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.key === 'string' &&
    /^[a-z0-9-]{2,60}$/.test(item.key) &&
    typeof item.label === 'string' &&
    item.label.trim().length > 0 &&
    item.label.length <= 40 &&
    typeof item.icon === 'string' &&
    item.icon.length > 0 &&
    item.icon.length <= 16 &&
    typeof item.spending === 'boolean'
  )
}

/** PUT /api/categories { categories }: the categories changed or added by hand, all of them at once. */
export function PUT(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const { categories } = await readJson(request)
    if (!Array.isArray(categories) || categories.length > 100 || !categories.every(isEdit)) {
      throw new HttpError(400, 'Expected a list of categories')
    }
    await redis().set(
      CATEGORIES,
      categories.map(({ key, label, icon, spending }) => ({ key, label: label.trim(), icon: icon.trim(), spending })),
    )
    return json({ ok: true })
  })
}
