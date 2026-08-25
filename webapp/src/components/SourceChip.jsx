/** Small Federal / State badge, used wherever awards from both books mix. */
export default function SourceChip({ source }) {
  if (!source) return null
  const state = source === 'STATE'
  return (
    <span className={'src-chip ' + (state ? 'state' : 'federal')}>
      {state ? 'State' : 'Federal'}
    </span>
  )
}
