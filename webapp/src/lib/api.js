export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error || res.statusText, res.status)
  return body
}

export async function uploadPdf(awardId, file) {
  const res = await fetch(
    `/api/document?award_id=${awardId}&file_name=${encodeURIComponent(file.name)}`,
    { method: 'POST', body: file },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error || res.statusText, res.status)
  return body
}
