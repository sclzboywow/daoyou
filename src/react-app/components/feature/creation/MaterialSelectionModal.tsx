import { InkModal } from '@app/components/layout';
import { InkActionGroup, InkButton } from '@app/components/ui';
import type { ReactNode } from 'react';
import {
  MaterialSelector,
  type MaterialSelectorProps,
} from './MaterialSelector';

export interface MaterialSelectionModalProps
  extends MaterialSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  maxMaterials: number;
}

export function MaterialSelectionModal({
  isOpen,
  onClose,
  title = '选择材料',
  maxMaterials,
  selectedMaterialIds,
  ...selectorProps
}: MaterialSelectionModalProps) {
  return (
    <InkModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="max-w-3xl"
      footer={
        <InkActionGroup align="between" className="mt-0">
          <span className="text-ink-secondary text-xs leading-8">
            已选 {selectedMaterialIds.length} / {maxMaterials}
          </span>
          <InkButton variant="primary" onClick={onClose}>
            完成选材
          </InkButton>
        </InkActionGroup>
      }
    >
      <MaterialSelector
        {...selectorProps}
        selectedMaterialIds={selectedMaterialIds}
        showSelectedMaterialsPanel
      />
    </InkModal>
  );
}
