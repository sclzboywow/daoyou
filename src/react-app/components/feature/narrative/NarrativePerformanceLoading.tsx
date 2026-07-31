export function NarrativePerformanceLoading({ message }: { message: string }) {
  return (
    <section className="app-safe-area-page flex min-h-[100svh] items-center justify-center bg-[#111713] text-[#f5efdf] [--app-safe-area-inline-space:1.5rem]">
      <div className="w-full max-w-sm text-center" role="status">
        <span
          aria-hidden="true"
          className="mx-auto mb-5 block h-px w-20 bg-[#d8cba9]/55"
        />
        <p className="text-sm leading-7 tracking-[0.16em] text-[#d8cba9]">
          {message}
        </p>
      </div>
    </section>
  );
}
