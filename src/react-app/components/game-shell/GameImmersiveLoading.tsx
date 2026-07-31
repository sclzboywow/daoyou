export function GameImmersiveLoading({
  message = '天机流转中……',
}: {
  message?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center pt-[max(env(safe-area-inset-top),5rem)] pr-[max(env(safe-area-inset-right),1rem)] pb-[max(env(safe-area-inset-bottom),5rem)] pl-[max(env(safe-area-inset-left),1rem)]">
      <div className="border-battle-rule-strong min-w-[220px] border border-dashed bg-[rgba(248,243,230,0.92)] px-5 py-4 text-center">
        <p className="loading-tip">{message}</p>
      </div>
    </div>
  );
}
