import { useState } from 'react'
import Modal from '../Modal'
import { api } from '../../lib/api'
import { fmtFull } from '../../lib/format'
import { STATE_AWARD_TYPES } from '../../lib/labels'
import { useApp, useToast } from '../../state/AppContext'

export default function AwardModal({ open, onClose }) {
  const { lookups, refresh, guard } = useApp()
  const toast = useToast()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState('FEDERAL')
  const [newProgram, setNewProgram] = useState(false)
  const [newAgency, setNewAgency] = useState(false)
  const [newPt, setNewPt] = useState(false)

  const isState = source === 'STATE'
  const codeName = isState ? 'CSFA' : 'ALN'

  const close = () => {
    setSource('FEDERAL'); setNewProgram(false); setNewAgency(false); setNewPt(false)
    setErr(''); onClose()
  }

  const pickSource = (s) => {
    setSource(s)
    setNewProgram(false)
    setNewAgency(false)
    setNewPt(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setErr('')
    setBusy(true)
    try {
      let programId = f.get('program_id')
      if (programId === '__new') {
        const agencySel = f.get('np_agency')
        const p = await api('/api/program', {
          method: 'POST',
          body: JSON.stringify({
            aln: f.get('np_aln'),
            program_title: f.get('np_title'),
            funding_source: source,
            agency_id: agencySel === '__new' ? null : agencySel,
            new_agency_name: agencySel === '__new' ? f.get('np_new_agency') : '',
            cluster_name: isState ? '' : f.get('np_cluster'),
          }),
        })
        programId = p.program_id
        toast(`Added program ${p.aln} — ${p.program_title}`)
      }
      let ptId = isState ? null : f.get('pass_through_id') || null
      if (ptId === '__new') {
        const pt = await api('/api/passthrough', {
          method: 'POST',
          body: JSON.stringify({ name: f.get('npt_name'), award_number: f.get('npt_number') }),
        })
        ptId = pt.id
        toast(`Added pass-through entity ${pt.name}`)
      }
      const r = await api('/api/award', {
        method: 'POST',
        body: JSON.stringify({
          program_id: programId,
          award_name: f.get('award_name'),
          fain_or_ptin: f.get('fain_or_ptin'),
          original_award_amount: f.get('original_award_amount'),
          pass_through_id: ptId,
          award_date: f.get('award_date'),
          award_period_start: f.get('award_period_start'),
          award_period_end: f.get('award_period_end'),
          state_award_type: isState ? f.get('state_award_type') : '',
          de_minimis_elected: !isState && f.get('de_minimis_elected') === 'on',
        }),
      })
      toast(`Created award "${r.award_name}" with ${fmtFull(r.budget)} available.`)
      close()
      refresh()
    } catch (ex) {
      if (guard(ex)) close()
      else setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  if (!lookups) return null
  const programs = lookups.programs.filter((p) => (p.funding_source || 'FEDERAL') === source)
  const agencies = lookups.agencies.filter((a) => (a.agency_level || 'FEDERAL') === source)
  return (
    <Modal open={open} onClose={close}>
      <form onSubmit={submit}>
        <h3>New grant award</h3>
        <div className="m-sub">Sets up the award and its original amount; spending is tracked against it.</div>
        <label>Funding source</label>
        <span className="seg" role="group" aria-label="Funding source" style={{ marginBottom: 4 }}>
          <button type="button" aria-pressed={!isState} onClick={() => pickSource('FEDERAL')}>
            Federal (SEFA)
          </button>
          <button type="button" aria-pressed={isState} onClick={() => pickSource('STATE')}>
            State of Florida (SESFA)
          </button>
        </span>
        <label htmlFor="aw-program">{isState ? 'State program (CSFA)' : 'Federal program (ALN)'}</label>
        <select id="aw-program" name="program_id" required key={source}
                onChange={(e) => setNewProgram(e.target.value === '__new')}>
          {programs.map((p) => (
            <option key={p.program_id} value={p.program_id}>{p.aln} — {p.program_title}</option>
          ))}
          <option value="__new">Don’t see your program? Add new…</option>
        </select>
        {newProgram && (
          <div>
            <div className="row2">
              <div>
                <label htmlFor="np-aln">New program {codeName}</label>
                <input id="np-aln" name="np_aln" placeholder={isState ? '37.017' : '20.205'} />
              </div>
              <div>
                <label htmlFor="np-title">Program title</label>
                <input id="np-title" name="np_title"
                       placeholder={isState ? 'FRDAP — Recreation Development Assistance' : 'Highway Planning and Construction'} />
              </div>
            </div>
            <label htmlFor="np-agency">{isState ? 'State agency' : 'Federal agency'}</label>
            <select id="np-agency" name="np_agency"
                    onChange={(e) => setNewAgency(e.target.value === '__new')}>
              {agencies.map((a) => (
                <option key={a.agency_id} value={a.agency_id}>{a.agency_name}</option>
              ))}
              <option value="__new">New agency…</option>
            </select>
            {newAgency && (
              <div>
                <label htmlFor="np-new-agency">New agency name</label>
                <input id="np-new-agency" name="np_new_agency"
                       placeholder={isState ? 'Florida Department of …' : 'U.S. Department of …'} />
              </div>
            )}
            {!isState && (
              <div>
                <label htmlFor="np-cluster">Cluster name (optional)</label>
                <input id="np-cluster" name="np_cluster" placeholder="Highway Planning and Construction Cluster" />
              </div>
            )}
          </div>
        )}
        {isState && (
          <div>
            <label htmlFor="aw-satype">Kind of state award</label>
            <select id="aw-satype" name="state_award_type" required>
              {Object.entries(STATE_AWARD_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}
        <label htmlFor="aw-name">Award / project name</label>
        <input id="aw-name" name="award_name" required placeholder="Beach Drive Stormwater Improvements" />
        <div className="row2">
          <div>
            <label htmlFor="aw-fain">{isState ? 'Contract / agreement number' : 'FAIN / award number'}</label>
            <input id="aw-fain" name="fain_or_ptin"
                   placeholder={isState ? 'GAA-2027-LI-1234A' : 'B-26-MC-12-0021'} />
          </div>
          <div>
            <label htmlFor="aw-amount">Original award amount ($)</label>
            <input id="aw-amount" name="original_award_amount" type="number" step="0.01" min="1" required />
          </div>
        </div>
        {!isState && (
          <div>
            <label htmlFor="aw-pt">Funding path</label>
            <select id="aw-pt" name="pass_through_id" defaultValue=""
                    onChange={(e) => setNewPt(e.target.value === '__new')}>
              <option value="">Direct federal award</option>
              {lookups.pass_throughs.map((p) => (
                <option key={p.pass_through_id} value={p.pass_through_id}>
                  Pass-through: {p.pass_through_name}
                </option>
              ))}
              <option value="__new">Don’t see the pass-through? Add new…</option>
            </select>
          </div>
        )}
        {newPt && !isState && (
          <div className="row2">
            <div>
              <label htmlFor="npt-name">Pass-through entity name</label>
              <input id="npt-name" name="npt_name" placeholder="Florida Department of …" required />
            </div>
            <div>
              <label htmlFor="npt-number">Their award # (optional)</label>
              <input id="npt-number" name="npt_number" placeholder="FDOT-AR-2027-001" />
            </div>
          </div>
        )}
        <label htmlFor="aw-date">Date awarded</label>
        <input id="aw-date" name="award_date" type="date" />
        <div className="row2">
          <div>
            <label htmlFor="aw-start">Period of performance start</label>
            <input id="aw-start" name="award_period_start" type="date" />
          </div>
          <div>
            <label htmlFor="aw-end">Period of performance end</label>
            <input id="aw-end" name="award_period_end" type="date" />
          </div>
        </div>
        <div className="c-sub" style={{ marginTop: 4 }}>
          Dates change? Record an amendment from the grant’s page — it keeps the history.
        </div>
        {!isState && (
          <div className="checkline">
            <input type="checkbox" id="aw-deminimis" name="de_minimis_elected" />
            <label htmlFor="aw-deminimis" style={{ margin: 0 }}>
              10% de minimis indirect rate elected
            </label>
          </div>
        )}
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create award'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
