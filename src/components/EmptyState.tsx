export function EmptyState({ title, description, action }: { title: string, description: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-[6px] border border-border bg-surface">
      <div className="text-muted mb-4">
        <svg className="w-12 h-12 mx-auto stroke-current opacity-70" fill="none" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
      </div>
      <h3 className="text-[22px] font-light text-foreground tracking-tight">{title}</h3>
      <p className="text-muted text-sm mt-1 max-w-[320px]">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
