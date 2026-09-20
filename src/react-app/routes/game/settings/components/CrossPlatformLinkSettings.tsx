import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import type {
  AccountLinkCreateResponse,
  AccountLinkRespondResponse,
  AccountLinkStatusData,
  AccountLinkStatusResponse,
} from '@shared/contracts/account';
import type { ApiFailure } from '@shared/contracts/http';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  SettingsField,
  SettingsMessage,
  SettingsSection,
  settingsLabelClass,
} from './SettingsFields';
import { formatDateTime } from './utils';

async function readResult<T extends { success: true }>(
  response: Response,
): Promise<T> {
  const result = (await response.json()) as T | ApiFailure;
  if (!response.ok || !result.success) {
    throw new Error(result.success ? '账号互通操作失败' : result.error);
  }
  return result;
}

export function CrossPlatformLinkSettings() {
  const navigate = useNavigate();
  const { pushToast } = useInkUI();
  const [status, setStatus] = useState<AccountLinkStatusData | null>(null);
  const [targetId, setTargetId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const hasPendingRequest = Boolean(
    status && !status.linked && status.requests.length,
  );

  const reload = async () => {
    const result = await readResult<AccountLinkStatusResponse>(
      await fetch('/api/account/links'),
    );
    setStatus(result.data);
  };

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/account/links')
      .then(readResult<AccountLinkStatusResponse>)
      .then((result) => {
        if (!cancelled) setStatus(result.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage({
            type: 'error',
            text: error instanceof Error ? error.message : '互通状态读取失败',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasPendingRequest) return;
    let active = true;
    let timer: number | null = null;
    let delayIndex = 0;
    const delays = [15_000, 30_000, 60_000] as const;

    const schedule = () => {
      if (!active || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(poll, delays[Math.min(delayIndex, 2)]);
    };

    const poll = () => {
      if (!active || document.visibilityState !== 'visible') return;
      void fetch('/api/account/links')
        .then(async (response) => {
          if (response.status === 401) {
            pushToast({
              message: '跨端互通已完成，请重新登录',
              tone: 'success',
            });
            navigate('/login', { replace: true });
            return null;
          }
          return readResult<AccountLinkStatusResponse>(response);
        })
        .then((result) => {
          if (!active || !result) return;
          setStatus(result.data);
          if (result.data.linked) {
            setMessage({ type: 'success', text: '跨端互通已完成。' });
            pushToast({ message: 'PC 与微信已互通', tone: 'success' });
          }
          delayIndex = Math.min(delayIndex + 1, 2);
        })
        .catch(() => {
          delayIndex = Math.min(delayIndex + 1, 2);
        })
        .finally(schedule);
    };

    const onVisibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (document.visibilityState === 'visible') {
        delayIndex = 0;
        poll();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    schedule();
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasPendingRequest, navigate, pushToast]);

  const createLink = async () => {
    if (!targetId.trim() || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await readResult<AccountLinkCreateResponse>(
        await fetch('/api/account/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: targetId.trim() }),
        }),
      );
      setTargetId('');
      await reload();
      setMessage({ type: 'success', text: '申请已发送，请让对方确认。' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '互绑申请发送失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const respond = async (requestId: string, action: 'confirm' | 'reject') => {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await readResult<AccountLinkRespondResponse>(
        await fetch(`/api/account/links/${requestId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }),
      );
      if (action === 'confirm') {
        pushToast({ message: '跨端互通已完成，请重新登录', tone: 'success' });
        navigate('/login', { replace: true });
      } else {
        await reload();
        setMessage({ type: 'success', text: '已拒绝互绑申请。' });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '互绑申请处理失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (requestId: string) => {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await readResult<{ success: true; data: { status: 'cancelled' } }>(
        await fetch(`/api/account/links/${requestId}`, { method: 'DELETE' }),
      );
      await reload();
      setMessage({ type: 'success', text: '互绑申请已取消。' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '取消申请失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async () => {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await reload();
      setMessage({ type: 'success', text: '互通状态已刷新。' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '互通状态刷新失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyUserId = async () => {
    const userId = status?.userId;
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      pushToast({ message: '本端用户 ID 已复制', tone: 'success' });
    } catch {
      setMessage({ type: 'error', text: '复制失败，请手动选择用户 ID。' });
    }
  };

  return (
    <SettingsSection
      title="跨端互通"
      description="PC 与微信任一端都可发起：复制另一端系统设置中的用户 ID，填写后发送申请，再回到另一端确认。申请在 10 分钟内有效；两个账号均有角色时不会自动合并。"
    >
      {loading ? (
        <p className="text-sm text-stone-500">正在读取互通状态……</p>
      ) : (
        <div className="grid gap-4">
          <SettingsField
            label={status?.linked ? '统一用户 ID' : '本端（PC）用户 ID'}
            value={status?.userId ?? '—'}
            mono
            action={
              status?.userId ? (
                <InkButton variant="secondary" onClick={copyUserId}>
                  复制 ID
                </InkButton>
              ) : null
            }
          />
          {status?.linked ? (
            <div className="grid gap-2 text-sm">
              <SettingsField label="PC 端" value="已连接" />
              <SettingsField label="微信端" value="已连接" />
            </div>
          ) : null}
          {!status?.linked
            ? status?.requests.map((request) => (
                <div
                  key={request.id}
                  className="border border-stone-300/80 bg-white/35 p-3 text-sm"
                >
                  <p className="font-medium text-stone-800">
                    {request.direction === 'incoming'
                      ? '收到互绑申请'
                      : '等待对方确认'}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    状态将在当前页面自动更新
                  </p>
                  <p className="mt-1 break-all text-stone-600">
                    {request.counterpart.name} · {request.counterpart.userId}
                  </p>
                  {request.counterpart.cultivator ? (
                    <p className="mt-1 text-stone-500">
                      角色：{request.counterpart.cultivator.name} ·{' '}
                      {request.counterpart.cultivator.realm}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-stone-500">
                    有效至 {formatDateTime(request.expiresAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {request.direction === 'incoming' ? (
                      <>
                        <InkButton
                          variant="primary"
                          disabled={submitting}
                          onClick={() => respond(request.id, 'confirm')}
                        >
                          确认互通
                        </InkButton>
                        <InkButton
                          variant="secondary"
                          disabled={submitting}
                          onClick={() => respond(request.id, 'reject')}
                        >
                          拒绝
                        </InkButton>
                      </>
                    ) : (
                      <>
                        <InkButton
                          variant="secondary"
                          disabled={submitting}
                          onClick={refresh}
                        >
                          刷新状态
                        </InkButton>
                        <InkButton
                          variant="secondary"
                          disabled={submitting}
                          onClick={() => cancel(request.id)}
                        >
                          取消申请
                        </InkButton>
                      </>
                    )}
                  </div>
                </div>
              ))
            : null}
          {!status?.linked && !status?.requests.length ? (
            <>
              <InkInput
                label="对方用户 ID"
                value={targetId}
                onChange={setTargetId}
                disabled={submitting}
                size="sm"
                labelClassName={settingsLabelClass}
              />
              <InkButton
                variant="primary"
                onClick={createLink}
                disabled={!targetId.trim() || submitting}
                pending={submitting}
                pendingLabel="发送中……"
              >
                申请互通
              </InkButton>
            </>
          ) : null}
        </div>
      )}
      {message ? (
        <SettingsMessage type={message.type} className="mt-3 block">
          {message.text}
        </SettingsMessage>
      ) : null}
    </SettingsSection>
  );
}
