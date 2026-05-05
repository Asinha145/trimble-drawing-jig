import * as WorkspaceAPI from 'trimble-connect-workspace-api';
import type { HierarchyEntity } from 'trimble-connect-workspace-api';
import { GetModelID } from './TCFixtureTable';

export type RGBA = { r: number; g: number; b: number; a: number };
export type AABB = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export type RTWFamily = 'VLBH' | 'VLBS' | 'VLBC' | 'HLBU' | 'HLBL' | 'HLCU' | 'MLL' | 'MLU' | 'HSB';
export type ObjectFamily = 'PLT' | 'PAL' | 'SZN' | 'REB' | 'REJ' | 'RB2' | 'STR' | 'LP' | 'WRA' | 'WST' | 'RTW' | 'OTHER';

export interface JigObject {
  id: number;
  partNumber: string;
  family: ObjectFamily;
  rtwFamily?: RTWFamily;
  rtwChildOf?: number; // parent RTW id if this object is a hierarchy child of an RTW
  scribeText?: string;
  bbox?: AABB;
  isVertical?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const getPropValue = (properties: any[], psetName: string, propName: string): string => {
  const pset = properties?.find((p: any) => p.name === psetName);
  if (!pset) return '';
  const prop = pset.properties?.find((p: any) => p.name === propName);
  return typeof prop?.value === 'string' ? prop.value : String(prop?.value ?? '');
};

const classifyFamily = (pn: string): ObjectFamily => {
  if (pn.includes('PAL')) return 'PAL';
  if (pn.includes('SZN')) return 'SZN';
  if (pn.includes('PLT')) return 'PLT';
  if (pn.includes('WRA') || pn.includes('WST')) return 'WRA';
  if (pn.includes('LP3') || pn.includes('LPS')) return 'LP';
  if (pn.includes('STR')) return 'STR';
  if (pn.includes('RTW') || pn.includes('RT2')) return 'RTW';
  if (pn.includes('REB')) return 'REB';
  if (pn.includes('REJ')) return 'REJ';
  if (pn.includes('RB2')) return 'RB2';
  return 'OTHER';
};

export const getRtwFamily = (pn: string): RTWFamily | undefined => {
  const families: RTWFamily[] = ['VLBH', 'VLBS', 'VLBC', 'HLBU', 'HLBL', 'HLCU', 'MLL', 'MLU', 'HSB'];
  return families.find(f => pn.includes(f));
};

const isVerticalBar = (bbox: AABB): boolean => {
  const dx = Math.abs(bbox.max.x - bbox.min.x);
  const dy = Math.abs(bbox.max.y - bbox.min.y);
  const dz = Math.abs(bbox.max.z - bbox.min.z);
  return dz > dx && dz > dy;
};

// trailing digits of RTW suffix, e.g. "VLBH01" → "1", "VLBH10" → "10"
export const getRtwSlotLabel = (partNumber: string): string => {
  const suffix = partNumber.split('-').pop() ?? '';
  const match = suffix.match(/\d+$/);
  return match ? String(parseInt(match[0], 10)) : suffix;
};

// ── colour palette ────────────────────────────────────────────────────────────

export const RTW_COLOURS: Record<RTWFamily, RGBA> = {
  VLBH: { r: 255, g: 0,   b: 0,   a: 255 },
  VLBS: { r: 255, g: 255, b: 0,   a: 255 },
  VLBC: { r: 255, g: 182, b: 193, a: 255 },
  HLBU: { r: 0,   g: 200, b: 0,   a: 255 },
  HLBL: { r: 255, g: 0,   b: 255, a: 255 },
  HSB:  { r: 0,   g: 0,   b: 255, a: 255 },
  HLCU: { r: 128, g: 0,   b: 0,   a: 255 },
  MLL:  { r: 255, g: 255, b: 0,   a: 255 },
  MLU:  { r: 255, g: 255, b: 0,   a: 255 },
};

export const ANNOTATION_RED: RGBA = { r: 255, g: 0, b: 0, a: 255 };
export const HOT_PINK: RGBA = { r: 255, g: 105, b: 180, a: 255 };
const PLT_RED: RGBA = { r: 255, g: 0, b: 0, a: 255 };
const GREY_FULL: RGBA = { r: 128, g: 128, b: 128, a: 255 };
const GREY_20: RGBA = { r: 128, g: 128, b: 128, a: 51 };
const GREY_40: RGBA = { r: 128, g: 128, b: 128, a: 102 };
const ORANGE_10: RGBA = { r: 255, g: 165, b: 0, a: 25 };
const HIDDEN: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export const withAlpha = (c: RGBA, a: number): RGBA => ({ ...c, a });

// ── main scan ────────────────────────────────────────────────────────────────

export interface JigData {
  modelID: string;
  objects: JigObject[];
  rtwById: Map<number, JigObject>;
  boundingBox?: AABB;  // overall JIG bounding box
  datumValue?: string;  // 'left' or 'right' from JigDatum property
  datumX?: number;  // computed datum reference (min X for 'left', max X for 'right')
}

export const getJigObjects = async (API: WorkspaceAPI.WorkspaceAPI): Promise<JigData> => {
  console.log('[JIG] ── getJigObjects START ─────────────────────');

  // ── Step 1: model ID ────────────────────────────────────────────────────────
  console.log('[JIG] Step 1: resolving modelID...');
  const modelID = await GetModelID(API);
  console.log('[JIG] Step 1: modelID =', modelID);

  // ── Step 2: object list ─────────────────────────────────────────────────────
  console.log('[JIG] Step 2: fetching object list...');
  const objectListArray = await API.viewer.getObjects();
  const rawList = objectListArray[0].objects as Array<{ id: number }>;
  console.log('[JIG] Step 2: total objects =', rawList.length,
    '| id type sample =', typeof rawList[0]?.id,
    '| first id =', rawList[0]?.id);

  // ── Step 3: props + bbox per object ────────────────────────────────────────
  console.log('[JIG] Step 3: fetching props + bbox for each object...');
  const raw: Array<{ id: number; partNumber: string; scribeText: string; bbox: AABB | null }> = [];
  let emptyPartCount = 0;
  let debugLogged = false;
  for (let i = 0; i < rawList.length; i++) {
    const obj = rawList[i];
    if (i % 10 === 0) console.log(`[JIG] Step 3: progress ${i}/${rawList.length}`);
    try {
      const propsArr = await API.viewer.getObjectProperties(modelID, [obj.id]);
      const bbArr = await API.viewer.getObjectBoundingBoxes(modelID, [obj.id]);
      const props = propsArr?.[0]?.properties ?? [];

      // One-time debug: log all available psets for first object to diagnose CATIA / non-SW exports
      if (!debugLogged) {
        console.log('[JIG] Step 3 DEBUG: first object pset names =', props.map((p: any) => p.name));
        console.log('[JIG] Step 3 DEBUG: first object full props =', JSON.stringify(props).slice(0, 800));
        debugLogged = true;
      }

      // Primary: SolidWorks / 3DEXPERIENCE export path
      let partNumber = getPropValue(props, 'SOLIDWORKS Custom Properties', 'bim2cam:Part Number');

      // Fallback: CATIA / other exporters store the part number as the IFC Name attribute.
      // TC surfaces this under various pset names — try common ones in order.
      if (!partNumber) partNumber = getPropValue(props, 'Attributes', 'Name');
      if (!partNumber) partNumber = getPropValue(props, 'General', 'Name');
      if (!partNumber) partNumber = getPropValue(props, 'IFC Attributes', 'Name');
      if (!partNumber) {
        // Last resort: scan every pset for a 'Name' property that looks like a part number
        for (const pset of props) {
          const nameProp = pset.properties?.find((p: any) => p.name === 'Name');
          if (nameProp && typeof nameProp.value === 'string' && nameProp.value.includes('-')) {
            partNumber = nameProp.value;
            break;
          }
        }
      }

      if (!partNumber) emptyPartCount++;
      raw.push({
        id: obj.id,
        partNumber,
        scribeText: getPropValue(props, 'SOLIDWORKS Custom Properties', 'bim2cam:Scribe text'),
        bbox: bbArr?.[0]?.boundingBox ?? null,
      });
    } catch (err) {
      console.warn('[JIG] Step 3: ERROR on object', obj.id, err);
      raw.push({ id: obj.id, partNumber: '', scribeText: '', bbox: null });
    }
  }
  console.log('[JIG] Step 3: done —', raw.length, 'objects fetched,', emptyPartCount, 'with empty partNumber');
  console.log('[JIG] Step 3: sample partNumbers (first 5):', raw.slice(0, 5).map(r => r.partNumber));

  // ── Step 4: RTW hierarchy traversal ────────────────────────────────────────
  const rtwChildMap = new Map<number, number>(); // childId → rtwId
  const rtwRaw = raw.filter(o => o.partNumber.includes('RTW') || o.partNumber.includes('RT2'));
  console.log('[JIG] Step 4: RTW objects found =', rtwRaw.length);
  console.log('[JIG] Step 4: RTW partNumbers =', rtwRaw.map(r => r.partNumber));

  const gatherDescendants = async (parentId: number, rtwId: number, depth: number) => {
    let children: HierarchyEntity[] = [];
    try {
      children = await API.viewer.getHierarchyChildren(modelID, [parentId]);
    } catch (err) {
      console.warn('[JIG] Step 4: getHierarchyChildren failed for id', parentId, err);
      return;
    }
    if (depth === 1) {
      console.log(`[JIG] Step 4: RTW id=${parentId} → ${children.length} direct children`,
        children.slice(0, 3).map(c => ({ id: c.id, idType: typeof c.id, name: (c as any).name ?? '?' })));
    }
    for (const child of children) {
      const childId = Number(child.id);
      rtwChildMap.set(childId, rtwId);
      await gatherDescendants(childId, rtwId, depth + 1);
    }
  };

  for (const rtw of rtwRaw) {
    console.log('[JIG] Step 4: traversing descendants of', rtw.partNumber, 'id=', rtw.id);
    await gatherDescendants(rtw.id, rtw.id, 1);
  }
  console.log('[JIG] Step 4: rtwChildMap total entries =', rtwChildMap.size);

  // ── Step 5: build JigObject list ────────────────────────────────────────────
  console.log('[JIG] Step 5: building JigObject list...');
  const objects: JigObject[] = raw.map(r => {
    const family = classifyFamily(r.partNumber);
    const isRebar = family === 'REB' || family === 'REJ' || family === 'RB2';
    return {
      id: r.id,
      partNumber: r.partNumber,
      family,
      rtwFamily: family === 'RTW' ? getRtwFamily(r.partNumber) : undefined,
      rtwChildOf: rtwChildMap.get(r.id),
      scribeText: r.scribeText || undefined,
      bbox: r.bbox ?? undefined,
      isVertical: isRebar && r.bbox ? isVerticalBar(r.bbox) : undefined,
    };
  });

  // family breakdown
  const familyCount: Record<string, number> = {};
  for (const o of objects) familyCount[o.family] = (familyCount[o.family] ?? 0) + 1;
  console.log('[JIG] Step 5: family breakdown =', familyCount);

  const rtwFamilyCount: Record<string, number> = {};
  for (const o of objects.filter(o => o.family === 'RTW')) {
    const f = o.rtwFamily ?? 'UNKNOWN';
    rtwFamilyCount[f] = (rtwFamilyCount[f] ?? 0) + 1;
  }
  console.log('[JIG] Step 5: RTW family breakdown =', rtwFamilyCount);

  const withParent = objects.filter(o => o.rtwChildOf != null).length;
  console.log('[JIG] Step 5: objects with rtwChildOf set =', withParent);
  console.log('[JIG] Step 5: vertical REBs =', objects.filter(o => o.isVertical).length);

  const rtwById = new Map<number, JigObject>();
  for (const o of objects) if (o.family === 'RTW') rtwById.set(o.id, o);

  // ── Step 6: Calculate bounding box ──────────────────────────────────────────
  console.log('[JIG] Step 6: calculating bounding box...');
  let boundingBox: AABB | undefined;
  let datumValue: string | undefined;
  let datumX: number | undefined;

  const allBboxes = objects.filter(o => o.bbox);
  if (allBboxes.length > 0) {
    const minX = Math.min(...allBboxes.map(o => o.bbox!.min.x));
    const maxX = Math.max(...allBboxes.map(o => o.bbox!.max.x));
    const minY = Math.min(...allBboxes.map(o => o.bbox!.min.y));
    const maxY = Math.max(...allBboxes.map(o => o.bbox!.max.y));
    const minZ = Math.min(...allBboxes.map(o => o.bbox!.min.z));
    const maxZ = Math.max(...allBboxes.map(o => o.bbox!.max.z));

    boundingBox = { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
    console.log('[JIG] Step 6: BBox X:', minX.toFixed(3), 'to', maxX.toFixed(3));
  }

  // ── Step 7: Extract datum value from JigDatum property ──────────────────────
  console.log('[JIG] Step 7: extracting datum value...');
  for (const rel of API.viewer.getObjects ? [] : []) {
    // Note: datum extraction from properties happens in JigPanel via API
  }

  console.log('[JIG] ── getJigObjects DONE ─────────────────────');
  return { modelID, objects, rtwById, boundingBox, datumValue, datumX };
};

// ── children helpers ─────────────────────────────────────────────────────────

export const getRTWChildren = (rtwId: number, objects: JigObject[]): JigObject[] =>
  objects.filter(o => o.rtwChildOf === rtwId && (
    o.family === 'STR' || o.family === 'REB' || o.family === 'REJ' || o.family === 'RB2'
  ));

// ── view groups ───────────────────────────────────────────────────────────────

export interface ViewGroup {
  ids: number[];
  colour: RGBA;
  visible: boolean;
}

export const isVLBFamily = (f?: RTWFamily) => f === 'VLBH' || f === 'VLBS' || f === 'VLBC';
export const isHSBAssemblyFamily = (f?: RTWFamily) =>
  f === 'HLBU' || f === 'HLBL' || f === 'HLCU' || f === 'HSB';
export const isRebarFamily = (f: ObjectFamily) => f === 'REB' || f === 'REJ' || f === 'RB2';

export const buildViewGroups = (viewIndex: number, { objects, rtwById }: JigData): ViewGroup[] => {
  const groupMap = new Map<string, ViewGroup>();

  const add = (id: number, colour: RGBA, visible: boolean) => {
    const k = visible ? `${colour.r},${colour.g},${colour.b},${colour.a}` : '__hidden__';
    if (!groupMap.has(k)) groupMap.set(k, { ids: [], colour, visible });
    groupMap.get(k)!.ids.push(id);
  };

  switch (viewIndex) {
    case 1: // Normal — semantic colours on everything, PAL visible
      for (const o of objects) {
        if (o.family === 'PLT') { add(o.id, PLT_RED, true); continue; }
        if (o.family === 'SZN') { add(o.id, ORANGE_10, true); continue; }
        if (o.family === 'RTW' && o.rtwFamily) { add(o.id, RTW_COLOURS[o.rtwFamily], true); continue; }
        if (o.rtwChildOf != null) {
          const parentRtw = rtwById.get(o.rtwChildOf);
          if (parentRtw?.rtwFamily) { add(o.id, RTW_COLOURS[parentRtw.rtwFamily], true); continue; }
        }
        add(o.id, GREY_FULL, true);
      }
      break;

    case 2: // Pallet view — show only PAL + PLT, hide everything else
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'PAL') { add(o.id, GREY_FULL, true); continue; }
        if (o.family === 'PLT') { add(o.id, PLT_RED, true); continue; }
        add(o.id, HIDDEN, false);
      }
      break;

    case 3: // VLB assemblies — bars coloured by RTW family
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'RTW' && isVLBFamily(o.rtwFamily)) {
          add(o.id, RTW_COLOURS[o.rtwFamily!], true);
        } else if (o.rtwChildOf != null && isVLBFamily(rtwById.get(o.rtwChildOf)?.rtwFamily)) {
          if (o.family === 'STR' || isRebarFamily(o.family)) {
            const parentRtw = rtwById.get(o.rtwChildOf)!;
            add(o.id, RTW_COLOURS[parentRtw.rtwFamily!], true);
          } else {
            add(o.id, HIDDEN, false);
          }
        } else {
          add(o.id, HIDDEN, false);
        }
      }
      break;

    case 4: // Vertical bar layout — VLB-child REBs in RTW colour, standalone vertical REBs grey
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'RTW') continue; // skip RTW nodes — hiding them cascades to children
        if (o.family === 'PAL' || o.family === 'SZN' || o.family === 'STR' ||
            o.family === 'LP' || o.family === 'WRA') {
          add(o.id, HIDDEN, false);
        } else if (o.family === 'PLT') {
          add(o.id, PLT_RED, true);
        } else if (isRebarFamily(o.family)) {
          const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
          if (parentRtw?.rtwFamily && isVLBFamily(parentRtw.rtwFamily)) {
            // VLB RTW child — show in RTW colour regardless of bar orientation
            add(o.id, RTW_COLOURS[parentRtw.rtwFamily], true);
          } else if (!parentRtw && o.isVertical) {
            // Standalone bar classified as vertical — grey backdrop
            add(o.id, GREY_FULL, true);
          } else {
            add(o.id, HIDDEN, false);
          }
        } else {
          add(o.id, HIDDEN, false);
        }
      }
      break;

    case 5: // HSB assemblies — bars coloured by RTW family
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'RTW') {
          if (isHSBAssemblyFamily(o.rtwFamily)) add(o.id, RTW_COLOURS[o.rtwFamily!], true);
          // non-HSB RTW nodes: skip (hiding cascades to children)
          continue;
        }
        if (o.rtwChildOf != null) {
          const parentRtw = rtwById.get(o.rtwChildOf);
          if (parentRtw?.rtwFamily && isHSBAssemblyFamily(parentRtw.rtwFamily)) {
            if (o.family === 'STR' || isRebarFamily(o.family))
              add(o.id, RTW_COLOURS[parentRtw.rtwFamily], true);
            else
              add(o.id, HIDDEN, false);
          } else {
            add(o.id, HIDDEN, false);
          }
        } else {
          add(o.id, HIDDEN, false);
        }
      }
      break;

    case 6: // Horizontal bar layout — REBs + STRs coloured by RTW family
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'PAL' || o.family === 'SZN') { add(o.id, HIDDEN, false); continue; }
        if (o.family === 'PLT') { add(o.id, PLT_RED, true); continue; }
        if (o.family === 'STR') {
          const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
          const c = parentRtw?.rtwFamily ? withAlpha(RTW_COLOURS[parentRtw.rtwFamily], 102) : GREY_FULL;
          add(o.id, c, true); continue;
        }
        if (o.family === 'LP' || o.family === 'WRA') { add(o.id, HIDDEN, false); continue; }
        if (o.family === 'RTW') {
          const c = o.rtwFamily
            ? (isVLBFamily(o.rtwFamily) ? withAlpha(RTW_COLOURS[o.rtwFamily], 76) : RTW_COLOURS[o.rtwFamily])
            : GREY_40;
          add(o.id, c, true); continue;
        }
        if (isRebarFamily(o.family)) {
          const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
          const base = parentRtw?.rtwFamily ? RTW_COLOURS[parentRtw.rtwFamily] : GREY_FULL;
          // vertical bars dimmed, horizontal bars at 40%
          add(o.id, withAlpha(base, o.isVertical ? 51 : 102), true); continue;
        }
        add(o.id, GREY_40, true);
      }
      break;

    case 7: // Soft zone — RTW children inherit RTW colour
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'PAL') { add(o.id, HIDDEN, false); continue; }
        if (o.family === 'SZN') { add(o.id, ORANGE_10, true); continue; }
        if (o.family === 'PLT') { add(o.id, PLT_RED, true); continue; }
        if (o.family === 'RTW' && o.rtwFamily) { add(o.id, RTW_COLOURS[o.rtwFamily], true); continue; }
        if (o.rtwChildOf != null) {
          const parentRtw = rtwById.get(o.rtwChildOf);
          if (parentRtw?.rtwFamily) { add(o.id, RTW_COLOURS[parentRtw.rtwFamily], true); continue; }
        }
        add(o.id, GREY_FULL, true);
      }
      break;

    case 8: // Lifting plates
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'PAL' || o.family === 'SZN') { add(o.id, HIDDEN, false); continue; }
        if (o.family === 'PLT') { add(o.id, PLT_RED, true); continue; }
        if (o.family === 'RTW' && o.rtwFamily) { add(o.id, RTW_COLOURS[o.rtwFamily], true); continue; }
        if (o.rtwChildOf != null) {
          const parentRtw = rtwById.get(o.rtwChildOf);
          if (parentRtw?.rtwFamily) { add(o.id, RTW_COLOURS[parentRtw.rtwFamily], true); continue; }
        }
        add(o.id, GREY_FULL, true);
      }
      break;
  }

  return Array.from(groupMap.values());
};

