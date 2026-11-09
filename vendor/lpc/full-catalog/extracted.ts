// Exact GPL-3.0 source declarations; see core-provenance.json and ../LICENSE-GPL-3.0.
export function variantToFilename(variant: string): string {
  return variant.replaceAll(" ", "_");
}

export const es6DynamicTemplate = (
  templateString: string,
  templateVariables: Record<string, string>,
): string =>
  templateString.replace(
    /\${(.*?)}/g,
    (_, g) => templateVariables[g] ?? `\${${g}}`,
  );

export const FRAME_SIZE = 64;

export const BODY_TYPES = [
  "male",
  "female",
  "teen",
  "child",
  "muscular",
  "pregnant",
];

export const ANIMATIONS = [
  { value: "spellcast", label: "Spellcast" },
  { value: "thrust", label: "Thrust" },
  { value: "walk", label: "Walk" },
  { value: "slash", label: "Slash" },
  { value: "shoot", label: "Shoot" },
  { value: "hurt", label: "Hurt" },
  { value: "climb", label: "Climb" },
  { value: "idle", label: "Idle" },
  { value: "jump", label: "Jump" },
  { value: "sit", label: "Sit" },
  { value: "emote", label: "Emote" },
  { value: "run", label: "Run" },
  { value: "watering", label: "Watering", noExport: true },
  { value: "combat", label: "Combat Idle", folderName: "combat_idle" },
  {
    value: "1h_slash",
    label: "1-Handed Slash",
    folderName: "backslash",
    noExport: true,
  },
  {
    value: "1h_backslash",
    label: "1-Handed Backslash",
    folderName: "backslash",
  },
  {
    value: "1h_halfslash",
    label: "1-Handed Halfslash",
    folderName: "halfslash",
  },
];

export const ANIMATION_OFFSETS = {
  spellcast: 0,
  thrust: 4 * FRAME_SIZE,
  walk: 8 * FRAME_SIZE,
  slash: 12 * FRAME_SIZE,
  shoot: 16 * FRAME_SIZE,
  hurt: 20 * FRAME_SIZE,
  climb: 21 * FRAME_SIZE,
  idle: 22 * FRAME_SIZE,
  jump: 26 * FRAME_SIZE,
  sit: 30 * FRAME_SIZE,
  emote: 34 * FRAME_SIZE,
  run: 38 * FRAME_SIZE,
  combat_idle: 42 * FRAME_SIZE,
  backslash: 46 * FRAME_SIZE,
  halfslash: 50 * FRAME_SIZE,
};

export const ANIMATION_CONFIGS = {
  spellcast: { row: 0, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6] },
  thrust: { row: 4, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7] },
  walk: { row: 8, num: 4, cycle: [1, 2, 3, 4, 5, 6, 7, 8] },
  slash: { row: 12, num: 4, cycle: [0, 1, 2, 3, 4, 5] },
  shoot: { row: 16, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  hurt: { row: 20, num: 1, cycle: [0, 1, 2, 3, 4, 5] },
  climb: { row: 21, num: 1, cycle: [0, 1, 2, 3, 4, 5] },
  idle: { row: 22, num: 4, cycle: [0, 0, 1] },
  jump: { row: 26, num: 4, cycle: [0, 1, 2, 3, 4, 1] },
  sit: {
    row: 30,
    num: 4,
    cycle: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
  },
  emote: {
    row: 34,
    num: 4,
    cycle: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
  },
  run: { row: 38, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6, 7] },
  watering: { row: 4, num: 4, cycle: [0, 1, 4, 4, 4, 4, 5] },
  combat: { row: 42, num: 4, cycle: [0, 0, 1] },
  "1h_slash": { row: 46, num: 4, cycle: [0, 1, 2, 3, 4, 5, 6] },
  "1h_backslash": {
    row: 46,
    num: 4,
    cycle: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12],
  },
  "1h_halfslash": { row: 50, num: 4, cycle: [0, 1, 2, 3, 4, 5] },
};

