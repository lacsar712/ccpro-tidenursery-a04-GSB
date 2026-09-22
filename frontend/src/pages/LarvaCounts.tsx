import { FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Hatchery, LarvaCount, Pond, ReconcileRow } from '../types'

// 盘点日按东八区日历日切分
function todayCn() {
  const now = new Date()
  const cn = new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000)
  return cn.toISOString().slice(0, 10)
}

const empty = { pondId: 0, countDate: todayCn(), countA: 0, countB: 0, notes: '' }

export default function LarvaCounts() {
  const [hatcheries, setHatcheries] = useState<Hatchery[]>([])
  const [ponds, setPonds] = useState<Pond[]>([])
  const [rows, setRows] = useState<LarvaCount[]>([])
  const [recon, setRecon] = useState<ReconcileRow[]>([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ countA: 0, countB: 0, notes: '' })
  const [error, setError] = useState('')

  async function load() {
    const [hs, ps, cs, rc] = await Promise.all([
      api<Hatchery[]>('/api/hatcheries'),
      api<Pond[]>('/api/ponds'),
      api<LarvaCount[]>('/api/larva-counts'),
      api<ReconcileRow[]>('/api/larva-counts/reconcile'),
    ])
    setHatcheries(hs)
    setPonds(ps)
    setRows(cs)
    setRecon(rc)
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
      await api('/api/larva-counts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          countA: Math.trunc(form.countA),
          countB: Math.trunc(form.countB),
          notes: form.notes || null,
        }),
      })
      setForm((f) => ({ ...empty, pondId: f.pondId, countDate: todayCn() }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  function startEdit(r: LarvaCount) {
    setEditId(r.id)
    setEditForm({ countA: r.countA, countB: r.countB, notes: r.notes || '' })
  }

  async function saveEdit(id: number) {
    setError('')
    try {
      await api(`/api/larva-counts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          countA: Math.trunc(editForm.countA),
          countB: Math.trunc(editForm.countB),
          notes: editForm.notes || null,
        }),
      })
      setEditId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '改数失败')
    }
  }

  async function seal(id: number) {
    if (!confirm('确认封盘？封盘后不可再改计数。')) return
    setError('')
    try {
      await api(`/api/larva-counts/${id}/seal`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '封盘失败')
    }
  }

  async function remove(id: number) {
    if (!confirm('确认删除该盘点记录？')) return
    setError('')
    try {
      await api(`/api/larva-counts/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const hatcheryName = (id: number) => hatcheries.find((h) => h.id === id)?.name || `#${id}`
  const pondOf = (id: number) => ponds.find((p) => p.id === id)
  const pondLabel = (id: number) => {
    const p = pondOf(id)
    return p ? `${hatcheryName(p.hatcheryId)} / ${p.pondCode}` : `#${id}`
  }
  const diffLabel = (a: number, b: number) => {
    const larger = Math.max(a, b)
    const diff = Math.abs(a - b)
    return larger > 0 ? `${diff}（${((diff / larger) * 100).toFixed(1)}%）` : `${diff}`
  }

  return (
    <div>
      <header className="page-header">
        <h1>幼体盘点</h1>
        <p className="muted">双人计数挂塘口，同塘同日唯一；封盘要求 |甲-乙| ≤ 两者较大值的 10% 且较大值 ≥ 1</p>
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
                {hatcheryName(p.hatcheryId)} / {p.pondCode} · {p.species}
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
            step="1"
            min="0"
            value={form.countA}
            onChange={(e) => setForm({ ...form, countA: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          乙计数（万尾）
          <input
            type="number"
            step="1"
            min="0"
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
        <p className="hint" style={{ marginTop: 0 }}>
          对账：按育苗场汇总已封 / 未封盘点数，核对后差额必须为零（差额 = 未封盘数）。
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>育苗场</th>
                <th>已封盘</th>
                <th>未封盘</th>
                <th>差额</th>
                <th>对账</th>
              </tr>
            </thead>
            <tbody>
              {recon.map((r) => (
                <tr key={r.hatcheryId}>
                  <td>{r.hatcheryName}</td>
                  <td>{r.sealedCount}</td>
                  <td>{r.unsealedCount}</td>
                  <td>{r.difference}</td>
                  <td>
                    {r.balanced ? (
                      <span className="badge stocked">平</span>
                    ) : (
                      <span className="badge quarantine">差额不为零</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>育苗场 / 塘口</th>
              <th>盘点日</th>
              <th>甲计数 万尾</th>
              <th>乙计数 万尾</th>
              <th>差值（差率）</th>
              <th>状态</th>
              <th>备注</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sealed = !!r.sealedAt
              const editing = editId === r.id
              return (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{pondLabel(r.pondId)}</td>
                  <td>{r.countDate}</td>
                  <td>
                    {editing ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={editForm.countA}
                        onChange={(e) =>
                          setEditForm({ ...editForm, countA: Number(e.target.value) })
                        }
                      />
                    ) : (
                      r.countA
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={editForm.countB}
                        onChange={(e) =>
                          setEditForm({ ...editForm, countB: Number(e.target.value) })
                        }
                      />
                    ) : (
                      r.countB
                    )}
                  </td>
                  <td>{diffLabel(r.countA, r.countB)}</td>
                  <td>
                    {sealed ? (
                      <span className="badge stocked">
                        已封盘 {new Date(r.sealedAt as string).toLocaleString()}
                      </span>
                    ) : (
                      <span className="badge quarantine">未封盘</span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      />
                    ) : (
                      r.notes || '—'
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <>
                        <button className="btn ghost" onClick={() => saveEdit(r.id)}>
                          保存
                        </button>{' '}
                        <button className="btn ghost" onClick={() => setEditId(null)}>
                          取消
                        </button>
                      </>
                    ) : sealed ? (
                      '—'
                    ) : (
                      <>
                        <button className="btn ghost" onClick={() => startEdit(r)}>
                          改数
                        </button>{' '}
                        <button className="btn ghost" onClick={() => seal(r.id)}>
                          封盘
                        </button>{' '}
                        <button className="btn ghost" onClick={() => remove(r.id)}>
                          删除
                        </button>
                      </>
                    )}
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
