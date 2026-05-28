import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settings } from '../api/client'

export default function SettingsPage() {
  const qc = useQueryClient()
  const [claudeKey, setClaudeKey] = useState('')
  const [codexKey, setCodexKey] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: status } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => settings.credentials(),
  })

  const update = useMutation({
    mutationFn: () => settings.updateCredentials({
      ...(claudeKey ? { claude: claudeKey } : {}),
      ...(codexKey  ? { codex:  codexKey  } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credentials'] })
      setClaudeKey('')
      setCodexKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function signOut() {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* API Keys */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">API Keys</h2>
        <p className="text-xs text-white/30">Keys are stored on the server — never transmitted from your browser after being saved.</p>

        <div className="space-y-2">
          <KeyField
            label="Anthropic (Claude)"
            placeholder="sk-ant-…"
            value={claudeKey}
            onChange={setClaudeKey}
            configured={status?.claude}
          />
          <KeyField
            label="OpenAI (Codex)"
            placeholder="sk-…"
            value={codexKey}
            onChange={setCodexKey}
            configured={status?.codex}
          />
        </div>

        <button
          onClick={() => update.mutate()}
          disabled={update.isPending || (!claudeKey && !codexKey)}
          className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          {update.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save keys'}
        </button>

        {update.error && <p className="text-red-400 text-sm">{update.error.message}</p>}
      </section>

      {/* Sign out */}
      <section>
        <button onClick={signOut}
          className="px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/8 text-sm rounded-lg transition-colors">
          Sign out
        </button>
      </section>
    </div>
  )
}

function KeyField({ label, placeholder, value, onChange, configured }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; configured?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-xs text-white/50">{label}</label>
        {configured && <span className="text-xs text-[#22c55e]">✓ configured</span>}
      </div>
      <input
        type="password" value={value} onChange={e => onChange(e.target.value)}
        placeholder={configured ? '(leave blank to keep existing)' : placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/25 transition-colors"
      />
    </div>
  )
}
