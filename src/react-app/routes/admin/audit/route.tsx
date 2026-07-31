import type { AdminAuditLogView } from '@shared/contracts/adminPlatform';
import { useCallback, useEffect, useState } from 'react';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AdminAuditLogView[]>([]);
  const [action, setAction] = useState('');
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/audit?action=${encodeURIComponent(action)}`,
      { cache: 'no-store' },
    );
    const payload = await response.json();
    if (response.ok) setLogs(payload.data ?? []);
  }, [action]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h2 className="font-heading text-ink text-3xl">操作审计</h2>
        <p className="text-ink-secondary mt-3 text-sm">所有后台写操作均记录操作者、目标、原因、结果与请求摘要。</p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 border border-dashed p-5">
        <div className="flex gap-2">
          <input className="border-ink/20 bg-bgpaper border px-3 py-2" value={action} onChange={(event) => setAction(event.target.value)} placeholder="按接口动作筛选" />
          <button onClick={() => void load()}>查询</button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th><th>原因</th><th>结果</th><th>IP</th></tr></thead>
            <tbody>{logs.map((log) => <tr key={log.id} className="border-ink/10 border-t"><td className="py-3">{new Date(log.createdAt).toLocaleString()}</td><td>{log.actorEmail}</td><td>{log.action}</td><td>{log.targetType ?? '—'} / {log.targetId ?? '—'}</td><td>{log.reason ?? '—'}</td><td>{log.status}</td><td>{log.ipAddress ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