// ── view 3 focus groups (RTW selection) ──────────────────────────────────────

export const buildRTWFocusGroups = (
  data: JigData,
  focusedRTWIds: Set<number>,
  familyCheck: (f?: RTWFamily) => boolean,
  hotPink = false
): ViewGroup[] => {
  const { objects, rtwById } = data;
  const groupMap = new Map<string, ViewGroup>();

  const add = (id: number, colour: RGBA, visible: boolean) => {
    const k = visible ? `${colour.r},${colour.g},${colour.b},${colour.a}` : '__hidden__';
    if (!groupMap.has(k)) groupMap.set(k, { ids: [], colour, visible });
    groupMap.get(k)!.ids.push(id);
  };

  for (const o of objects) {
    if (o.family === 'OTHER') continue;
    if (o.family === 'RTW' && familyCheck(o.rtwFamily)) {
      const focused = focusedRTWIds.has(o.id);
      const colour = hotPink && focused ? HOT_PINK : withAlpha(RTW_COLOURS[o.rtwFamily!], focused ? 255 : 51);
      add(o.id, colour, true);
      continue;
    }
    if (o.rtwChildOf != null && familyCheck(rtwById.get(o.rtwChildOf)?.rtwFamily)) {
      const parentRtw = rtwById.get(o.rtwChildOf)!;
      const focused = focusedRTWIds.has(o.rtwChildOf);
      if (o.family === 'STR' || isRebarFamily(o.family)) {
        const colour = hotPink && focused ? HOT_PINK : withAlpha(RTW_COLOURS[parentRtw.rtwFamily!], focused ? 255 : 51);
        add(o.id, colour, true);
      } else {
        add(o.id, { r: 0, g: 0, b: 0, a: 0 }, false);
      }
      continue;
    }
    add(o.id, { r: 0, g: 0, b: 0, a: 0 }, false);
  }

  return Array.from(groupMap.values());
};

