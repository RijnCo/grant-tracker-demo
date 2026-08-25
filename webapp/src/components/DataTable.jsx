import { useMemo, useState } from 'react'

/**
 * Sortable data table.
 * columns: [{ key, label, numeric, sortable, render(row), sortValue(row) }]
 * footer: array of cells ({content, numeric, colSpan}) or null
 */
export default function DataTable({ columns, rows, initialSort, footer, onRowClick, rowKey }) {
  const [sort, setSort] = useState(initialSort || null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const val = col.sortValue || ((r) => r[col.key])
    return [...rows].sort((a, b) => {
      let va = val(a); let vb = val(b)
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  }, [rows, sort, columns])

  const toggleSort = (col) => {
    if (col.sortable === false) return
    setSort((s) => ({
      key: col.key,
      dir: s && s.key === col.key ? -s.dir : col.numeric ? -1 : 1,
    }))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={(c.numeric ? 'num' : '') + (c.sortable !== false ? ' sortable' : '')}
                onClick={() => toggleSort(c)}
              >
                {c.label}
                {sort && sort.key === c.key && (
                  <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row) : i}
              className={onRowClick ? 'clickable' : ''}
              onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'num' : ''}>
                  {c.render ? c.render(row) : row[c.key] == null ? '—' : String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {footer.map((f, i) => (
                <td key={i} className={f.numeric ? 'num' : ''} colSpan={f.colSpan || 1}>
                  {f.content}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
