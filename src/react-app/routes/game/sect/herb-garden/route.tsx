import { HerbGardenFieldMap } from '@app/components/feature/sect/HerbGardenFieldMap';
import { useHerbGarden } from '@app/components/feature/sect/herbGardenResources';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { GameSceneNote } from '@app/components/game-shell';
import type { HerbGardenPlotView } from '@shared/contracts/herbGarden';
import { SectPermissionBoundary, SectScene } from '../components/SectScene';

function HerbGardenContent() {
  const garden = useHerbGarden();
  const { pushToast } = useInkUI();

  if (!garden.data) {
    return (
      <GameSceneNote tone={garden.error ? 'danger' : undefined}>
        {garden.error ?? (garden.loading ? '灵田晨雾未散，正在查看田畦……' : '灵田暂不可用。')}
      </GameSceneNote>
    );
  }

  const sow = async (slot: number, seedMaterialId: string) => {
    await garden.sow(slot, seedMaterialId);
    pushToast({ message: '灵种已入土，之后静候成熟即可。', tone: 'success' });
  };

  const harvest = async (plotId: string) => {
    const result = await garden.harvest(plotId);
    pushToast({
      message: `收获「${result.result.name}」×${result.result.quantity}`,
      tone: 'success',
    });
  };

  const harvestAll = async () => {
    const result = await garden.harvestAll();
    const total = result.results.reduce((sum, item) => sum + item.quantity, 0);
    pushToast({
      message: result.results.length
        ? `已收取 ${result.results.length} 畦，共 ${total} 份灵物。`
        : '当前没有可收取的成熟灵植。',
      tone: 'success',
    });
  };

  const resumeLegacy = async (plot: HerbGardenPlotView) => {
    if (!plot.plotId) return;
    const actionId = plot.stage === 'germination' ? 'slow_nurture' : 'natural_form';
    await garden.cultivate(plot.plotId, actionId);
    pushToast({
      message: '旧灵植已按简化规则续上生长，之后只需等待成熟。',
      tone: 'success',
    });
  };

  return (
    <HerbGardenFieldMap
      state={garden.data}
      busy={garden.busy}
      onSow={sow}
      onHarvest={harvest}
      onHarvestAll={harvestAll}
      onResumeLegacy={resumeLegacy}
    />
  );
}

export default function SectHerbGardenPage() {
  return (
    <SectPermissionBoundary
      permission="sect.herb_garden.view"
      sceneKey="herbGarden"
    >
      <SectScene sceneKey="herbGarden" mood="garden">
        <HerbGardenContent />
      </SectScene>
    </SectPermissionBoundary>
  );
}