// ── view 4 focus groups (bar hot-pink selection) ─────────────────────────────

export const buildView4FocusGroups = (data: JigData, hotPinkIds: Set<number>): ViewGroup[] => {
  const { objects, rtwById } = data;
  const groupMap = new Map<string, ViewGroup>();

  const add = (id: number, colour: RGBA, visible: boolean) => {
    const k = visible ? `${colour.r},${colour.g},${colour.b},${colour.a}` : '__hidden__';
    if (!groupMap.has(k)) groupMap.set(k, { ids: [], colour, visible });
    groupMap.get(k)!.ids.push(id);
  };

  for (const o of objects) {
    if (o.family === 'OTHER') continue;
    if (o.family === 'RTW') continue; // never set state on RTW nodes — cascade would hide children
    if (o.family === 'PAL' || o.family === 'SZN' || o.family === 'STR' || o.family === 'LP' || o.family === 'WRA') {
      add(o.id, HIDDEN, false); continue;
    }
    if (o.family === 'PLT') {
      add(o.id, withAlpha(PLT_RED, 26), true); continue;
    }
    if (isRebarFamily(o.family)) {
      const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
      if (parentRtw?.rtwFamily && isVLBFamily(parentRtw.rtwFamily)) {
        add(o.id, hotPinkIds.has(o.id) ? HOT_PINK : withAlpha(RTW_COLOURS[parentRtw.rtwFamily], 26), true);
        continue;
      }
      if (!parentRtw && o.isVertical) {
        add(o.id, hotPinkIds.has(o.id) ? HOT_PINK : withAlpha(GREY_FULL, 26), true);
        continue;
      }
      add(o.id, HIDDEN, false); continue;
    }
    add(o.id, HIDDEN, false);
  }

  return Array.from(groupMap.values());
};

