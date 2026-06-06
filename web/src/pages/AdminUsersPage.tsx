import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../api/client'
import type { AdminUser } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

function UserInitial({ user }: { user: AdminUser }) {
  const letter = (user.name || user.email)[0].toUpperCase()
  const color  = user.role === 'admin' ? 'bg-[color-mix(in_srgb,var(--amber)_15%,transparent)] text-[var(--amber)]' : 'bg-primary/15 text-primary'
  return (
    <span className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold', color)}>
      {letter}
    </span>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [result, setResult] = useState<string | null>(null)
  const reset = useMutation({
    mutationFn: () => admin.resetPassword(user.id),
    onSuccess: (data) => setResult(data.password),
  })

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password — {user.name || user.email}</DialogTitle></DialogHeader>
        {!result ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              This will generate a new temporary password and immediately sign out all of {user.name || user.email}'s active sessions.
            </p>
            {reset.error && <p className="text-sm text-destructive">{reset.error.message}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" variant="destructive" disabled={reset.isPending} onClick={() => reset.mutate()}>
                {reset.isPending ? '…' : 'Reset password'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">New temporary password — share it securely. It won't be shown again.</p>
            <div className="bg-muted rounded-lg px-4 py-3 flex items-center gap-3">
              <code className="text-sm font-mono text-foreground flex-1 select-all">{result}</code>
              <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >Copy</button>
            </div>
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'user' | 'admin'>('user')

  const create = useMutation({
    mutationFn: () => admin.createUser({ email, password, name: name || undefined, role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin/users'] }); onClose() },
  })

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Display name" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map(r => (
                <button key={r} type="button" onClick={() => setRole(r)} className={cn(
                  'flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer capitalize',
                  role === r ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}>{r}</button>
              ))}
            </div>
          </div>
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!email || !password || create.isPending}
              onClick={() => create.mutate()}>
              {create.isPending ? '…' : 'Create user'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const qc = useQueryClient()
  const [expanded,    setExpanded]    = useState(false)
  const [showReset,   setShowReset]   = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)

  const updateUser = useMutation({
    mutationFn: (body: Parameters<typeof admin.updateUser>[1]) => admin.updateUser(user.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin/users'] }),
  })
  const deleteUser = useMutation({
    mutationFn: () => admin.deleteUser(user.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin/users'] }),
  })

  return (
    <>
      <div className={cn('flex items-center gap-3 px-4 py-3 transition-colors', expanded && 'bg-muted/30')}>
        <UserInitial user={user} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {user.name || user.email}
            </span>
            {user.role === 'admin' && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--amber)]">Admin</span>
            )}
            {user.disabled && (
              <span className="text-[10px] font-semibold text-destructive border border-destructive/30 rounded px-1">Disabled</span>
            )}
            {isSelf && (
              <span className="text-[10px] text-muted-foreground/50">you</span>
            )}
          </div>
          {user.name && (
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums hidden sm:block">
          {timeAgo(user.createdAt)}
        </span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground shrink-0"
          onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Done' : 'Manage'}
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-muted/20 border-t border-border/30">
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => setShowReset(true)}>
            Reset password
          </Button>

          {!isSelf && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => updateUser.mutate({ role: user.role === 'admin' ? 'user' : 'admin' })}>
                Make {user.role === 'admin' ? 'user' : 'admin'}
              </Button>
              <Button size="sm" variant="outline" className={cn('h-7 text-xs', user.disabled ? 'text-foreground' : 'text-[var(--amber)]')}
                onClick={() => updateUser.mutate({ disabled: !user.disabled })}>
                {user.disabled ? 'Enable' : 'Disable'}
              </Button>
            </>
          )}

          {!isSelf && !confirmDel && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => setConfirmDel(true)}>
              Delete
            </Button>
          )}
          {confirmDel && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">Delete {user.name || user.email}?</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDel(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs"
                onClick={() => deleteUser.mutate()}>Delete</Button>
            </div>
          )}

          {updateUser.error && (
            <p className="text-xs text-destructive w-full">{updateUser.error.message}</p>
          )}
        </div>
      )}

      {showReset && <ResetPasswordDialog user={user} onClose={() => setShowReset(false)} />}
    </>
  )
}

export default function AdminUsersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const { data: userList = [], isLoading } = useQuery({
    queryKey: ['admin/users'],
    queryFn:  () => admin.users(),
  })

  const selfId = (() => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return ''
      return JSON.parse(atob(token.split('.')[1])).userId ?? ''
    } catch { return '' }
  })()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] px-6 pt-10 pb-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? '…' : `${userList.length} account${userList.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Create user</Button>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {userList.length === 0 && !isLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No users yet.</p>
          ) : (
            userList.map((user, i) => (
              <div key={user.id} className={i > 0 ? 'border-t border-border/40' : ''}>
                <UserRow user={user} isSelf={user.id === selfId} />
              </div>
            ))
          )}
        </div>

      </div>

      {showCreate && <CreateUserDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