export function getHashParamsforSelections(
  catalog: CatalogReader,
  selections: Selections,
  bodyType: string,
): Record<string, string> {
  const params: Record<string, string> = {};

  // Add body type (using 'sex' for backwards compatibility with old URLs).
  params.sex = bodyType;

  // Add selections — old format: `type_name=Name_variant`.
  // e.g., "body=Body_color_light", "shoes=Sara_sara".
  const aliasMetadata = catalog
    .getAliasMetadata()
    .unwrapOr({} as AliasMetadata);
  for (const [typeName, selection] of Object.entries(selections)) {
    const meta = catalog.getItemLite(selection.itemId).unwrapOr(null);
    // Defensive: real production data has type_name, but a few test fixtures
    // (and possibly malformed URLs) might lack it. Treat as alias-fallback.
    if (!meta || !meta.type_name) {
      // Check if an alias is overriding this entry
      // (e.g., "sash=Waistband_rose" instead of "waistband=Waistband_rose").
      const name = selection.name.split(" (")[0]; // Get base name without variant
      const nameAndVariant =
        name.replaceAll(" ", "_") +
        (selection.variant ? `_${selection.variant}` : "");
      const aliasType = aliasMetadata[typeName];
      if (!aliasType) continue;

      // Check name and variant
      const aliasMeta = aliasType?.[nameAndVariant];
      if (aliasMeta && aliasMeta.typeName) {
        params[aliasMeta.typeName] = `${aliasMeta.name}_${aliasMeta.variant}`;
      } else {
        // No exact match — check for type-name wildcard alias entry (`*`)
        // that applies to any name+variant.
        const anyAliasMeta = aliasType?.[`*`];
        if (!anyAliasMeta || !anyAliasMeta.typeName) {
          continue;
        }
        params[anyAliasMeta.typeName] = nameAndVariant;
      }
    } else {
      // Get sub-color metadata if applicable.
      const subMeta =
        selection.subId !== null && selection.subId !== undefined
          ? meta.recolors?.[selection.subId]
          : undefined;

      // Use `type_name` as key (selection group).
      const key = subMeta?.type_name ?? meta.type_name;

      // Build name part for URL using full name with underscores —
      // "Body color" → "Body_color", "Sara Shoes" → "Sara_Shoes".
      const namePart = (subMeta?.label ?? meta.name).replaceAll(" ", "_");

      const variantPart = selection.variant ?? "";
      const recolorPart = selection.recolor ?? "";
      const uscorePart = variantPart || recolorPart ? "_" : "";
      const splitPart = variantPart && recolorPart ? "|" : "";
      const value =
        namePart + uscorePart + variantPart + splitPart + recolorPart;

      params[key] = value;
    }
  }

  return params;
}

export function getSpritePath(
  catalog: CatalogReader,
  itemId: string,
  variant: string | null,
  recolors: Record<string, string> | boolean | null,
  bodyType: string,
  animName: string,
  layerNum: number = 1,
  selections: Selections = {},
  meta: PathMeta | null = null,
): Result<string, PathError> {
  if (!meta) {
    const r = catalog.getItemMerged(itemId);
    if (r.isErr()) return err(r.error);
    meta = r.value;
  }

  const layerKey = `layer_${layerNum}`;
  const layer = meta.layers?.[layerKey];
  if (!layer) return err({ kind: "missing-layer", layerNum });

  let basePath = layer[bodyType] as string | undefined;
  if (!basePath) return err({ kind: "missing-bodytype-path", bodyType });

  if (basePath.includes("${")) {
    basePath = replaceInPath(catalog, basePath, selections, meta, bodyType);
  }

  // If no variant specified, try to extract from itemId.
  if (!variant && !recolors) {
    const parts = itemId.split("_");
    variant = parts[parts.length - 1];
  }

  const animation = pathDeps.animations.find((a) => a.value === animName);
  if (animation?.folderName) {
    animName = animation.folderName;
  }

  // `variant` is guaranteed non-null when `!recolors` here: if both inputs
  // were falsy the block above derived `variant` from the itemId.
  const fileName = !recolors ? `/${pathDeps.variantToFilename(variant!)}` : "";
  return ok(`spritesheets/${basePath}${animName}${fileName}.png`);
}

