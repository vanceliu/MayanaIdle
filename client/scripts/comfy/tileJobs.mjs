/**
 * AI 地圖素材的產圖清單（`38-map-control.md` § 38.9「素材來源」）。
 *
 * kind 'texture'：無縫材質（依世界座標取樣）。牆：砌石主題只給無接縫石面 `wall-stone`（磚縫由繪製端畫），
 * 其餘主題給連續材質 `wall-top`（俯視）／`wall-side`（正視）；天然岩壁主題另有 `wall-rock` 岩塊堆在內牆上，邊界用 `wall-stone` 砌石。
 * kind 'object'：純色底（洋紅；紫色系與紅色系主題用綠）的單一物件，鍵出背景後縮到寬 maxWidth（世界像素）以內；outline 時補一圈與牆同色的外框。
 * 同一 seed 必得同一張圖；改 prompt 或 seed 即換圖。
 */

const FLOOR_STYLE = 'top-down hand-painted 2D game terrain texture seen from directly above, RimWorld art style, smooth clean painting, soft low-contrast natural variation, seamless tile, flat lighting, no shadows, no objects, not pixel art';
const FACADE_STYLE = 'flat front elevation view, orthographic, no perspective, hand-painted 2D game wall texture, RimWorld art style, smooth clean painting, seamless tile, flat lighting, not pixel art';
const objectStyle = background => `hand-painted 2D game sprite, RimWorld art style, three-quarter top-down view, smooth clean edges, thick dark outline, flat cel shading, muted natural colors on the object, centered, isolated on a pure flat fully saturated ${background} background, no ground, no shadow, not pixel art`;

/** 天然材質加註：避免模型畫成場景（池塘連岸、樹）或方格磚 */
const EDGE_TO_EDGE = 'the material fills the entire frame edge to edge, no border, no frame, no grid, no tiles, no plants, no trees';

const SEEDS = [1, 2, 3];
const TUFT_SEEDS = [21, 22, 23, 24];

/** 物件寬度上限（世界像素） */
const MAX_WIDTH = { 'wall-rock': 72, tree: 56, tuft: 28, rock: 44, rubble: 40, pillar: 30, clutter: 36 };

const texture = (name, seed, subject) => ({ kind: 'texture', name, seed, prompt: `${subject}, ${FLOOR_STYLE}` });
const STONE_STYLE = 'plain continuous surface with no joints, no bricks, no mortar lines, no seams';
const wallStone = (seed, subject) => texture('wall-stone', seed, `${subject}, ${STONE_STYLE}`);
const facade = (seed, subject) => ({ kind: 'texture', name: 'wall-side', seed, prompt: `${subject}, ${FACADE_STYLE}` });
/** 補外框的物件（模型畫的外框偏細偏淺） */
const OUTLINED = new Set(['pillar']);

const object = (name, subject, { seeds = name === 'tuft' ? TUFT_SEEDS : SEEDS, background = 'magenta (#FF00FF)' } = {}) =>
  ({ kind: 'object', name, seeds, maxWidth: MAX_WIDTH[name], outline: OUTLINED.has(name), prompt: `${subject}, ${objectStyle(background)}` });
/** 多造型物件：每種造型一個 prompt、一個 seed，變體依序編號；項目可為 [subject, maxWidth, seed] 個別指定寬度上限與 seed */
const objectSet = (name, subjects, { background = 'magenta (#FF00FF)', seed = 1, suffix = '' } = {}) => {
  const items = subjects.map(item => (Array.isArray(item) ? item : [item]))
    .map(([subject, maxWidth = MAX_WIDTH[name], itemSeed = seed]) => [subject, maxWidth, itemSeed]);
  return {
    kind: 'object', name, seeds: items.map(([, , itemSeed]) => itemSeed), maxWidth: MAX_WIDTH[name], outline: OUTLINED.has(name),
    prompts: items.map(([subject]) => `${subject}${suffix}, ${objectStyle(background)}`),
    maxWidths: items.map(([, maxWidth]) => maxWidth),
  };
};
/** 雜物：每個主題多種不同物品 */
const clutter = (subjects, options) => objectSet('clutter', subjects, options);
/** 天然岩壁岩塊：每個主題多種不同造型，皆寬矮、平底 */
const wallRocks = (subjects, options) =>
  objectSet('wall-rock', subjects, { seed: 11, suffix: ', irregular silhouette, wider than tall, flat bottom', ...options });

