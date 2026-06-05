export function StatusBadge({ status }: { status: string }) {
  if (status === 'running') return <span className="stat green"><span className="dot green pulse" />Running</span>
  if (status === 'waiting') return <span className="stat amber"><span className="dot amber pulse" />Waiting</span>
  if (status === 'done')    return <span className="stat"><span className="dot idle" />Done</span>
  if (status === 'merged')  return <span className="stat indigo"><span className="dot indigo" />Accepted</span>
  if (status === 'error')   return <span className="stat red"><span className="dot red" />Error</span>
  return <span className="stat" style={{ color: 'var(--muted)' }}>{status}</span>
}