export function getNameWithoutVariant(
  nameAndVariant: string,
  itemsForType: NameVariantRow[] | SlimByTypeNameRow[],
): string {
  let variant = "";
  const nameAndVariantPath = nameAndVariant.split("_");
  const l = nameAndVariantPath.length;
  const names = itemsForType || [];
  const variants = names
    .flatMap((n) => n.variants || [])
    .map((v) => v.toLowerCase());
  const recolors = names
    .flatMap((n) => n.recolors?.[0]?.variants || [])
    .map((v) => v.toLowerCase());
  let j = l;
  let v = 0;
  while (--j > 0) {
    const part = nameAndVariantPath.slice(j, l).join("_");
    const hasPart = (flatMap: string[], part: string) =>
      flatMap?.includes(part.toLowerCase());
    if (hasPart(variants, part) || hasPart(recolors, part)) {
      variant = part;
      v = j;
    }
  }
  const name = variant
    ? nameAndVariantPath.slice(0, v).join("_")
    : nameAndVariantPath.slice(0, l - 1).join("_");
  return name;
}

export function replaceInPath(
  catalog: CatalogReader,
  path: string,
  selections: Selections | null | undefined,
  meta: PathMeta,
  bodyType: string = "male",
): string {
  if (path.includes("${")) {
    // TODO: optimize — recomputed on every layer/frame today; could be cached
    // per-selection-change or skipped when `path` doesn't contain `${`.
    const hashParams = getHashParamsforSelections(
      catalog,
      selections || {},
      bodyType,
    );
    const replacements = Object.fromEntries(
      Object.entries(hashParams).map(([typeName, nameAndVariant]) => {
        const name = _getNameWithoutVariant(catalog, typeName, nameAndVariant);
        // `meta.replace_in_path` may be undefined; preserved JS behavior is to
        // throw when the path has placeholders but the field is missing.
        const replacement = meta.replace_in_path![typeName]?.[name];
        if (path.includes(`\${${typeName}}`) && !replacement) {
          pathDeps.debugLog(
            `Warning: No replacement found for ${typeName}="${name}" in path template.`,
          );
        }
        return [typeName, replacement];
      }),
    );

    return pathDeps.es6DynamicTemplate(path, replacements);
  }

  return path;
}

function _getNameWithoutVariant(
  catalog: CatalogReader,
  typeName: string,
  nameAndVariant: string,
): string {
  const indexes = catalog.getMetadataIndexes().unwrapOr(null);
  const itemsForType = indexes?.byTypeName?.[typeName] ?? [];
  return getNameWithoutVariant(nameAndVariant, itemsForType);
}

function logIfNotFound(itemId: string): (err: LoadError) => LoadError {
  return (err) => {
    if (err.kind === "not-found") {
      console.error("Item metadata not found:", itemId);
    }
    return err;
  };
}

export function getSortedLayers(
  catalog: CatalogReader,
  itemId: string,
  standardOnly: boolean = false,
): Result<SortedLayer[], LoadError> {
  return catalog
    .getItemMerged(itemId)
    .mapErr(logIfNotFound(itemId))
    .map((meta) => {
      const layersList: SortedLayer[] = [];
      for (let layerNum = 1; layerNum < 10; layerNum++) {
        const layerKey = `layer_${layerNum}`;
        const layer = meta.layers[layerKey];
        if (!layer) break;
        if (standardOnly && layer.custom_animation) continue;

        layersList.push({ layerNum, zPos: layer.zPos ?? 100 });
      }
      return layersList;
    });
}

export function getSortedLayersWithCustomFallback(
  catalog: CatalogReader,
  itemId: string,
): Result<SortedLayer[], LoadError> {
  return getSortedLayers(catalog, itemId, true).andThen((layers) =>
    layers.length === 0 ? getSortedLayers(catalog, itemId) : ok(layers),
  );
}

