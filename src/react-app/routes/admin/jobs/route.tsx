import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui';
import type {
  AdminBatchJobView,
  SystemJobRunView,
} from '@shared/contracts/adminPlatform';
import { useCallback, useEffect, useState } from 'react';

export default function AdminJobsPage() {
  const { pushToast } = useInkUI();
  const [jobs, setJobs] = useState<AdminBatchJobView[]>([]);
  const [runs, setRuns] = useState<SystemJobRunView[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsResponse, runsResponse] = await Promise.all([
        fetch('/api/admin/jobs', { cache: 'no-store' }),
        fetch('/api/admin/jobs/system-runs', { cache: 'no-store' }),
      ]);
      const jobsPayload = await jobsResponse.json();
      const runsPayload = await runsResponse.json();
      if (!jobsResponse.ok || !runsResponse.ok) throw new Error('加载任务失败');
      setJobs(jobsPayload.jobs ?? []);
      setRuns(runsPayload.runs ?? []);
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '加载任务失败',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = async (id: string, action: 'cancel' | 'retry') => {
    const response = await fetch(`/api/admin/jobs/${id}/${action}`, {
      method: 'POST',
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({ message: payload.error ?? '操作失败', tone: 'danger' });
      return;
    }
    pushToast({ message: '任务状态已更新', tone: 'success' });
    await load();
  };

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <h2 className="font-heading text-ink text-3xl">批处理与定时任务</h2>
        <p className="text-ink-secondary mt-3 text-sm">
          查看群发、补发进度、失败原因，以及系统定时任务执行历史。
        </p>
      </header>
      <section className="border-ink/15 bg-bgpaper/90 overflow-x-auto border border-dashed p-5">
        <InkButton variant="secondary" onClick={() => void load()}>
          {loading ? '刷新中…' : '刷新'}
        </InkButton>
        <table className="mt-4 w-full min-w-[900px] text-left text-sm">
          <thead><tr><th>类型</th><th>状态</th><th>进度</th><th>原因</th><th>创建人</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-ink/10 border-t">
                <td className="py-3">{job.jobType}</td>
                <td>{job.status}</td>
                <td>{job.succeededCount}/{job.totalCount}，失败 {job.failedCount}</td>
                <td>{job.reason ?? '—'}</td>
                <td>{job.requestedByEmail}</td>
                <td>{new Date(job.createdAt).toLocaleString()}</td>
                <td className="space-x-2">
                  {['queued', 'running'].includes(job.status) ? <button onClick={() => void mutate(job.id, 'cancel')}>取消</button> : null}
                  {['failed', 'partial_failed'].includes(job.status) ? <button onClick={() => void mutate(job.id, 'retry')}>重试失败项</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="border-ink/15 bg-bgpaper/90 overflow-x-auto border border-dashed p-5">
        <h3 className="font-heading text-xl">定时任务最近执行</h3>
        <table className="mt-4 w-full min-w-[760px] text-left text-sm">
          <thead><tr><th>任务</th><th>状态</th><th>处理量</th><th>原因/错误</th><th>耗时</th><th>开始时间</th></tr></thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-ink/10 border-t">
                <td className="py-3">{run.jobName}</td><td>{run.status}</td>
                <td>{run.processedCount}</td><td>{run.error ?? run.reason ?? '—'}</td>
                <td>{run.durationMs ?? 0} ms</td><td>{new Date(run.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
