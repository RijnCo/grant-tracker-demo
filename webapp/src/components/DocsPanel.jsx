import { useRef, useState } from 'react'
import { Paperclip, Upload, Link2 } from 'lucide-react'
import { api, uploadPdf } from '../lib/api'
import { DEMO } from '../lib/demo'
import { docsFor } from '../lib/selectors'
import { useApp, useToast } from '../state/AppContext'

/** Document list + upload/link controls for one award. */
export default function DocsPanel({ awardId }) {
  const { data, canWrite, refresh, guard } = useApp()
  const toast = useToast()
  const fileRef = useRef(null)
  const [err, setErr] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const docs = docsFor(data, awardId)

  const onFile = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    setErr('')
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('file must be under 10 MB')
      const r = await uploadPdf(awardId, f)
      toast('Attached ' + r.file_name)
      refresh()
    } catch (ex) {
      if (!guard(ex)) setErr(ex.message)
    }
  }

  const onLink = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    try {
      const r = await api('/api/document-link', {
        method: 'POST',
        body: JSON.stringify({
          award_id: awardId,
          file_name: f.get('name'),
          external_url: f.get('url'),
        }),
      })
      toast('Linked ' + r.file_name)
      setLinkOpen(false)
      refresh()
    } catch (ex) {
      if (!guard(ex)) setErr(ex.message)
    }
  }

  return (
    <div>
      {docs.length === 0 && <div className="c-sub">No documents attached yet.</div>}
      {docs.map((d) => (
        <div className="doc-row" key={d.document_id}>
          <div className="doc-ico"><Paperclip /></div>
          <div className="doc-main">
            <a href={d.external_url || (DEMO ? d.storage_path : '/' + d.storage_path)}
               target="_blank" rel="noopener noreferrer">
              {d.file_name}
            </a>
            <div className="doc-meta">
              {d.doc_type.replace('_', ' ')}
              {d.file_size ? ` · ${Math.max(1, Math.round(d.file_size / 1024))} KB` : ''}
              {d.external_url ? ' · external link' : ''}
              {' · '}{d.uploaded_by || '—'} · {(d.uploaded_at || '').slice(0, 10)}
            </div>
          </div>
        </div>
      ))}
      {canWrite && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
          <input type="file" accept="application/pdf" hidden ref={fileRef} onChange={onFile} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn small" type="button" onClick={() => fileRef.current?.click()}>
              <Upload /> Upload PDF
            </button>
            <button className="btn small ghost" type="button" onClick={() => setLinkOpen(!linkOpen)}>
              <Link2 /> Add external link
            </button>
          </div>
          {linkOpen && (
            <form onSubmit={onLink} style={{ marginTop: 10 }} className="modal-inline">
              <input className="input" name="name" placeholder="Link name — Grant agreement (state portal)"
                     required style={{ width: '100%', marginBottom: 8 }} />
              <input className="input" name="url" placeholder="https://…" required
                     style={{ width: '100%', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn small ghost" type="button" onClick={() => setLinkOpen(false)}>Cancel</button>
                <button className="btn small primary" type="submit">Save link</button>
              </div>
            </form>
          )}
          {err && <div style={{ color: 'var(--critical)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}