export function getSortedLayersByAnim(
  catalog: CatalogReader,
  itemId: string,
  customOnly: boolean = false,
): Result<Record<string, AnimationLayer[]>, LoadError> {
  return catalog
    .getItemMerged(itemId)
    .mapErr(logIfNotFound(itemId))
    .map((meta) => {
      const animsList: Record<string, SortedLayer[]> = {};
      for (let layerNum = 1; layerNum < 10; layerNum++) {
        const layerKey = `layer_${layerNum}`;
        const layer = meta.layers[layerKey];
        if (!layer) break;
        if (customOnly && !layer.custom_animation) continue;

        const animName =
          (layer.custom_animation as string | undefined) || "standard";
        if (!animsList[animName]) {
          animsList[animName] = [];
        }

        animsList[animName].push({ layerNum, zPos: layer.zPos ?? 100 });
      }

      // Sort each animation's layers by zPos.
      const result: Record<string, AnimationLayer[]> = {};
      for (const animName in animsList) {
        result[animName] = animsList[animName]
          .sort((a, b) => a.zPos - b.zPos)
          .map((layer, index) => ({
            layerNum: layer.layerNum,
            animLayerNum: index + 1,
            zPos: layer.zPos,
          }));
      }

      return result;
    });
}

export function getLayersToLoad(
  catalog: CatalogReader,
  meta: ItemMerged,
  bodyType: string,
  selections: Selections,
  variant: string | null = null,
): LayerToLoad[] {
  // Check if this item uses a custom animation.
  const layer1 = meta.layers["layer_1"];
  const hasCustomAnimation = layer1?.custom_animation;
  const layer1CustomAnimation = hasCustomAnimation
    ? layer1.custom_animation
    : null;

  const layersToLoad: LayerToLoad[] = [];
  for (let layerNum = 1; layerNum < 10; layerNum++) {
    const layer = meta.layers[`layer_${layerNum}`];
    if (!layer) break;

    let layerPath = layer[bodyType] as string | undefined;
    if (!layerPath) continue;

    // Filter: only include layers with matching custom animation.
    if (layer1CustomAnimation) {
      if (layer.custom_animation !== layer1CustomAnimation) {
        continue;
      }
    }

    // Replace template variables like ${head}.
    if (layerPath.includes("${")) {
      layerPath = replaceInPath(catalog, layerPath, selections, meta, bodyType);
    }

    const hasCustomAnim = layer.custom_animation;
    let imagePath: string;
    const variantFileName =
      variant !== null ? `${variantToFilename(variant)}` : "";
    if (hasCustomAnim) {
      // Skip legacy custom-animation directory paths (trailing slash) when no variant is selected
      if (!variantFileName && layerPath.endsWith("/")) {
        continue;
      }
      imagePath = `spritesheets/${layerPath}${variantFileName}.png`;
    } else {
      const defaultAnim = meta.animations.includes("walk")
        ? "walk"
        : meta.animations[0];
      imagePath = `spritesheets/${layerPath}${defaultAnim}${variantFileName ? `/${variantFileName}` : ""}.png`;
    }

    layersToLoad.push({
      zPos: (layer.zPos as number | undefined) ?? 100,
      path: imagePath,
    });
  }
  return layersToLoad.sort((a, b) => a.zPos - b.zPos);
}

function liteOrNull(catalog: CatalogReader, itemId: string): ItemLite | null {
  return catalog.getItemLite(itemId).unwrapOr(null);
}

function paletteMetaOrNull(catalog: CatalogReader): PaletteMetadata | null {
  return catalog.getPaletteMetadata().unwrapOr(null);
}

export function parseRecolorKey(
  catalog: CatalogReader,
  recolorKey: string | null,
  palette: PaletteRecolor | PaletteMaterialMeta | undefined,
): [string | undefined, string | undefined, string] {
  if (!recolorKey) recolorKey = palette?.base ?? "";
  const [recolor, parsedVersion, parsedMaterial] = recolorKey
    .split(".")
    .reverse() as [string, string | undefined, string | undefined];
  let version = parsedVersion;
  let material = parsedMaterial;

  // Material (e.g. body, metal, cloth)
  if (!material) {
    // Maybe `version` is actually the material name
    if (version && paletteMetaOrNull(catalog)?.materials?.[version]) {
      material = version;
      version = undefined;
    } else {
      material = (palette as PaletteRecolor | undefined)?.material;
    }
  }

  // Version (e.g. ulpc, lpcr)
  if (!version) {
    version = palette?.default;
  }
  return [material, version, recolor];
}

