/** Frame for the sign-in and invitation screens (no portal chrome). */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(56rem_28rem_at_50%_-8%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent)]"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="StockVirtue"
            className="h-12 w-auto dark:hidden"
          />
          <span className="hidden items-center gap-2.5 dark:flex">
            <span className="grid size-9 place-items-center rounded-lg bg-linear-to-br from-green-400 to-green-700 font-display text-sm font-bold text-white">
              SV
            </span>
            <span className="font-display text-xl font-semibold">
              StockVirtue
            </span>
          </span>
          <p className="text-sm font-medium tracking-wide text-muted-foreground">
            Newsroom portal
          </p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          For StockVirtue staff only. Sign-ins are recorded.
        </p>
      </div>
    </div>
  );
}