// ── view 6 focus groups (horizontal bar hot-pink selection) ──────────────────

export const buildView6FocusGroups = (data: JigData, hotPinkIds: Set<number>): ViewGroup[] => {
  const { objects, rtwById } = data;
  const groupMap = new Map<string, ViewGroup>();

  const add = (id: number, colour: RGBA, visible: boolean) => {
    const k = visible ? `${colour.r},${colour.g},${colour.b},${colour.a}` : '__hidden__';
    if (!groupMap.has(k)) groupMap.set(k, { ids: [], colour, visible });
    groupMap.get(k)!.ids.push(id);
  };

  for (const o of objects) {
    if (o.family === 'OTHER') continue;
    if (o.family === 'RTW') {
      // HSB-family and MLL/MLU RTW nodes stay fully visible always
      if (o.rtwFamily && (isHSBAssemblyFamily(o.rtwFamily) || o.rtwFamily === 'MLL' || o.rtwFamily === 'MLU')) {
        add(o.id, RTW_COLOURS[o.rtwFamily], true);
      }
      // VLB RTW nodes: leave unchanged (skip)
      continue;
    }
    if (o.family === 'PAL' || o.family === 'SZN' || o.family === 'LP' || o.family === 'WRA') {
      add(o.id, HIDDEN, false); continue;
    }
    if (o.family === 'PLT') {
      add(o.id, withAlpha(PLT_RED, 26), true); continue;
    }
    if (o.family === 'STR') {
      const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
      const base = parentRtw?.rtwFamily ? RTW_COLOURS[parentRtw.rtwFamily] : GREY_FULL;
      add(o.id, withAlpha(base, 26), true); continue;
    }
    if (isRebarFamily(o.family)) {
      const parentRtw = o.rtwChildOf != null ? rtwById.get(o.rtwChildOf) : undefined;
      const base = parentRtw?.rtwFamily ? RTW_COLOURS[parentRtw.rtwFamily] : GREY_FULL;
      if (o.isVertical) {
        add(o.id, withAlpha(base, 26), true);
      } else if (hotPinkIds.has(o.id)) {
        add(o.id, HOT_PINK, true);
      } else {
        add(o.id, withAlpha(base, 26), true);
      }
      continue;
    }
    add(o.id, HIDDEN, false);
  }

  return Array.from(groupMap.values());
};