export function getBasePalette(
  catalog: CatalogReader,
  material: string,
  base: string | null = null,
  source: string[] | null = null,
): Result<[string, string, string[]], PaletteLookupError> {
  const materialMeta = paletteMetaOrNull(catalog)?.materials?.[material];
  if (!materialMeta) {
    console.error(`Palettes for ${material} not found`);
    return err({ kind: "material-not-found", material });
  }

  // If source provided, use it directly for the color array
  if (source !== null) {
    return ok([materialMeta.default, base ?? materialMeta.base, source]);
  }

  // Determine base variant
  const [version, recolor] = base
    ? base.split(".")
    : [materialMeta.default, materialMeta.base];
  const colors = materialMeta.palettes[version]?.[recolor];
  return ok([version, recolor, colors]);
}

export function getTargetPalette(
  catalog: CatalogReader,
  material: string,
  targetColor: string,
): Result<string[], PaletteLookupError> {
  const paletteMeta = paletteMetaOrNull(catalog);
  let materialMeta = paletteMeta?.materials?.[material];
  if (!materialMeta) {
    console.error(`Palettes for ${material} not found`);
    return err({ kind: "material-not-found", material });
  }

  const [newMat, version, recolor] = parseRecolorKey(
    catalog,
    targetColor,
    materialMeta,
  );
  if (newMat) {
    const newMaterialMeta = paletteMeta?.materials?.[newMat];
    if (newMaterialMeta) {
      material = newMat;
      materialMeta = newMaterialMeta;
    }
  }

  const colors =
    version !== undefined ? materialMeta.palettes[version]?.[recolor] : null;
  if (!colors) {
    console.error(
      `Palette colors for ${material}.${version}.${recolor} not found`,
    );
    return err({ kind: "colors-not-found", material, version, recolor });
  }
  return ok(colors);
}

export function getPalettesFromMeta(
  catalog: CatalogReader,
  meta: ItemLite | null,
): Result<Record<string, PaletteForItem>, PalettesFromMetaError> {
  if (!meta || !meta.recolors) return err({ kind: "no-recolors-on-item" });

  const sources: Record<string, PaletteForItem> = {};
  for (const palette of meta.recolors) {
    // `getBasePalette` errs when the material is unknown; preserve the legacy
    // crash-on-null destructure rather than silently masking that bug.
    const [version, source, colors] = getBasePalette(
      catalog,
      palette.material,
      palette.base ?? null,
      palette.source ?? null,
    )._unsafeUnwrap();
    sources[palette.type_name ?? meta.type_name] = {
      material: palette.material,
      version: version || (palette.default ?? ""),
      source,
      colors,
    };
  }
  return ok(sources);
}

export function fixMissingRecolor(
  catalog: CatalogReader,
  itemId: string,
  recolor: string,
  typeName: string | null = null,
): Result<string, RecolorFixError> {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return err(metaResult.error);
  const meta = metaResult.value;

  const palette = meta.recolors.find((r) => r.type_name === typeName);
  if (!palette) return err({ kind: "no-palette-for-type", typeName });

  // Recolor exists on this asset?
  if (palette.variants?.includes(recolor)) {
    return ok(recolor);
  }

  // Get material from palette metadata
  const materialMeta =
    paletteMetaOrNull(catalog)?.materials?.[palette.material];
  const [, , parsedRecolor] = parseRecolorKey(catalog, recolor, materialMeta);

  // See if recolor is non-standard for the current asset
  for (const variant of palette.variants ?? []) {
    const parts = variant.split(".");
    if (parts.length > 1 && parts.includes(parsedRecolor ?? recolor)) {
      return ok(variant);
    } else if (parsedRecolor === variant) {
      return ok(variant);
    }
  }
  return err({ kind: "no-matching-variant", recolor });
}

export function getBodyColor(
  catalog: CatalogReader,
  itemId: string,
  selections: Selections,
): Result<string, BodyColorError> {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) return err(metaResult.error);
  const meta = metaResult.value;

  if (!meta.matchBodyColor) return err({ kind: "match-body-color-disabled" });

  for (const [, selection] of Object.entries(selections)) {
    const subMeta = liteOrNull(catalog, selection.itemId);
    if (subMeta && subMeta.matchBodyColor && selection.recolor) {
      return ok(selection.recolor);
    }
  }
  return err({ kind: "no-body-colored-selection" });
}

