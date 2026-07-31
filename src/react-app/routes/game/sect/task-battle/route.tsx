import {
  getSectPresentationForContext,
  useSectContextQuery,
  useSectTasksQuery,
} from '@app/components/feature/sect/sectResources';
import {
  getSectTaskActivityLocation,
  resolveSectTaskActivityOrigin,
} from '@app/components/feature/sect/sectTaskActivityLocations';
import { decodeSectTaskOutcome } from '@app/components/feature/sect/sectTaskOutcomeRegistry';
import { GameImmersiveLoading } from '@app/components/game-shell';
import { InkButton } from '@app/components/ui';
import { formatDocumentTitle } from '@app/lib/router/routeTitle';
import { sectTaskRendererRegistry } from '@app/lib/sect/presentation/compositionRoot';
import { startSectTaskBattleOnce } from '@app/lib/sect/sectClient';
import type { SectTaskActionData } from '@shared/contracts/sect';
import { createElement, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { SectPermissionBoundary } from '../components/SectScene';

export default function SectTaskBattlePage() {
  return (
    <SectPermissionBoundary permission="sect.tasks.use" sceneKey="taskBattle">
      <SectTaskBattleBody />
    </SectPermissionBoundary>
  );
}

function SectTaskBattleBody() {
  const context = useSectContextQuery();
  const tasks = useSectTasksQuery();
  const presentation = getSectPresentationForContext(context.data);
  const scene = presentation.scenes.taskBattle;
  const navigate = useNavigate();
  const { taskId } = useParams();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get('attemptId');
  const origin = resolveSectTaskActivityOrigin(searchParams.get('origin'));
  const [result, setResult] = useState<SectTaskActionData>();
  const [error, setError] = useState<string>();
  const listedTask = tasks.data?.items.find(
    (candidate) => candidate.definitionId === taskId,
  );
  const returnTask = result?.primaryTask ?? listedTask;
  const returnTarget = origin
    ? getSectTaskActivityLocation(origin, returnTask, 'return')
    : {
        route: '/game/sect/affairs',
        returnLabel: presentation.terms.returnToAffairs,
      };
  const parameterError = !taskId || !attemptId ? '缺少宗门战斗标识' : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!taskId || !attemptId) return;
    void startSectTaskBattleOnce(taskId, attemptId)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : '宗门战局推演失败',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, taskId]);

  if (error || parameterError)
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <div className="flex h-full items-center justify-center px-4 py-20">
          <div className="border-battle-rule-strong max-w-md border border-dashed bg-[rgba(248,243,230,0.92)] px-5 py-5 text-center">
            <p className="text-crimson mb-4">{error ?? parameterError}</p>
            <InkButton onClick={() => navigate(returnTarget.route)}>
              {returnTarget.returnLabel}
            </InkButton>
          </div>
        </div>
      </>
    );

  if (!result)
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <GameImmersiveLoading message={scene.loadingText} />
      </>
    );

  const decoded = decodeSectTaskOutcome(result.outcome);
  const contribution = decoded.ok
    ? sectTaskRendererRegistry().outcome(decoded.value.renderer)
    : undefined;
  if (!decoded.ok || !contribution)
    return (
      <>
        <title>{formatDocumentTitle(scene.title)}</title>
        <div className="flex h-full items-center justify-center px-4 py-20">
          <div className="border-battle-rule-strong max-w-md border border-dashed bg-[rgba(248,243,230,0.92)] px-5 py-5 text-center">
            <p className="text-crimson mb-4">
              {decoded.ok ? '暂不支持此宗门战斗结果' : decoded.error}
            </p>
            <InkButton onClick={() => navigate(returnTarget.route)}>
              {returnTarget.returnLabel}
            </InkButton>
          </div>
        </div>
      </>
    );
  return (
    <>
      <title>{formatDocumentTitle(scene.title)}</title>
      {createElement(contribution.renderer, {
        task: result.primaryTask,
        data: decoded.value.data,
      })}
    </>
  );
}