// ── dimension helpers ─────────────────────────────────────────────────────────

// View 3: VWS-style — gaps from RTW.min.x to each stringer.min.x, filtered for non-overlapping
export interface DimSegment {
  startX: number; startY: number; startZ: number;
  endX: number;   endY: number;   endZ: number;
}

export const buildVLBDimensions = (
  rtwBbox: AABB,
  strChildren: JigObject[]
): DimSegment[] => {
  // Stringers sit at different Z heights along the vertical bar assembly.
  // Dimensions run along Z, drawn at the assembly's right edge (max.x).
  // Adjacent stringers (gap ≤ 2 mm end-to-start) are merged into one cluster.
  // Each cluster emits one dim: from datumZ (bar bottom) to the cluster's first stringer zMin.
  const dimX   = rtwBbox.max.x * 1000;
  const cogY   = ((rtwBbox.min.y + rtwBbox.max.y) / 2) * 1000;
  const datumZ = rtwBbox.min.z * 1000;

  const positions = strChildren
    .filter(s => s.bbox)
    .map(s => ({
      zMin: s.bbox!.min.z * 1000,
      zMax: s.bbox!.max.z * 1000,
    }))
    .sort((a, b) => a.zMin - b.zMin);

  if (!positions.length) return [];

  const segments: DimSegment[] = [];
  let groupStartZ = positions[0].zMin;
  let groupEndZ   = positions[0].zMax;

  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i].zMin - groupEndZ;
    if (gap <= 2) {
      groupEndZ = Math.max(groupEndZ, positions[i].zMax);
    } else {
      segments.push({
        startX: dimX, startY: cogY, startZ: datumZ,
        endX:   dimX, endY:   cogY, endZ:   groupStartZ,
      });
      groupStartZ = positions[i].zMin;
      groupEndZ   = positions[i].zMax;
    }
  }
  segments.push({
    startX: dimX, startY: cogY, startZ: datumZ,
    endX:   dimX, endY:   cogY, endZ:   groupStartZ,
  });

  return segments;
};

