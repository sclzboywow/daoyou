import {
  AbilityListCard,
  ArtifactListCard,
  toProductDisplayModel,
  type ProductRecordLike,
} from '@app/components/feature/products';
import { InkList, InkNotice } from '@app/components/ui';
import type { CultivatorInspectionData } from '@shared/contracts/player';
import type {
  Artifact,
  CultivationTechnique,
  Skill,
} from '@shared/types/cultivator';

function getEquippedArtifacts(cultivator: CultivatorInspectionData): Artifact[] {
  const artifacts = cultivator.inventory?.artifacts ?? [];
  const equippedIds = [
    cultivator.equipped?.weapon,
    cultivator.equipped?.armor,
    cultivator.equipped?.accessory,
  ].filter(Boolean);

  return equippedIds.flatMap((id) => {
    const artifact = artifacts.find((item) => item.id === id);
    return artifact ? [artifact] : [];
  });
}

function toGongfaDisplayModel(technique: CultivationTechnique) {
  return toProductDisplayModel({
    ...(technique as ProductRecordLike),
    productType: 'gongfa',
  });
}

function toSkillDisplayModel(skill: Skill) {
  return toProductDisplayModel({
    ...(skill as ProductRecordLike),
    productType: 'skill',
  });
}

export function CultivatorLoadoutSections({
  cultivator,
}: {
  cultivator: CultivatorInspectionData;
}) {
  const equippedArtifacts = getEquippedArtifacts(cultivator);
  const cultivations = cultivator.cultivations ?? [];
  const skills = cultivator.skills ?? [];

  return (
    <>
      <section className="space-y-3">
        <h5 className="text-ink font-semibold">法宝</h5>
        {equippedArtifacts.length === 0 ? (
          <InkNotice>尚未佩戴法宝</InkNotice>
        ) : (
          <InkList>
            {equippedArtifacts.map((artifact) => (
              <ArtifactListCard
                key={artifact.id ?? artifact.name}
                artifact={artifact}
                equipped
              />
            ))}
          </InkList>
        )}
      </section>

      <section className="space-y-3">
        <h5 className="text-ink font-semibold">功法</h5>
        {cultivations.length === 0 ? (
          <InkNotice>尚无功法</InkNotice>
        ) : (
          <div className="space-y-2">
            {cultivations.map((technique) => (
              <AbilityListCard
                key={technique.id ?? technique.name}
                product={toGongfaDisplayModel(technique)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h5 className="text-ink font-semibold">神通</h5>
        {skills.length === 0 ? (
          <InkNotice>尚无神通</InkNotice>
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <AbilityListCard
                key={skill.id ?? skill.name}
                product={toSkillDisplayModel(skill)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
