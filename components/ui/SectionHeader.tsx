export interface SectionHeaderProps {
    title: string;
    badge?: string;
    action?: React.ReactNode;
    className?: string;
  }
  
  /** Heading for a section within a page (e.g. "Continue Reading",
   * "My Bookshelf") — consistent weight/size, optional demo badge, optional
   * right-aligned action (a link, button, or filter control). */
  export default function SectionHeader({ title, badge, action, className = "" }: SectionHeaderProps) {
    return (
      <div className={`mb-4 flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          {badge && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
              {badge}
            </span>
          )}
        </div>
        {action}
      </div>
    );
  }
  