export const TILE_JOBS = {
  grassland: [
    texture('ground', 7, 'Short green lawn grass with subtle darker patches and tiny scattered grass strokes'),
    texture('shore', 5, 'Wet muddy riverbank soil, brown dirt with tiny pebbles'),
    texture('water', 3, 'Calm shallow pond water, soft blue ripples'),
    wallStone(1, 'Weathered grey stone surface with small green moss stains'),
    object('tree', 'A single leafy oak tree', { seeds: [42, 43, 44] }),
    object('tuft', 'A single dense clump of tall upright grass blades, deep dark green base with yellow-green tips'),
    object('rock', 'A single irregular jagged grey boulder with angular facets and cracks, wider at the middle than the base', { seeds: [7, 8, 9] }),
    object('rubble', 'A small pile of two or three broken mossy grey stone blocks'),
  ],
  highland: [
    texture('ground', 1, 'Dry highland ground, olive brown dirt with sparse withered grass and small pebbles'),
    texture('sand', 2, `Dusty pale tan sand with faint wind ripples, ${EDGE_TO_EDGE}`),
    texture('chasm-bank', 2, `Crumbling dry brown rocky cliff edge, cracked hard earth, ${EDGE_TO_EDGE}`),
    texture('chasm', 2, `Deep dark rocky gorge, very dark brown-black depths fading into shadow, uniform darkness across the whole image, no rim, no edges, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Top of a rough tan sandstone rock wall seen from directly above, flat weathered stone'),
    facade(1, 'Rough layered tan sandstone cliff face with horizontal strata and cracks'),
    wallRocks([
      'A wide low lumpy weathered tan sandstone outcrop with horizontal strata',
      'A low wide heap of broken angular tan sandstone chunks',
      'A rounded tan rock mound with tufts of dry yellow grass',
      'A jagged tan sandstone rock ridge with sharp edges',
      'A cluster of rounded tan boulders of different sizes',
      'A wide weathered tan sandstone boulder with a cracked flat top',
    ]),
    wallStone(1, 'Pale weathered light grey limestone surface'),
    object('tuft', 'A single clump of dry upright highland grass, olive and straw-yellow blades'),
    object('rock', 'A single weathered tan sandstone boulder with cracks'),
    object('rubble', 'A small pile of two or three broken tan sandstone blocks'),
  ],
  snow: [
    texture('ground', 1, 'Fresh white snow with soft pale blue shadows and gentle drifts'),
    texture('shore', 2, `Wet grey slush and frozen mud, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Icy cold pale cyan water with small floating ice bits, ${EDGE_TO_EDGE}`),
    wallStone(1, 'Cold grey stone surface with light frost'),
    object('tree', 'A single snow-covered evergreen pine tree'),
    object('rock', 'A single grey boulder with a cap of snow'),
    object('rubble', 'A small pile of two or three broken grey stone blocks dusted with snow'),
    clutter([
      'A few snow-covered wooden supply crates and a barrel',
      'A small snow-covered pile of chopped firewood logs',
      'An abandoned wooden sled half buried in snow',
      'A frozen wooden signpost leaning in a snow drift',
      'A small snowman with a carrot nose',
      'A broken wooden cart wheel dusted with snow',
    ]),
  ],
  ivory: [
    texture('ground', 1, 'Polished cream ivory marble floor tiles in a large square grid with thin seams'),
    texture('carpet', 1, 'Rich burnt orange carpet with a subtle gold woven pattern'),
    wallStone(2, 'Light cool grey veined marble surface'),
    object('pillar', 'A single tall white ivory marble column with fluted shaft and carved capital'),
    object('rubble', 'A small pile of two or three broken white ivory marble column fragments'),
    clutter([
      'A stack of old books and a ceramic urn',
      'A pile of rolled parchment scrolls',
      ['A small white marble bust on a short pedestal', 22],
      'A tall bronze candelabra with three candles',
      'A potted olive tree in a white ceramic pot',
      'A toppled small white marble statue',
    ]),
  ],
  forest: [
    texture('ground', 1, 'Dark forest floor with fallen leaves, moss and dark soil'),
    texture('shore', 2, `Dark wet muddy forest soil with soft patches of moss, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Dark murky green still water surface with subtle soft ripples, ${EDGE_TO_EDGE}`),
    wallStone(1, 'Old dark grey stone surface with green moss stains'),
    object('tree', 'A single large dark green deciduous forest tree with dense canopy'),
    object('tuft', 'A single clump of upright green ferns'),
    object('rock', 'A single large moss-covered grey boulder'),
    object('rubble', 'A small pile of two or three broken mossy stone blocks'),
  ],
  swamp: [
    texture('ground', 1, 'Murky swamp ground, olive green muddy grass with small puddles of dark mud'),
    texture('shore', 2, `Dark black-brown boggy mud, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Murky olive green swamp water with floating algae and duckweed, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Top of a tangled wall of gnarled roots and mud, seen from directly above'),
    facade(1, 'Tangled wall of gnarled dark roots and packed mud'),
    object('tree', 'A single gnarled dead swamp tree with drooping moss and twisted bare branches'),
    object('tuft', 'A single clump of tall upright cattail reeds'),
  ],
  cave: [
    texture('ground', 2, `Purple-grey natural uneven cave rock floor with small cracks and pebbles, ${EDGE_TO_EDGE}`),
    texture('shore', 2, `Wet dark grey cave rock, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Dark indigo underground pool water with a faint glimmer, ${EDGE_TO_EDGE}`),
    texture('chasm-bank', 2, `Jagged dark purple-grey cave rock edge, ${EDGE_TO_EDGE}`),
    texture('chasm', 2, `Pitch black bottomless pit, faint purple mist in the darkness, uniform darkness across the whole image, no rim, no edges, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Top of a rough cave rock wall seen from directly above, jagged purple-grey stone'),
    facade(1, 'Rough jagged purple-grey cave rock wall'),
    wallRocks([
      'A wide low lumpy cool lavender purple-grey cave rock outcrop made of several fused boulders',
      'A low cluster of several short stubby purple-grey stalagmites on a wide rocky base',
      'A cluster of glowing violet crystals growing from a grey rock mound',
      'A low wide heap of broken angular purple-grey cave rock chunks',
      'A rounded purple-grey cave rock mound with patches of small pale glowing mushrooms',
      'A jagged purple-grey cave rock ridge with sharp edges',
    ], { background: 'green (#00FF00)' }),
    wallStone(1, 'Dark slate grey stone surface with a faint purple tint'),
    object('rock', 'A single jagged purple-grey cave boulder with small glowing violet crystals', { background: 'green (#00FF00)' }),
    object('rubble', 'A small pile of broken purple-grey cave rocks', { background: 'green (#00FF00)' }),
  ],
  prison: [
    texture('ground', 1, 'Wet dark teal stone dungeon floor tiles with algae in the seams'),
    texture('shore', 2, `Slimy wet dark teal stone, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Deep teal-blue flooded water, ${EDGE_TO_EDGE}`),
    texture('carpet', 1, 'Worn faded grey rug'),
    wallStone(2, 'Pale weathered grey-teal stone surface with light algae stains'),
    object('pillar', 'A single teal-grey stone dungeon column with barnacles and seaweed'),
    object('rubble', 'A small pile of two or three broken teal stone blocks with seaweed'),
    clutter([
      'Rusty iron chains, a wooden bucket and a broken crate',
      'A rusty iron cage with an open door',
      'A wooden barrel covered in barnacles',
      'A pile of old bones and a cracked skull',
      'A rusty anchor lying on its side',
      'A small heap of seaweed and seashells',
    ]),
  ],
  battlefield: [
    texture('ground', 2, `Trampled brown battlefield dirt with subtle fine gravel and faint scorched patches, no holes, no pits, ${EDGE_TO_EDGE}`),
    texture('sand', 2, `Dusty yellow sand, ${EDGE_TO_EDGE}`),
    texture('chasm-bank', 3, `Scorched dark brown burnt earth with grey ash and small cracks, ${EDGE_TO_EDGE}`),
    texture('chasm', 2, `Deep dark red-black trench with smoldering embers at the bottom, uniform darkness across the whole image, no rim, no edges, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Top of a wooden palisade wall seen from directly above, rows of round sharpened log ends'),
    facade(2, 'Wooden palisade wall of vertical logs packed tightly side by side with no gaps between them, bound with rope'),
    objectSet('rock', [
      ['A single brown weathered boulder', undefined, 1],
      ['A single brown weathered boulder', undefined, 2],
      'A simple cairn of three flat brown stones stacked on top of each other',
      'A low stacked wall fragment of rough brown stones',
      'A small pile of stacked rough brown stone blocks',
      'Two flat brown stones stacked with a smaller round stone on top',
    ]),
    object('rubble', 'A small pile of broken brown stone fortification blocks'),
    object('pillar', 'A single ruined broken stone pillar'),
    clutter([
      'Broken shields, a wooden crate and scattered spears',
      'A wooden weapon rack with swords and spears',
      'A pile of straw training dummies',
      'A stack of wooden arrow quivers and bows',
      'A dented iron helmet and a broken sword on the ground',
      'A small wooden war drum',
    ]),
  ],
  ancient: [
    texture('ground', 1, 'Ancient worn brown flagstone floor with cracks and dust'),
    texture('shore', 2, `Wet worn brown stone, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Dark blue ancient cistern water, ${EDGE_TO_EDGE}`),
    texture('chasm-bank', 2, `Broken crumbling ancient flagstone edge, ${EDGE_TO_EDGE}`),
    texture('chasm', 2, `Deep dark teal abyss, faint teal mist, uniform darkness across the whole image, no rim, no edges, ${EDGE_TO_EDGE}`),
    texture('carpet', 1, 'Faded orange ancient woven carpet with geometric pattern'),
    wallStone(2, 'Pale weathered light beige sandstone surface'),
    object('pillar', 'A single ancient weathered brown stone column with carved runes'),
    object('rubble', 'A small pile of broken ancient carved stone blocks'),
    clutter([
      'Ancient clay urns and scattered bones',
      'A small stone sarcophagus lid',
      'A small cracked stone offering bowl on a low carved pedestal',
      'A bronze brazier with cold ashes',
      'An old wooden treasure chest',
      'A pile of fallen carved stone blocks with a skull',
    ]),
  ],
  dragon: [
    texture('ground', 2, `Reddish-brown volcanic rock ground with cracks and ash, ${EDGE_TO_EDGE}`),
    texture('sand', 2, `Grey-brown volcanic ash and cinder sand, ${EDGE_TO_EDGE}`),
    texture('lava-bank', 2, `Black cooled volcanic basalt crust with thin glowing orange cracks, ${EDGE_TO_EDGE}`),
    texture('lava', 6, `Molten lava surface, large smooth areas of glowing orange molten rock with brighter yellow hot spots and a few irregular thin dark cooling crust patches, soft glow, smooth slow surface, no bubbles, no streaks, no dominant direction, ${EDGE_TO_EDGE}`),
    texture('chasm-bank', 2, `Jagged reddish volcanic rock edge, ${EDGE_TO_EDGE}`),
    texture('chasm', 2, `Deep dark red chasm, red-black depths with faint ember glow, uniform darkness across the whole image, no rim, no edges, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Top of a jagged red-brown volcanic rock wall seen from directly above'),
    facade(1, 'Rough jagged red-brown volcanic rock cliff face with dark basalt columns'),
    wallRocks([
      'A wide low lumpy craggy dark red-brown volcanic rock outcrop',
      'A cluster of black hexagonal basalt columns of different heights',
      'A dark volcanic rock mound with thin glowing orange cracks',
      'A pile of jagged black obsidian shards',
      'A low wide heap of broken angular red-brown volcanic rock chunks',
      'A jagged dark red-brown volcanic rock ridge with sharp edges',
    ], { background: 'green (#00FF00)' }),
    wallStone(1, 'Weathered pale grey volcanic stone surface with faint ash'),
    object('rock', 'A single jagged dark red volcanic boulder', { background: 'green (#00FF00)' }),
    object('rubble', 'A small pile of broken dark red volcanic stone', { background: 'green (#00FF00)' }),
  ],
  tower: [
    texture('ground', 1, 'Dark indigo stone tower floor tiles with faint violet rune lines'),
    texture('carpet', 1, 'Deep violet carpet with a silver trim pattern'),
    wallStone(1, 'Indigo-violet stone surface with faint glowing rune flecks'),
    object('pillar', 'A single tall indigo stone column with glowing violet rune bands', { background: 'green (#00FF00)' }),
    object('rubble', 'A small pile of broken indigo stone blocks', { background: 'green (#00FF00)' }),
    clutter([
      'A stack of arcane tomes and a small crystal orb on a stand',
      'A wooden alchemy table with glass potion bottles',
      'A floating violet crystal cluster on a stone base',
      'A brass telescope on a tripod',
      'A pile of rolled magic scrolls in a basket',
      'A small stone pedestal with an open spell book',
    ], { background: 'green (#00FF00)' }),
  ],
  'frost-tower': [
    texture('ground', 1, 'Frosted steel-blue stone tower floor tiles with thin ice'),
    texture('shore', 2, `Frosted icy blue stone, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Cold bright cyan water, ${EDGE_TO_EDGE}`),
    texture('carpet', 1, 'Deep blue carpet with a frost-white pattern'),
    wallStone(2, 'Pale frosted white stone surface with a faint blue tint and soft white frost'),
    object('pillar', 'A single frosted blue stone column wrapped in ice'),
    object('rubble', 'A small pile of broken icy blue stone blocks'),
    clutter([
      'Frozen crates and barrels covered in ice',
      'A cluster of jagged blue ice crystals',
      'A broken wooden table covered in frost',
      'A small frosted stone pedestal with an ice orb',
      'A heap of snow with an icicle-covered barrel',
      'A small round stone fountain basin frozen over with ice',
    ]),
  ],
  'lava-tower': [
    texture('ground', 1, 'Dark red brick tower floor tiles with soot and heat cracks'),
    texture('lava-bank', 2, `Black cooled volcanic basalt crust with thin glowing orange cracks, ${EDGE_TO_EDGE}`),
    texture('lava', 6, `Molten lava surface, large smooth areas of glowing orange molten rock with brighter yellow hot spots and a few irregular thin dark cooling crust patches, soft glow, smooth slow surface, no bubbles, no streaks, no dominant direction, ${EDGE_TO_EDGE}`),
    texture('carpet', 1, 'Crimson red carpet with gold trim'),
    wallStone(2, 'Dark charcoal black basalt stone surface with faint thin glowing orange cracks'),
    object('pillar', 'A single dark red stone column with glowing orange cracks', { background: 'green (#00FF00)' }),
    object('rubble', 'A small pile of broken dark red bricks', { background: 'green (#00FF00)' }),
    clutter([
      'Iron braziers and scorched wooden crates',
      'A blacksmith anvil with a hammer',
      'A pile of glowing hot coals in an iron bowl',
      'A stack of scorched iron ingots',
      'A cracked stone pedestal with a fire rune',
      'A charred wooden barrel',
    ], { background: 'green (#00FF00)' }),
  ],
  town: [
    texture('ground', 1, 'Warm brown cobblestone town street with rounded cobbles'),
    texture('shore', 2, `Neat grey stone paving at a pond edge, ${EDGE_TO_EDGE}`),
    texture('water', 2, `Clear blue fountain pond water, ${EDGE_TO_EDGE}`),
    texture('wall-top', 1, 'Red clay roof tiles seen from directly above'),
    facade(1, 'Half-timbered medieval house wall with cream plaster and dark wooden beams'),
    object('tuft', 'A single clump of upright green garden grass'),
    clutter([
      'Wooden barrels and crates of a market stall',
      'A small wooden cart full of apples',
      'A stack of grain sacks',
      'A wooden bench with a potted flower',
      'A stone water well with a wooden bucket',
      'A wooden fruit and vegetable stall basket',
    ]),
  ],
};
