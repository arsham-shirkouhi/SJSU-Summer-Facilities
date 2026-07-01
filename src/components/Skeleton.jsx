export function SkeletonBlock({ className = '', dark = false }) {
  return (
    <div
      className={`skeleton ${dark ? 'skeleton-on-dark' : ''} ${className}`.trim()}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ className = '', children }) {
  return (
    <div className={`brutal-card bg-white ${className}`.trim()} aria-hidden="true">
      {children}
    </div>
  )
}

export function SkeletonTaskRow({ className = '' }) {
  return (
    <SkeletonCard className={`mb-2 px-3.5 py-3 ${className}`.trim()}>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="mb-2 h-4 w-3/5 max-w-[220px]" />
          <SkeletonBlock className="h-3 w-2/5 max-w-[140px]" />
        </div>
      </div>
    </SkeletonCard>
  )
}

export function SkeletonStaffRow({ className = '' }) {
  return (
    <SkeletonCard className={`mb-1.5 px-3 py-2.5 ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-5 w-14" />
          </div>
          <SkeletonBlock className="mb-1.5 h-3 w-24" />
          <SkeletonBlock className="mb-1.5 h-3 w-40" />
          <SkeletonBlock className="h-3 w-28" />
        </div>
        <div className="flex shrink-0 gap-1">
          <SkeletonBlock className="h-7 w-14" />
          <SkeletonBlock className="h-7 w-14" />
        </div>
      </div>
    </SkeletonCard>
  )
}

export function SkeletonLaundryCard({ className = '' }) {
  return (
    <SkeletonCard className={`mb-2.5 p-4 ${className}`.trim()}>
      <SkeletonBlock className="mb-3 h-5 w-44" />
      <SkeletonBlock className="mb-2 h-3 w-full" />
      <SkeletonBlock className="h-3 w-40" />
    </SkeletonCard>
  )
}

export function SkeletonStorageCard({ className = '' }) {
  return (
    <SkeletonCard className={`p-4 ${className}`.trim()}>
      <SkeletonBlock className="mb-3 h-4 w-28" />
      <SkeletonBlock className="mb-2 h-11 w-20" />
      <SkeletonBlock className="mb-3 h-3 w-14" />
      <SkeletonBlock className="mb-3 h-8 w-full" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 flex-1" />
        <SkeletonBlock className="h-10 w-10 shrink-0" />
      </div>
      <SkeletonBlock className="mt-3 h-3 w-36" />
    </SkeletonCard>
  )
}

export function SkeletonLinenCountCard({ className = '' }) {
  return (
    <SkeletonCard className={`p-4 ${className}`.trim()}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-4 w-4 shrink-0" />
      </div>
      <SkeletonBlock className="mb-2 h-8 w-16" />
      <SkeletonBlock className="mb-3 h-3 w-24" />
      <div className="border-t-[1.5px] border-stone pt-2">
        <SkeletonBlock className="h-3 w-full" />
      </div>
    </SkeletonCard>
  )
}

export function SkeletonKanbanColumn({ taskCount = 3, className = '' }) {
  return (
    <SkeletonCard className={`min-h-[360px] p-3 ${className}`.trim()}>
      <SkeletonBlock className="mb-3 h-5 w-24" />
      {Array.from({ length: taskCount }).map((_, idx) => (
        <div
          key={idx}
          className="mb-2 border-2 border-ink bg-white px-3.5 py-3 shadow-[2px_2px_0_#001A57]"
        >
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-7 w-7 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="mb-2 h-4 w-3/5 max-w-[220px]" />
              <SkeletonBlock className="h-3 w-2/5 max-w-[140px]" />
            </div>
          </div>
        </div>
      ))}
    </SkeletonCard>
  )
}

export function SkeletonCalendarCell({ className = '' }) {
  return (
    <SkeletonBlock
      className={`h-[72px] border-[1.5px] shadow-none sm:h-[78px] ${className}`.trim()}
    />
  )
}