export function getMultiRecolors(
  catalog: CatalogReader,
  itemId: string,
  selections: Selections,
  matchBodyColorEnabled: boolean = true,
): Record<string, string> | null {
  const meta = liteOrNull(catalog, itemId);
  if (!meta) return null;
  const types: string[] = [meta.type_name];
  for (const recolor of meta.recolors) {
    if (recolor.type_name && !types.includes(recolor.type_name)) {
      types.push(recolor.type_name);
    }
  }

  const recolors: Record<string, string> = {};
  for (const [, selection] of Object.entries(selections)) {
    const subMeta = liteOrNull(catalog, selection.itemId);
    const typeName =
      (selection.subId !== null && selection.subId !== undefined
        ? subMeta?.recolors?.[selection.subId]?.type_name
        : undefined) ??
      subMeta?.type_name ??
      meta.type_name;
    if (
      !subMeta ||
      !subMeta.type_name ||
      !types.includes(typeName) ||
      !subMeta.recolors.length
    )
      continue;

    const verifiedRecolor = fixMissingRecolor(
      catalog,
      itemId,
      selection.recolor ?? "",
      !selection.subId ? null : typeName,
    ).unwrapOr(null);
    if (verifiedRecolor) {
      if (selection.subId) {
        recolors[typeName] = verifiedRecolor;
      } else if (selection.recolor) {
        recolors[subMeta.type_name] = verifiedRecolor;
      }
    }
  }

  // If body color, force match body color
  if (meta.matchBodyColor && matchBodyColorEnabled) {
    const bodyColor = getBodyColor(catalog, itemId, selections).unwrapOr(null);
    if (bodyColor) recolors[meta.type_name] = bodyColor;
  }

  return Object.keys(recolors).length > 0 ? recolors : null;
}

export function get2DContext(
  canvas: HTMLCanvasElement,
  willReadFrequently: boolean = false,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) {
    throw new Error(
      "Failed to get 2D context (canvas may already have a different context type)",
    );
  }
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function hexToRgb(hex: string): Rgb | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function buildColorMap(
  sourcePalette: string[],
  targetPalette: string[],
): ColorPair[] {
  const colorPairs: ColorPair[] = [];

  for (let i = 0; i < sourcePalette.length; i++) {
    const sourceRgb = hexToRgb(sourcePalette[i]);
    const targetRgb = hexToRgb(targetPalette[i]);

    if (sourceRgb && targetRgb) {
      colorPairs.push({ source: sourceRgb, target: targetRgb });
    }
  }

  return colorPairs;
}

function findMatchingColor(
  r: number,
  g: number,
  b: number,
  colorPairs: ColorPair[],
  tolerance: number = 1,
): Rgb | null {
  for (const pair of colorPairs) {
    const dr = Math.abs(r - pair.source.r);
    const dg = Math.abs(g - pair.source.g);
    const db = Math.abs(b - pair.source.b);

    if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
      return pair.target;
    }
  }
  return null;
}

function recolorImageCPU(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  paletteMappings: PaletteMapping[],
): HTMLCanvasElement {
  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = sourceImage.width;
  canvas.height = sourceImage.height;
  const ctx = get2DContext(canvas);

  // Draw source image
  ctx.drawImage(sourceImage, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Flatten all mappings into a single color pair list
  const colorPairs: ColorPair[] = [];
  for (const { source, target } of paletteMappings) {
    const pairs = buildColorMap(source, target);
    for (const p of pairs) colorPairs.push(p);
  }

  // Recolor pixels with tolerance matching (like WebGL)
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];

    // Skip transparent pixels
    if (a === 0) continue;

    // Find matching color with tolerance
    const newColor = findMatchingColor(r, g, b, colorPairs);

    if (newColor) {
      pixels[i] = newColor.r;
      pixels[i + 1] = newColor.g;
      pixels[i + 2] = newColor.b;
      // Keep alpha unchanged
    }
  }

  // Write back
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

