import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents } from '../api/client'
import type { AgentProvider } from '../api/client'

export default function AgentsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)

  const { data: list = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })

  const create = useMutation({
    mutationFn: (body: { name: string; provider: AgentProvider }) => agents.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setShowNew(false) },
  })

  const remove = useMutation({
    mutationFn: (id: string) => agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Agents</h1>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-black text-sm font-semibold rounded-lg transition-colors">
          + Hire agent
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-white/30 text-center py-20">No agents yet — hire one to start dispatching tasks.</p>
      ) : (
        <div className="space-y-2">
          {list.map(agent => (
            <div key={agent.id} className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl px-4 py-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                agent.provider === 'claude' ? 'bg-orange-500/15 text-orange-400' : 'bg-green-500/15 text-green-400'
              }`}>
                {agent.provider === 'claude' ? '◆' : '⬡'}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{agent.name}</p>
                <p className="text-xs text-white/40 capitalize">{agent.provider}</p>
              </div>
              <button onClick={() => remove.mutate(agent.id)}
                className="text-white/20 hover:text-red-400 text-xs transition-colors px-2">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewAgentModal
          onClose={() => setShowNew(false)}
          onCreate={(body) => create.mutate(body)}
          loading={create.isPending}
          error={create.error?.message}
        />
      )}
    </div>
  )
}

function NewAgentModal({ onClose, onCreate, loading, error }: {
  onClose: () => void
  onCreate: (body: { name: string; provider: AgentProvider }) => void
  loading: boolean
  error?: string
}) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<AgentProvider>('claude')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-base font-semibold">Hire Agent</h2>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Backend Claude"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider mb-1 block">Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {(['claude', 'codex'] as AgentProvider[]).map(p => (
              <button key={p} type="button" onClick={() => setProvider(p)}
                className={`py-2.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                  provider === p
                    ? 'border-white/30 bg-white/8 text-white'
                    : 'border-white/8 text-white/40 hover:text-white/70'
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/60 text-sm rounded-lg hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={() => onCreate({ name, provider })} disabled={!name || loading}
            className="flex-1 py-2.5 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors">
            {loading ? '…' : 'Hire'}
          </button>
        </div>
      </div>
    </div>
  )
}
