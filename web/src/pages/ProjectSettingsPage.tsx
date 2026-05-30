import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { projects } from '../api/client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/utils'

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-mono text-muted-foreground/60 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-foreground font-mono break-all">{value}</span>
    </div>
  )
}

export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const { data: projectList = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })

  const project = projectList.find(p => p.id === projectId)

  const deleteProject = useMutation({
    mutationFn: () => projects.delete(projectId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    },
  })

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-border/60">
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">

          {/* Project info */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Project</h2>
            <div className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col gap-4 [box-shadow:var(--shadow-card)]">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                </>
              ) : (
                <>
                  <InfoRow label="Name"       value={project?.name} />
                  <InfoRow label="Repository" value={project?.repoPath} />
                  <InfoRow label="Remote"     value={project?.remoteUrl} />
                  <InfoRow label="Local path" value={project?.localPath} />
                  <InfoRow label="Created"    value={project ? new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined} />
                </>
              )}
            </div>
          </section>

          <Separator className="opacity-40" />

          {/* Danger zone */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-destructive/80 uppercase tracking-widest">Danger zone</h2>
            <div className="bg-card border border-destructive/20 rounded-2xl p-5 flex flex-col gap-3 [box-shadow:var(--shadow-card)]">
              <div>
                <p className="text-sm font-semibold text-foreground">Delete project</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Permanently deletes this project and all its tasks and sessions. This cannot be undone.
                </p>
              </div>

              {confirming ? (
                <div className="flex items-center gap-2 pt-1">
                  <p className="text-xs text-muted-foreground flex-1">Are you sure?</p>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => deleteProject.mutate()}
                    disabled={deleteProject.isPending}
                    className={cn(deleteProject.isPending && 'opacity-60')}>
                    {deleteProject.isPending ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm" variant="outline"
                  onClick={() => setConfirming(true)}
                  className="self-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                >
                  Delete project
                </Button>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