export function applyTransparencyMaskToCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): void {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height),
    pix = imgData.data,
    n = pix.length;

  for (let i = 0; i < n; i += 4) {
    const a = pix[i + 3];
    if (a > 0) {
      const r = pix[i];
      const g = pix[i + 1];
      const b = pix[i + 2];
      if (r === 255 && g === 44 && b === 230) {
        pix[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

export function drawFrameToFrame(
  destCtx: CanvasRenderingContext2D,
  destPos: { x: number; y: number },
  destFrameSize: number,
  src: SpriteSource,
  srcPos: { x: number; y: number },
  srcFrameSize: number,
): void {
  if (srcFrameSize === destFrameSize) {
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x,
      destPos.y,
      destFrameSize,
      destFrameSize,
    );
  } else {
    // e.g. 64×64 source centered in 128×128 dest = offset by 32px.
    const offset = (destFrameSize - srcFrameSize) / 2;
    destCtx.drawImage(
      src,
      srcPos.x,
      srcPos.y,
      srcFrameSize,
      srcFrameSize,
      destPos.x + offset,
      destPos.y + offset,
      srcFrameSize,
      srcFrameSize,
    );
  }
}

export function drawFramesToCustomAnimation(
  customAnimationContext: CanvasRenderingContext2D,
  customAnimationDefinition: CustomAnimationDefinition,
  offsetY: number,
  src: SpriteSource,
): void {
  const frameSize = customAnimationDefinition.frameSize;

  // Single-animation sprites (e.g. sit.png) are ≤256px tall; full universal
  // sheet is taller.
  const isSingleAnimation = src.height <= 256;

  for (let i = 0; i < customAnimationDefinition.frames.length; ++i) {
    const frames = customAnimationDefinition.frames[i];
    for (let j = 0; j < frames.length; ++j) {
      const frameSpec = frames[j]; // e.g. "sit-n,2"
      const [srcRowName, srcColumnStr] = frameSpec.split(",");
      const srcColumn = parseInt(srcColumnStr);

      let srcRow: number;
      if (isSingleAnimation) {
        // Rows 0-3 = n, w, s, e. Extract direction from e.g. "sit-n".
        const direction = srcRowName.split("-")[1];
        const directionMap: Record<string, number> = { n: 0, w: 1, s: 2, e: 3 };
        srcRow = directionMap[direction] || 0;
      } else {
        srcRow = animationRowsLayout ? animationRowsLayout[srcRowName] : i;
      }

      const srcX = FRAME_SIZE * srcColumn;
      const srcY = FRAME_SIZE * srcRow;
      const destX = frameSize * j;
      const destY = frameSize * i + offsetY;

      drawFrameToFrame(
        customAnimationContext,
        { x: destX, y: destY },
        frameSize,
        src,
        { x: srcX, y: srcY },
        FRAME_SIZE,
      );
    }
  }
}

export function drawSingleAnimSpriteToCustomAnimation(
  ctx: CanvasRenderingContext2D,
  customAnimDef: CustomAnimationDefinition,
  offsetY: number,
  src: SpriteSource,
): void {
  const frameSize = customAnimDef.frameSize;
  const srcFrameSize = Math.round(src.height / 4); // 4 rows: n=0, w=1, s=2, e=3
  const directionMap: Record<string, number> = { n: 0, w: 1, s: 2, e: 3 };

  for (let i = 0; i < customAnimDef.frames.length; i++) {
    const frames = customAnimDef.frames[i];
    for (let j = 0; j < frames.length; j++) {
      const frameSpec = frames[j]; // e.g. "slash-n,5"
      const [srcRowName, srcColumnStr] = frameSpec.split(",");
      const srcColumn = parseInt(srcColumnStr);
      const direction = srcRowName.split("-")[1];
      const srcRow = directionMap[direction] ?? 0;

      const srcX = srcFrameSize * srcColumn;
      const srcY = srcFrameSize * srcRow;
      const destX = frameSize * j;
      const destY = frameSize * i + offsetY;

      drawFrameToFrame(
        ctx,
        { x: destX, y: destY },
        frameSize,
        src,
        { x: srcX, y: srcY },
        srcFrameSize,
      );
    }
  }
}
import {ok,err} from 'neverthrow';
const pathDeps={variantToFilename,es6DynamicTemplate,animations:ANIMATIONS,debugLog:()=>{}};
export {ok,err,recolorImageCPU};
import {animationRowsLayout} from './custom-animations.ts';export {animationRowsLayout,customAnimations,customAnimationSize,customAnimationBase} from './custom-animations.ts';
