import type { ElementType, Quality } from '@shared/types/constants';

export interface SpiritSeedCatalogPreset {
  name: string;
  description: string;
  element: ElementType;
}

/**
 * 宗门灵田材料库灵种 curated 目录。
 * 数量对齐 DAILY_MATERIAL_LIBRARY_TARGETS.seed（凡/灵各 5，玄–神各 8）。
 * 库内仅存展示字段；种性由坊市发放时注入。
 */
export const SPIRIT_SEED_LIBRARY_CATALOG: Record<
  Quality,
  SpiritSeedCatalogPreset[]
> = {
  凡品: [
    {
      name: '青芽灵种',
      description:
        '壳薄气弱，喜浅土轻润与晨间薄雾；忌灼晒与急催。初学灵植者常以其练手，产物尚不可知。',
      element: '木',
    },
    {
      name: '细沙谷籽',
      description:
        '种皮如细沙微金，宜干燥疏土与静养；厌积水与浓肥。埋入土中后气息平淡，需耐心观其转机。',
      element: '金',
    },
    {
      name: '浅泉芽孢',
      description:
        '孢囊含水光，喜清泉旁与阴凉处；忌烈火烤培。摸之微凉，种性未显，只知宜缓不宜急。',
      element: '水',
    },
    {
      name: '暖垄灰种',
      description:
        '外壳带余温，宜温垄与薄灰覆土；忌寒潮与过湿。气息短促却完整，适合试探品阶边界。',
      element: '火',
    },
    {
      name: '黏壤稚核',
      description:
        '核坚而钝，喜黏壤深埋与稳压；厌风燥与翻刨。入土后久无异象，似在暗中积蓄生机。',
      element: '土',
    },
  ],
  灵品: [
    {
      name: '晨露灵籽',
      description:
        '表面凝露不散，喜晨露灌溉与薄云遮阴；忌正午暴晒。内蕴种性隐约可感，却未露归属。',
      element: '水',
    },
    {
      name: '碧脉草种',
      description:
        '种纹如细脉，宜木气旺盛处与轻剪修枝；厌斧凿重伤。握之微颤，似在择地而栖。',
      element: '木',
    },
    {
      name: '柔风薄壳',
      description:
        '壳轻如羽，喜穿堂柔风与高架疏土；忌密闭窒气。风过则种纹游走，产物仍待培育揭晓。',
      element: '风',
    },
    {
      name: '冷石霜芽',
      description:
        '芽尖凝霜丝，宜寒石床与夜露；厌温房催花。触手生凉，种性偏冷清，不宜急于催熟。',
      element: '冰',
    },
    {
      name: '赭脉矿籽',
      description:
        '籽心隐赭纹，喜矿气浸润与硬土压实；忌软泥深陷。沉手不轻，像藏着尚未醒转的地力。',
      element: '土',
    },
  ],
  玄品: [
    {
      name: '赤霞玄种',
      description:
        '种壳浮赤霞细纹，宜霞光时分与温火轻培；忌冷泉骤灌。霞纹随呼吸明灭，归属需入土后方知。',
      element: '火',
    },
    {
      name: '青岚雾核',
      description:
        '核内似有薄雾流转，喜山岚雾谷与高湿；厌干风卷土。嗅之带草腥，种性偏隐，忌强行催芽。',
      element: '木',
    },
    {
      name: '银潢露种',
      description:
        '壳表银丝如潢，宜清露与静室；忌嘈杂震动。银丝遇光微亮，似在记下环境喜恶。',
      element: '水',
    },
    {
      name: '玄铁刺孢',
      description:
        '孢表生细刺如铁芒，喜金石气与干爽；厌腐叶堆肥。刺芒会随触碰收回，产物未可断言。',
      element: '金',
    },
    {
      name: '黄庭土籽',
      description:
        '籽色如黄庭泥，宜厚土深埋与稳灵镇压；忌悬空浅植。入土后气息下沉，似择地脉而栖。',
      element: '土',
    },
    {
      name: '裂空风种',
      description:
        '种纹似风刃裂痕，喜高崖穿风与疏篱；厌密室壅塞。握之轻颤，像随时要挣出掌心。',
      element: '风',
    },
    {
      name: '微霆芽种',
      description:
        '偶有细芒自壳跃出，宜雷雨后潮土与空旷处；忌金属密笼。芒光一瞬即敛，种性仍在沉睡。',
      element: '雷',
    },
    {
      name: '寒潭玄核',
      description:
        '核凉如潭底石，喜深潭边阴湿与静养；厌烈日曝晒。寒气内敛，不宜以热法强开。',
      element: '冰',
    },
  ],
  真品: [
    {
      name: '岩心道籽',
      description:
        '沉稳如石，喜岩隙与地脉微震；忌频繁移栽。内里生机深藏，唯有久培方显倾向。',
      element: '土',
    },
    {
      name: '丹砂真种',
      description:
        '种心隐丹砂色，宜温砂床与微火守夜；厌寒湿久浸。砂色随培加深，却从不预告终物。',
      element: '火',
    },
    {
      name: '碧落藤籽',
      description:
        '籽上缠丝如藤，喜攀附支架与木气；忌断丝强解。丝触支架便活，似在挑选攀缘之路。',
      element: '木',
    },
    {
      name: '玄溟水核',
      description:
        '核内水光沉凝，宜深水雾与夜潮；厌燥热炉旁。水光不溢，像把种性锁在最深处。',
      element: '水',
    },
    {
      name: '霜金蝉种',
      description:
        '壳薄如蝉羽镀霜，喜金气清肃与冷露；忌污浊烟尘。轻叩有细鸣，产物仍待培育裁定。',
      element: '金',
    },
    {
      name: '回廊风孢',
      description:
        '孢随气流自转，喜回廊穿堂风与疏影；厌死角积尘。自转节奏随风变，忌强行按停。',
      element: '风',
    },
    {
      name: '蛰雷真芽',
      description:
        '芽尖含蛰雷，宜雷纹土与偶发惊蛰气；忌常年无雷之地。触之微麻，种性尚未醒全。',
      element: '雷',
    },
    {
      name: '玄冰髓籽',
      description:
        '籽心似冰髓凝结，喜极寒静室与月华；厌温阳催长。冰纹不化，像在等待合适的节律。',
      element: '冰',
    },
  ],
  地品: [
    {
      name: '风纹异种',
      description:
        '风纹绕壳自行游走，喜旷野风口与活土；忌死水潭。来历与产物皆未可知，只觉不宜困养。',
      element: '风',
    },
    {
      name: '五岳根核',
      description:
        '核重如峰石，宜五岳土气与重镇压垄；厌轻浮沙地。入土后气息下沉，似要扎穿土层。',
      element: '土',
    },
    {
      name: '赤脉地火种',
      description:
        '种脉赤红如地火，喜地火缝隙与温岩；忌寒泉直灌。脉温常在，却忌过度加温逼迫。',
      element: '火',
    },
    {
      name: '沉渊墨籽',
      description:
        '籽色近墨，喜深渊湿气与暗光；厌白日通透。墨气内敛，像把秘密压在壳底。',
      element: '水',
    },
    {
      name: '青铜古孢',
      description:
        '孢表铜锈斑驳，喜古金气与陈年尘土；忌新铸烈金。锈斑随培变幻，产物不可预先断言。',
      element: '金',
    },
    {
      name: '地脉青藤种',
      description:
        '种纹如藤网连地脉，喜木土交汇处与缓培；厌连根拔起。藤纹会寻土缝延伸，忌粗暴移栽。',
      element: '木',
    },
    {
      name: '震泽雷种',
      description:
        '种内隐雷鸣，宜大泽雷雨季与空阔；忌密室屏蔽。雷意时醒时眠，需以环境诱其共鸣。',
      element: '雷',
    },
    {
      name: '玄霜地核',
      description:
        '核表常年结薄霜，喜地底寒穴与静养；厌地火近邻。霜不解，种性亦不肯早早显露。',
      element: '冰',
    },
  ],
  天品: [
    {
      name: '雷髓天种',
      description:
        '偶有雷芒自壳跃出，宜九霄雷气与高台；忌深埋隔绝。草木灵机罕见，却从不保证终象。',
      element: '雷',
    },
    {
      name: '星河露籽',
      description:
        '籽面似嵌碎星，喜夜观星河与清露；厌烟火浊气。星点随夜明灭，种性随天象微变。',
      element: '水',
    },
    {
      name: '苍穹风核',
      description:
        '核轻欲飞，喜云层风道与悬空架；忌坠地久埋。风过则核鸣，像在辨认天风的来路。',
      element: '风',
    },
    {
      name: '朱明天火种',
      description:
        '种心常温如朱明，宜朝阳火气与净坛；厌阴湿地窖。火意纯正，却忌以烈焰强催。',
      element: '火',
    },
    {
      name: '白帝金芽',
      description:
        '芽尖金白，喜肃杀金气与秋令；忌腐木浊气。锋芒内敛，产物倾向需培育后自现。',
      element: '金',
    },
    {
      name: '青帝木魄种',
      description:
        '种内似有木魄微光，喜春生木气与林海；厌斧斤近身。微光随季强弱，忌违时强培。',
      element: '木',
    },
    {
      name: '厚土天核',
      description:
        '核沉如坠星，喜厚土承天与稳祭；厌悬空虚养。气息沉稳绵长，像在等待地德回应。',
      element: '土',
    },
    {
      name: '玄天霜种',
      description:
        '霜纹成天文图，喜高寒天穹与月华；厌温阳长照。霜纹会改，却不泄露最终归属。',
      element: '冰',
    },
  ],
  仙品: [
    {
      name: '太阴仙籽',
      description:
        '寒光内敛，仿佛一呼一吸皆应天地；宜太阴时分与静室，忌阳火逼近。节律自成，不宜强改。',
      element: '冰',
    },
    {
      name: '紫霄仙种',
      description:
        '种纹紫气东来，喜紫霄雷云与高坛；厌低洼浊地。紫气若隐若现，产物仍属未知。',
      element: '雷',
    },
    {
      name: '碧落仙核',
      description:
        '核透碧光，喜碧落木气与仙露；忌凡尘烟火。碧光遇浊则敛，种性极挑环境。',
      element: '木',
    },
    {
      name: '丹霞仙火孢',
      description:
        '孢心丹霞不散，宜霞光火脉与净火；厌死灰冷灶。霞色会随培流转，终物不可预告。',
      element: '火',
    },
    {
      name: '瑶池仙露种',
      description:
        '种含瑶池露意，喜清池仙气与柔润；忌燥烈烘烤。露意清冽，像在挑选干净的灵脉。',
      element: '水',
    },
    {
      name: '庚金仙芽',
      description:
        '芽锋庚金锐气，喜肃金与白露；厌锈蚀腐金。锋芒不伤持者，却忌污秽沾染。',
      element: '金',
    },
    {
      name: '坤舆仙土籽',
      description:
        '籽含坤舆厚德，宜广土载物与稳祭；忌频繁翻垄。厚德之气缓缓渗出，急不得。',
      element: '土',
    },
    {
      name: '九天仙风种',
      description:
        '种随九天风信轻颤，喜通天风道与虚空架；厌闭塞石室。风信一变，种纹随之改写。',
      element: '风',
    },
  ],
  神品: [
    {
      name: '混元道种',
      description:
        '种壳道纹天成，尚未入土便引灵气环绕；宜混元静土与慎培，忌妄动强夺。道纹会自择归处。',
      element: '木',
    },
    {
      name: '混沌雷核',
      description:
        '核内混沌雷意未分，喜劫云边缘与空阔；厌凡铁囚笼。雷意难测，产物更不可断言。',
      element: '雷',
    },
    {
      name: '太极水火种',
      description:
        '种分阴阳水火纹，宜水火既济处与平衡培；忌偏执一端。纹路相生相克，终象随势而定。',
      element: '火',
    },
    {
      name: '太素冰魄籽',
      description:
        '籽心太素冰魄澄明，喜极寒虚空与寂养；厌喧嚣热气。澄明不语，种性深不可测。',
      element: '冰',
    },
    {
      name: '造化金母孢',
      description:
        '孢含造化金母气机，喜先天金气与净坛；忌后天浊金。气机浩大，却忌贪婪催逼。',
      element: '金',
    },
    {
      name: '鸿蒙风种',
      description:
        '种若鸿蒙初开之风，喜无拘虚空与漫游；厌定桩锁死。风意不定，归属亦随培育而变。',
      element: '风',
    },
    {
      name: '厚德载物核',
      description:
        '核德深厚如载物之土，宜广袤灵田与久养；忌窄盆浅植。德气绵长，急功近利者难窥其奥。',
      element: '土',
    },
    {
      name: '玄黄神泉种',
      description:
        '种汲玄黄神泉之意，喜古泉灵脉与澄净；厌污流灌浇。泉意幽远，产物只待天时与人手。',
      element: '水',
    },
  ],
};

