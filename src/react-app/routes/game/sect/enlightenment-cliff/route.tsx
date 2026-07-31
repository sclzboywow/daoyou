import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
} from '@app/components/feature/room';
import {
  buildSectProgressionState,
  getSectDefinition,
  useSectContextQuery,
  useSectProgressionQuery,
} from '@app/components/feature/sect/sectResources';
import {
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { InkButton } from '@app/components/ui';
import { useCultivatorIdentity } from '@app/lib/resources/player';
import { STANDARD_SECT_PRESENTATION } from '@shared/engine/sect';
import { useCallback, useState } from 'react';
import { PathsTab } from '../components/PathsTab';
import {
  SectPermissionBoundary,
  SectScene,
  useSectMutation,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.paths.guidance', renderer: PathsConversation },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.paths);

export default function SectEnlightenmentCliffPage() {
  return (
    <SectPermissionBoundary
      permission="sect.enlightenment.use"
      sceneKey="paths"
    >
      <SectScene sceneKey="paths" mood="cliff">
        <SectRoutedRoom
          roomKey="paths"
          registry={registry}
          eyebrow="道痕分流 · 参悟留痕"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

function PathsConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const context = useSectContextQuery();
  const progression = useSectProgressionQuery();
  const profile = useCultivatorIdentity();
  const cultivator = profile.data?.cultivator;
  const mutation = useSectMutation();
  const [workspace, setWorkspace] = useState(false);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const handleWorkspaceDirtyChange = useCallback((dirty: boolean) => {
    setWorkspaceDirty(dirty);
    if (!dirty) setConfirmExit(false);
  }, []);
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: { context: context.data, progression: progression.data },
    perform: async () => undefined,
    onReset: () => {
      setWorkspace(false);
      setWorkspaceDirty(false);
      setConfirmExit(false);
    },
  });
  const data =
    context.data && progression.data
      ? {
          definition: getSectDefinition(context.data),
          sect: buildSectProgressionState(context.data, progression.data),
          methodLevelCap: Number.POSITIVE_INFINITY,
        }
      : undefined;
  if (workspace && data && !cultivator) {
    return (
      <div className="flex min-h-[34rem] items-center justify-center px-5 py-7">
        <p className="loading-tip">
          {profile.error ? '角色境界读取失败，请稍后重试。' : '正在读取角色境界……'}
        </p>
      </div>
    );
  }
  if (workspace && data && cultivator)
    return (
      <div className="min-h-[34rem] px-5 py-7 sm:px-8 md:px-10">
        <div className="mb-5 flex flex-wrap items-center justify-end gap-3 border-b border-current/10 pb-4">
          {confirmExit ? (
            <>
              <p className="text-crimson text-sm">
                参悟方案尚未保存，是否放弃本次修改？
              </p>
              <InkButton onClick={() => setConfirmExit(false)}>
                继续参悟
              </InkButton>
              <InkButton
                variant="primary"
                onClick={() => {
                  setWorkspace(false);
                  setWorkspaceDirty(false);
                  setConfirmExit(false);
                  void session.reload();
                }}
              >
                放弃修改
              </InkButton>
            </>
          ) : (
            <InkButton
              onClick={() => {
                if (workspaceDirty) {
                  setConfirmExit(true);
                  return;
                }
                setWorkspace(false);
                void session.reload();
              }}
            >
              退出参悟
            </InkButton>
          )}
        </div>
        <PathsTab
          data={data}
          busy={mutation.busy}
          action={async (url, init) => {
            await mutation.run(url, init, '流派参悟已更新');
          }}
          realm={cultivator.realm}
          stage={cultivator.realm_stage}
          onDirtyChange={handleWorkspaceDirtyChange}
        />
      </div>
    );
  const path = data?.definition?.paths.find(
    (candidate) => candidate.id === data.sect?.activePathId,
  );
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actor.name, body: actor.greeting },
  ];
  if (data?.definition)
    messages.push({
      id: 'paths',
      speaker: actor.name,
      body: (
        <>
          此处可参悟
          {data.definition.paths
            .map((candidate) => `「${candidate.name}」`)
            .join('与')}
          。
          {path
            ? `你当前行的是「${path.name}」，若要更改或继续深入，需先静心入定。`
            : '你尚未择定当前流派。'}
        </>
      ),
    });
  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={[
        { id: 'workspace', label: '请长老引我入定参悟' },
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ]}
      busy={session.phase === 'loading'}
      error={session.error ?? context.error ?? progression.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'workspace') setWorkspace(true);
      }}
    />
  );
}
