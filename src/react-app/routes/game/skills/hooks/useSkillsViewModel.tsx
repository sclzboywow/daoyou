import {
  toProductDisplayModel,
  type ProductDisplayModel,
} from '@app/components/feature/products';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import type { InkDialogState } from '@app/components/ui/InkDialog';
import {
  usePlayerLoadout,
  usePlayerSession,
} from '@app/lib/resources/player';
import { useResourceMutation } from '@app/lib/resources/mutations';
import { MAX_OWNED_CREATION_PRODUCTS_PER_TYPE } from '@shared/config/creationProductLimits';
import { DEFAULT_MAX_ACTIVE_SKILLS } from '@shared/config/skillLimits';
import type { PlayerSessionResource } from '@shared/contracts/player';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type V2Skill = ProductDisplayModel & { id: string };

export interface UseSkillsViewModelReturn {
  cultivator: PlayerSessionResource['activeCultivator'] | undefined;
  skills: V2Skill[];
  isLoading: boolean;
  note: string | undefined;
  maxSkills: number;
  maxOwnedSkills: number;
  enabledSkillCount: number;
  dialog: InkDialogState | null;
  closeDialog: () => void;
  selectedSkill: V2Skill | null;
  isModalOpen: boolean;
  pendingToggleId: string | null;
  openSkillDetail: (skill: V2Skill) => void;
  closeSkillDetail: () => void;
  toggleSkillEnabled: (skill: V2Skill) => Promise<void>;
  openForgetConfirm: (skill: V2Skill) => void;
}

export function useSkillsViewModel(): UseSkillsViewModelReturn {
  const session = usePlayerSession();
  const cultivator = session.data?.activeCultivator;
  const isLoading = session.loading;
  const note = session.data?.note;
  const loadout = usePlayerLoadout(Boolean(cultivator));
  const { mutate } = useResourceMutation();
  const { pushToast, openDialog } = useInkUI();

  const [dialog, setDialog] = useState<InkDialogState | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [skillProducts, setSkillProducts] = useState<V2Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(Boolean(cultivator));
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);

  const maxSkills = DEFAULT_MAX_ACTIVE_SKILLS;
  const maxOwnedSkills = MAX_OWNED_CREATION_PRODUCTS_PER_TYPE;
  const equippedSkillIds = useMemo(
    () => new Set(loadout.data?.skills.map((skill) => skill.id) ?? []),
    [loadout.data?.skills],
  );
  const skills = useMemo(
    () =>
      skillProducts.map((skill) => ({
        ...skill,
        isEquipped: equippedSkillIds.has(skill.id),
      })),
    [equippedSkillIds, skillProducts],
  );
  const selectedSkill =
    skills.find((skill) => skill.id === selectedSkillId) ?? null;
  const enabledSkillCount = skills.filter((skill) => skill.isEquipped).length;

  useEffect(() => {
    if (!cultivator?.id) {
      return;
    }

    let cancelled = false;

    const loadSkills = async () => {
      setSkillsLoading(true);
      try {
        const res = await fetch(
          '/api/v2/products?type=skill&page=1&pageSize=100',
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.success) {
          const parsed: V2Skill[] = (data.data?.items ?? []).map(
            (r: Record<string, unknown>) => ({
              id: r.id as string,
              ...toProductDisplayModel(r),
            }),
          );
          setSkillProducts(parsed);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('加载神通失败:', e);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    };

    void loadSkills();

    return () => {
      cancelled = true;
    };
  }, [cultivator?.id]);

  const closeDialog = useCallback(() => setDialog(null), []);

  const openSkillDetail = useCallback((skill: V2Skill) => {
    setSelectedSkillId(skill.id);
    setIsModalOpen(true);
  }, []);

  const closeSkillDetail = useCallback(() => {
    setIsModalOpen(false);
    setSelectedSkillId(null);
  }, []);

  const toggleSkillEnabled = useCallback(
    async (skill: V2Skill) => {
      if (!cultivator) return;

      setPendingToggleId(skill.id);
      try {
        const data = await mutate<{
          productId: string;
          productType: string;
          equipped: boolean;
        }>(
          fetch('/api/v2/products/equip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: skill.id }),
          }),
        );
        pushToast({
          message: data.equipped
            ? `【${skill.name}】已启用`
            : `【${skill.name}】已停用`,
          tone: 'success',
        });
      } catch (e) {
        pushToast({
          message: e instanceof Error ? e.message : '神通启停失败',
          tone: 'danger',
        });
      } finally {
        setPendingToggleId(null);
      }
    },
    [cultivator, mutate, pushToast],
  );

  const openForgetConfirm = useCallback(
    (skill: V2Skill) => {
      openDialog({
        title: '遗忘神通',
        content: (
          <p className="py-2">
            道友当真要将【{skill.name}】化为尘埃？此举不可逆转。
          </p>
        ),
        confirmLabel: '道心已决',
        cancelLabel: '再思量',
        onConfirm: async () => {
          try {
            await mutate(
              fetch(`/api/v2/products/${skill.id}`, {
                method: 'DELETE',
              }),
            );
            setSkillProducts((current) =>
              current.filter((item) => item.id !== skill.id),
            );
            pushToast({
              message: `【${skill.name}】已从道基消散`,
              tone: 'default',
            });
          } catch (e) {
            pushToast({
              message: e instanceof Error ? e.message : '遗忘失败',
              tone: 'danger',
            });
          }
        },
      });
    },
    [openDialog, mutate, pushToast],
  );

  return {
    cultivator,
    skills,
    isLoading: isLoading || skillsLoading || loadout.loading,
    note,
    maxSkills,
    maxOwnedSkills,
    enabledSkillCount,
    dialog,
    closeDialog,
    selectedSkill,
    isModalOpen,
    pendingToggleId,
    openSkillDetail,
    closeSkillDetail,
    toggleSkillEnabled,
    openForgetConfirm,
  };
}