export const SPIRIT_SEED_QUALITY_KEYS: Record<Quality, string> = {
  凡品: 'fan',
  灵品: 'ling',
  玄品: 'xuan',
  真品: 'zhen',
  地品: 'di',
  天品: 'tian',
  仙品: 'xian',
  神品: 'shen',
};

export function buildSpiritSeedLibraryItemId(
  quality: Quality,
  index: number,
): string {
  const key = SPIRIT_SEED_QUALITY_KEYS[quality];
  return `mat_seed_${key}_curated_${String(index + 1).padStart(2, '0')}`;
}

export function listSpiritSeedCatalogEntries(): Array<{
  quality: Quality;
  index: number;
  itemId: string;
  preset: SpiritSeedCatalogPreset;
}> {
  return (Object.keys(SPIRIT_SEED_LIBRARY_CATALOG) as Quality[]).flatMap(
    (quality) =>
      SPIRIT_SEED_LIBRARY_CATALOG[quality].map((preset, index) => ({
        quality,
        index,
        itemId: buildSpiritSeedLibraryItemId(quality, index),
        preset,
      })),
  );
}

export function assertSpiritSeedCatalogCoverage(
  targets: Record<Quality, number>,
): void {
  for (const quality of Object.keys(targets) as Quality[]) {
    const expected = targets[quality];
    const actual = SPIRIT_SEED_LIBRARY_CATALOG[quality]?.length ?? 0;
    if (actual < expected) {
      throw new Error(
        `灵种目录不足：${quality} 需要至少 ${expected} 条，当前 ${actual}`,
      );
    }
  }
}