// View 5: HLBU/HLCU/HLBL only — from REB.bbox.min.x to nearest edge of closest STR
export const buildHSBDimension = (
  rebBbox: AABB,
  strChildren: JigObject[]
): DimSegment | null => {
  const strs = strChildren.filter(s => s.family === 'STR' && s.bbox && (() => {
    const b = s.bbox!;
    const dx = Math.abs(b.max.x - b.min.x);
    const dy = Math.abs(b.max.y - b.min.y);
    const dz = Math.abs(b.max.z - b.min.z);
    return dz > dx && dz > dy; // vertical STR only
  })());
  if (!strs.length) return null;

  const rebMinX = rebBbox.min.x * 1000;
  const cogY    = ((rebBbox.min.y + rebBbox.max.y) / 2) * 1000;
  const cogZ    = ((rebBbox.min.z + rebBbox.max.z) / 2) * 1000;

  let closestEdgeX = Infinity;
  for (const str of strs) {
    const minX = str.bbox!.min.x * 1000;
    const maxX = str.bbox!.max.x * 1000;
    const edge = Math.abs(minX - rebMinX) < Math.abs(maxX - rebMinX) ? minX : maxX;
    if (Math.abs(edge - rebMinX) < Math.abs(closestEdgeX - rebMinX)) closestEdgeX = edge;
  }

  if (!isFinite(closestEdgeX)) return null;
  return { startX: rebMinX, startY: cogY, startZ: cogZ, endX: closestEdgeX, endY: cogY, endZ: cogZ };
};

