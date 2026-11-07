/** 家具的真实米制尺寸独立于旧版二维缩略图宽高。 */
export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface FurnitureDefinition {
  id: string;
  template?: string;
  name?: string;
  place?: string;
  theme?: string;
  motif?: string;
  w?: number;
  h?: number;
  dimensions?: Dimensions;
  [key: string]: unknown;
}

export type FurnitureCatalog = Readonly<Record<string, FurnitureDefinition>>;

export const FURNITURE_DIMENSIONS_BY_TEMPLATE: Readonly<Record<string, Dimensions>> = {
  bed: { width: 1.45, height: .72, depth: 2.05 },
  nightstand: { width: .52, height: .58, depth: .48 },
  wardrobe: { width: 1.15, height: 2.05, depth: .62 },
  vanity: { width: 1.05, height: 1.35, depth: .5 },
  sofa: { width: 1.85, height: .88, depth: .9 },
  armchair: { width: .85, height: .9, depth: .88 },
  coffee_table: { width: 1.05, height: .42, depth: .62 },
  rug: { width: 2.1, height: .025, depth: 1.5 },
  floor_lamp: { width: .4, height: 1.65, depth: .4 },
  bookshelf: { width: 1.05, height: 1.8, depth: .35 },
  dining_table: { width: 1.4, height: .76, depth: .85 },
  chair: { width: .48, height: .88, depth: .52 },
  stove: { width: .65, height: .86, depth: .65 },
  fridge: { width: .72, height: 1.8, depth: .7 },
  counter: { width: 1.1, height: .87, depth: .62 },
  bathtub: { width: 1.65, height: .68, depth: .78 },
  sink: { width: .65, height: .86, depth: .5 },
  piano: { width: 1.4, height: 1.2, depth: .65 },
  toy_box: { width: .8, height: .55, depth: .55 },
  aquarium: { width: .9, height: .85, depth: .4 },
  indoor_swing: { width: .8, height: 1.9, depth: .6 },
  easel: { width: .7, height: 1.5, depth: .65 },
  window: { width: 1.1, height: 1.15, depth: .12 },
  frame: { width: .7, height: .55, depth: .06 },
  mirror: { width: .7, height: 1.6, depth: .08 },
  clock: { width: .4, height: .4, depth: .08 },
  wall_shelf: { width: .95, height: .14, depth: .25 },
  garland: { width: 1.5, height: .28, depth: .06 },
  ceiling_lamp: { width: .52, height: .5, depth: .52 },
  desk_lamp: { width: .25, height: .42, depth: .25 },
  vase: { width: .24, height: .4, depth: .24 },
  cake: { width: .32, height: .24, depth: .32 },
  teapot: { width: .28, height: .24, depth: .22 },
  books: { width: .28, height: .18, depth: .22 },
  plush: { width: .35, height: .42, depth: .32 },
  candle: { width: .16, height: .24, depth: .16 },
  crystal_ball: { width: .3, height: .38, depth: .3 },
  potted_plant: { width: .5, height: .85, depth: .5 },
  custom_art: { width: .8, height: .8, depth: .045 },
  custom_art_frame: { width: .8, height: .8, depth: .045 },
  achievement: { width: .6, height: .8, depth: .5 },
  resident_gift: { width: .55, height: .6, depth: .5 },
  yard: { width: .8, height: .8, depth: .8 },
};

const yardSizes: Readonly<Record<string, Dimensions>> = {
  path: { width: .65, height: .045, depth: .65 },
  fence: { width: 1, height: .8, depth: .12 },
  bench: { width: 1.4, height: .9, depth: .55 },
  tree: { width: 1.1, height: 2.4, depth: 1.1 },
  flower: { width: .5, height: .35, depth: .5 },
  streetlamp: { width: .4, height: 2.1, depth: .4 },
};

/** 未识别的家具也保留实体；其尺寸不从旧w/h反推。 */
export function furnitureDimensions(definition?: FurnitureDefinition | string): Dimensions {
  const def: FurnitureDefinition | undefined = typeof definition === 'string' ? { id: definition, template: definition } : definition;
  const explicit = def?.dimensions;
  if (explicit && [explicit.width, explicit.height, explicit.depth].every(value =>
    Number.isFinite(value) && value >= .01 && value <= 30)) return { ...explicit };
  const known = def?.template === 'yard' && def.motif ? yardSizes[def.motif] : undefined;
  const dimensions = known || FURNITURE_DIMENSIONS_BY_TEMPLATE[def?.template || ''] ||
    (def?.place === 'wall' ? { width: .6, height: .6, depth: .1 } :
      def?.place === 'table' ? { width: .3, height: .35, depth: .3 } :
        { width: .8, height: .8, depth: .7 });
  return { ...dimensions };
}
