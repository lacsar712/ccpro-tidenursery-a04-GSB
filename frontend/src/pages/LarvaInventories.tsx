import { FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Hatchery, LarvaInventory, Pond, ReconcileResult } from '../types'

// 盘点日按东八区日历日切分
function todayUtc8() {
  const d = new Date()
  const utc8 = new Date(d.getTime() + (d.getTimezoneOffset() + 8 * 60) * 60000)
  return utc8.toISOString().slice(0, 10)
}

const empty = {
  pondId: 0,
  countDate: todayUtc8(),
  countA: 0,
  countB: 0,
  notes: '',
}

type EditState = {
  id: number
  countA: number
  countB: number
  notes: string
}

export default function LarvaInventories() {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [hatcheries, setHatcheries] = useState<Hatchery[]>([])
  const [rows, setRows] = useState<LarvaInventory[]>([])
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [error, setError] = useState('')
  const [reconMsgs, setReconMsgs] = useState<Record<number, { ok: boolean; text: string }>>({})

  async function load() {
    const [ps, hs, inv] = await Promise.all([
      api<Pond[]>('/api/ponds'),
      api<Hatchery[]>('/api/hatcheries'),
      api<LarvaInventory[]>('/api/larva-inventories'),
    ])
    setPonds(ps)
    setHatcheries(hs)
    setRows(inv)
    if (!form.pondId && ps[0]) {
      setForm((f) => ({ ...f, pondId: ps[0].id }))
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api('/api/larva-inventories', {
        method: 'POST',
        body: JSON.stringify({ ...form, notes: form.notes || null }),
      })
      setForm((f) => ({ ...empty, pondId: f.pondId, countDate: todayUtc8() }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  function startEdit(r: LarvaInventory) {
    setEditing({ id: r.id, countA: r.countA, countB: r.countB, notes: r.notes || '' })
  }

  async function saveEdit() {
    if (!editing) return
    setError('')
    try {
      await api(`/api/larva-inventories/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          countA: editing.countA,
          countB: editing.countB,
          notes: editing.notes || null,
        }),
      })
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败')
    }
  }

  async function seal(id: number) {
    setError('')
    try {
      await api(`/api/larva-inventories/${id}/seal`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '封盘失败')
    }
  }

  async function remove(id: number) {
    if (!confirm('确认删除该盘点记录？')) return
    try {
      await api(`/api/larva-inventories/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function reconcile(hatcheryId: number) {
    try {
      const r = await api<ReconcileResult>(
        `/api/larva-inventories/reconcile?hatcheryId=${hatcheryId}`,
      )
      setReconMsgs((m) => ({
        ...m,
        [hatcheryId]: { ok: true, text: `对账平衡：已封盘 ${r.sealedCount} 份，差额为 ${r.difference}` },
      }))
    } catch (err) {
      setReconMsgs((m) => ({
        ...m,
        [hatcheryId]: { ok: false, text: err instanceof Error ? err.message : '对账失败' },
      }))
    }
  }

  const pondOf = (id: number) => ponds.find((x) => x.id === id)
  const pondLabel = (id: number) => {
    const p = pondOf(id)
    return p ? `${p.pondCode} (${p.species})` : `#${id}`
  }
  const hatcheryName = (pondId: number) => {
    const p = pondOf(pondId)
    const h = p && hatcheries.find((x) => x.id === p.hatcheryId)
    return h ? h.name : '—'
  }
  const sealable = (r: LarvaInventory) => {
    const larger = Math.max(r.countA, r.countB)
    return larger >= 1 && 10 * Math.abs(r.countA - r.countB) <= larger
  }

  return (
    <div>
      <header className="page-header">
        <h1>幼体盘点</h1>
        <p className="muted">
          双人计数，同塘同日唯一；封盘要求甲乙差 ≤ 较大值的 10% 且较大值 ≥ 1，封盘后不可再改
        </p>
      </header>
      {error && <div className="error">{error}</div>}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          塘口
          <select
            value={form.pondId}
            onChange={(e) => setForm({ ...form, pondId: Number(e.target.value) })}
            required
          >
            {ponds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pondCode} · {p.species}
              </option>
            ))}
          </select>
        </label>
        <label>
          盘点日（东八区）
          <input
            type="date"
            value={form.countDate}
            onChange={(e) => setForm({ ...form, countDate: e.target.value })}
            required
          />
        </label>
        <label>
          甲计数（万尾）
          <input
            type="number"
            min="0"
            step="1"
            value={form.countA}
            onChange={(e) => setForm({ ...form, countA: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          乙计数（万尾）
          <input
            type="number"
            min="0"
            step="1"
            value={form.countB}
            onChange={(e) => setForm({ ...form, countB: Number(e.target.value) })}
            required
          />
        </label>
        <label className="span-2">
          备注（可空）
          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <button type="submit" className="btn primary">
          登记盘点
        </button>
      </form>

      <div className="panel">
        <h3 className="panel-title">按育苗场对账</h3>
        {hatcheries.map((h) => {
          const list = rows.filter((r) => pondOf(r.pondId)?.hatcheryId === h.id)
          const sealed = list.filter((r) => r.sealedAt).length
          const unsealed = list.length - sealed
          const msg = reconMsgs[h.id]
          return (
            <div key={h.id} className="recon-row">
              <strong>{h.name}</strong>
              <span className="muted">
                已封盘 {sealed} 份 · 未封盘 {unsealed} 份
              </span>
              <button className="btn ghost" onClick={() => reconcile(h.id)}>
                对账
              </button>
              {msg && (
                <span className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>育苗场</th>
              <th>塘口</th>
              <th>盘点日</th>
              <th>甲计数 万尾</th>
              <th>乙计数 万尾</th>
              <th>差值</th>
              <th>备注</th>
              <th>封盘时刻</th>
              <th>状态</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = Math.abs(r.countA - r.countB)
              const larger = Math.max(r.countA, r.countB)
              const pct = larger > 0 ? `${((diff / larger) * 100).toFixed(1)}%` : '—'
              const isEditing = editing?.id === r.id
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{hatcheryName(r.pondId)}</td>
                  <td>{pondLabel(r.pondId)}</td>
                  <td>{r.countDate}</td>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="cell-input"
                          value={editing.countA}
                          onChange={(e) =>
                            setEditing({ ...editing, countA: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="cell-input"
                          value={editing.countB}
                          onChange={(e) =>
                            setEditing({ ...editing, countB: Number(e.target.value) })
                          }
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{r.countA}</td>
                      <td>{r.countB}</td>
                    </>
                  )}
                  <td className={r.sealedAt || sealable(r) ? '' : 'err-text'}>
                    {diff}（{pct}）
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        className="cell-input"
                        value={editing.notes}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                      />
                    ) : (
                      r.notes || '—'
                    )}
                  </td>
                  <td>{r.sealedAt ? new Date(r.sealedAt).toLocaleString() : '—'}</td>
                  <td>
                    {r.sealedAt ? (
                      <span className="badge stocked">已封盘</span>
                    ) : (
                      <span className="badge quarantine">未封盘</span>
                    )}
                  </td>
                  <td>
                    {!r.sealedAt &&
                      (isEditing ? (
                        <span className="row-actions">
                          <button className="btn ghost" onClick={saveEdit}>
                            保存
                          </button>
                          <button className="btn ghost" onClick={() => setEditing(null)}>
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="row-actions">
                          <button className="btn ghost" onClick={() => startEdit(r)}>
                            改数
                          </button>
                          <button className="btn ghost" onClick={() => seal(r.id)}>
                            封盘
                          </button>
                          <button className="btn ghost" onClick={() => remove(r.id)}>
                            删除
                          </button>
                        </span>
                      ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