// View 4: Vertical bars → measurements from bar bottom to closest horizontal bar center
// Groups by unique bar mark — one measurement per unique mark
export const buildView4VerticalBarDimensions = (
  data: JigData,
  datumX: number  // datum reference (min X for 'left', max X for 'right')
): DimSegment[] => {
  const { objects } = data;

  // ── identify vertical and horizontal bars ──────────────────────────────────
  const verticalBars = objects.filter(o =>
    isRebarFamily(o.family) && o.bbox && (o.isVertical || (o.rtwChildOf != null && isVLBFamily(data.rtwById.get(o.rtwChildOf)?.rtwFamily)))
  );

  const horizontalBars = objects.filter(o =>
    isRebarFamily(o.family) && o.bbox && !verticalBars.includes(o) && o.family !== 'OTHER'
  );

  if (!verticalBars.length || !horizontalBars.length) return [];

  // ── sort vertical bars by distance from datum (closest first) ──────────────
  const barsWithDist = verticalBars.map(bar => ({
    bar,
    barMark: extractBarMark(bar.partNumber),
    distFromDatum: Math.abs((bar.bbox!.min.x + bar.bbox!.max.x) / 2 - datumX),
  }));

  barsWithDist.sort((a, b) => a.distFromDatum - b.distFromDatum);

  // ── group by unique bar mark ───────────────────────────────────────────────
  const barsByMark = new Map<string, typeof barsWithDist[0]>();
  for (const item of barsWithDist) {
    if (!barsByMark.has(item.barMark)) {
      barsByMark.set(item.barMark, item);
    }
  }

  // ── create one measurement per unique bar mark ─────────────────────────────
  const segments: DimSegment[] = [];

  for (const [barMark, { bar: vertBar }] of barsByMark) {
    if (!vertBar.bbox) continue;

    // Start: bottom of vertical bar (min.z)
    const vertBarCogX = (vertBar.bbox.min.x + vertBar.bbox.max.x) / 2 * 1000;
    const vertBarCogY = (vertBar.bbox.min.y + vertBar.bbox.max.y) / 2 * 1000;
    const vertBarBottomZ = vertBar.bbox.min.z * 1000;

    // Find closest horizontal bar
    let closestHorizBar: typeof objects[0] | null = null;
    let minDist = Infinity;

    for (const horizBar of horizontalBars) {
      if (!horizBar.bbox) continue;

      const horizCogX = (horizBar.bbox.min.x + horizBar.bbox.max.x) / 2;
      const horizCogY = (horizBar.bbox.min.y + horizBar.bbox.max.y) / 2;
      const horizCogZ = (horizBar.bbox.min.z + horizBar.bbox.max.z) / 2;

      // 3D distance
      const dx = horizCogX - (vertBar.bbox.min.x + vertBar.bbox.max.x) / 2;
      const dy = horizCogY - (vertBar.bbox.min.y + vertBar.bbox.max.y) / 2;
      const dz = horizCogZ - (vertBar.bbox.min.z + vertBar.bbox.max.z) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < minDist) {
        minDist = dist;
        closestHorizBar = horizBar;
      }
    }

    if (!closestHorizBar || !closestHorizBar.bbox) continue;

    // End: center of horizontal bar
    const horizCogX = (closestHorizBar.bbox.min.x + closestHorizBar.bbox.max.x) / 2 * 1000;
    const horizCogY = (closestHorizBar.bbox.min.y + closestHorizBar.bbox.max.y) / 2 * 1000;
    const horizCogZ = (closestHorizBar.bbox.min.z + closestHorizBar.bbox.max.z) / 2 * 1000;

    segments.push({
      startX: vertBarCogX,
      startY: vertBarCogY,
      startZ: vertBarBottomZ,
      endX: horizCogX,
      endY: horizCogY,
      endZ: horizCogZ,
    });
  }

  return segments;
};

// Extract bar mark from part number (e.g., "M1613A-REB-3027" → "3027")
const extractBarMark = (partNumber: string): string => {
  const parts = partNumber.split('-');
  return parts[parts.length - 1] || partNumber;
};
