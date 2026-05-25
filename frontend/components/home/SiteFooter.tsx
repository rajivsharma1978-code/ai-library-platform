export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-ndl-navy text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-semibold text-white">
              National Digital Library
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              A government initiative to democratize access to knowledge through
              AI-powered discovery and learning.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white">Resources</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#" className="transition hover:text-white">
                  Catalog
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-white">
                  Research tools
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-white">
                  Accessibility
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Support</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#" className="transition hover:text-white">
                  Help center
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-white">
                  Privacy policy
                </a>
              </li>
              <li>
                <a href="#" className="transition hover:text-white">
                  Terms of use
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Contact</p>
            <p className="mt-3 text-sm leading-relaxed">
              help@ndl.gov.in
              <br />
              Toll-free: 1800-XXX-XXXX
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs sm:flex-row">
          <p>© 2026 National Digital Library. All rights reserved.</p>
          <p>WCAG 2.1 AA compliant · ISO 27001 certified infrastructure</p>
        </div>
      </div>
    </footer>
  );
}
