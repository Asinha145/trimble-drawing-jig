import * as WorkspaceAPI from 'trimble-connect-workspace-api';
import type { HierarchyEntity } from 'trimble-connect-workspace-api';
import { GetModelID } from './TCFixtureTable';

export type RGBA = { r: number; g: number; b: number; a: number };
export type AABB = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export type RTWFamily = 'VLBH' | 'VLBS' | 'VLBC' | 'HLBU' | 'HLBL' | 'HLCU' | 'MLL' | 'MLU' | 'HSB' | 'MLS';
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
  rebarLength?: number; // length in mm from IFC properties (e.g., bim2cam:Rebar:Length)
  couplerType?: string; // coupler type (e.g., MALE+BRIDGING, FEMALE+BRIDGING) from IFC:Rebar:Coupler Type on Short Leg
  cogX?: number; // center of gravity X from CalculatedGeometryValues (in meters)
  cogY?: number; // center of gravity Y from CalculatedGeometryValues (in meters)
  cogZ?: number; // center of gravity Z from CalculatedGeometryValues (in meters)
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
  const families: RTWFamily[] = ['VLBH', 'VLBS', 'VLBC', 'HLBU', 'HLBL', 'HLCU', 'MLL', 'MLU', 'HSB', 'MLS'];
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
  MLS:  { r: 255, g: 255, b: 0,   a: 255 },
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

// Helper: race against a timeout
const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T | null> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<null>(resolve => {
    timeoutHandle = setTimeout(() => {
      console.warn(`[JIG] TIMEOUT after ${timeoutMs}ms on ${label}`);
      resolve(null);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export const getJigObjects = async (API: WorkspaceAPI.WorkspaceAPI): Promise<JigData> => {
  console.log('[JIG] ── getJigObjects START ─────────────────────');

  // ── Step 1: model ID ────────────────────────────────────────────────────────
  console.log('[JIG] Step 1: resolving modelID...');
  const modelID = await withTimeout(GetModelID(API), 10000, 'GetModelID') as string | null;
  if (!modelID) {
    console.error('[JIG] Step 1: FAILED - modelID timeout or error');
    return { modelID: '', objects: [], rtwById: new Map(), boundingBox: undefined, datumValue: undefined, datumX: undefined };
  }
  console.log('[JIG] Step 1: modelID =', modelID);

  // ── Step 2: object list ─────────────────────────────────────────────────────
  console.log('[JIG] Step 2: fetching object list...');
  const objectListArray = await withTimeout(Promise.resolve(API.viewer.getObjects()), 10000, 'getObjects') as any;
  if (!objectListArray) {
    console.error('[JIG] Step 2: FAILED - getObjects timeout');
    return { modelID, objects: [], rtwById: new Map(), boundingBox: undefined, datumValue: undefined, datumX: undefined };
  }
  const rawList = objectListArray[0]?.objects as Array<{ id: number }>;
  if (!rawList) {
    console.error('[JIG] Step 2: FAILED - no objects in result');
    return { modelID, objects: [], rtwById: new Map(), boundingBox: undefined, datumValue: undefined, datumX: undefined };
  }
  console.log('[JIG] Step 2: total objects =', rawList.length,
    '| id type sample =', typeof rawList[0]?.id,
    '| first id =', rawList[0]?.id);

  // ── Step 3: props + bbox per object ────────────────────────────────────────
  console.log('[JIG] Step 3: fetching props + bbox for each object...');
  const raw: Array<{ id: number; partNumber: string; scribeText: string; bbox: AABB | null; rebarLength?: number; couplerType?: string; cogX?: number; cogY?: number; cogZ?: number }> = [];
  let emptyPartCount = 0;
  let debugLogged = false;
  for (let i = 0; i < rawList.length; i++) {
    const obj = rawList[i];
    if (i % 10 === 0) console.log(`[JIG] Step 3: progress ${i}/${rawList.length}`);
    try {
      const propsArr = await withTimeout(Promise.resolve(API.viewer.getObjectProperties(modelID, [obj.id])), 2000, `getObjectProperties[${i}]`);
      const bbArr = await withTimeout(Promise.resolve(API.viewer.getObjectBoundingBoxes(modelID, [obj.id])), 2000, `getObjectBoundingBoxes[${i}]`);
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
      const rebarLengthStr = getPropValue(props, 'SOLIDWORKS Custom Properties', 'bim2cam:Rebar:Length');
      const rebarLength = rebarLengthStr ? parseFloat(rebarLengthStr) : undefined;

      // Extract coupler type (IFC:Rebar:Coupler Type on Short Leg) to determine if MALE or FEMALE
      const couplerType = getPropValue(props, 'SOLIDWORKS Custom Properties', 'IFC:Rebar:Coupler Type on Short Leg') ||
                          getPropValue(props, 'SOLIDWORKS Custom Properties', 'IFC:Rebar:Coupler Type');

      // Debug: log REB objects and their available property sets
      if (partNumber.includes('-REB-')) {
        console.log(`[JIG] REB object ${partNumber}: pset names = ${props.map((p: any) => p.name).join(', ')}`);
        if (couplerType) {
          console.log(`[JIG]   → found coupler: ${couplerType}`);
        } else {
          console.log(`[JIG]   → NO coupler found in SOLIDWORKS Custom Properties`);
          // Try to find coupler in other psets
          const allProps = props.flatMap((p: any) => p.properties || []).map((p: any) => p.name);
          const coupler = allProps.find((pn: string) => pn.toLowerCase().includes('coupler'));
          if (coupler) console.log(`[JIG]   → BUT found property: ${coupler}`);
        }
      }

      // Extract COG from CalculatedGeometryValues
      const cogXStr = getPropValue(props, 'CalculatedGeometryValues', 'CenterOfGravityX');
      const cogYStr = getPropValue(props, 'CalculatedGeometryValues', 'CenterOfGravityY');
      const cogZStr = getPropValue(props, 'CalculatedGeometryValues', 'CenterOfGravityZ');
      const cogX = cogXStr ? parseFloat(cogXStr) / 1000 : undefined; // convert mm to meters
      const cogY = cogYStr ? parseFloat(cogYStr) / 1000 : undefined;
      const cogZ = cogZStr ? parseFloat(cogZStr) / 1000 : undefined;

      raw.push({
        id: obj.id,
        partNumber,
        scribeText: getPropValue(props, 'SOLIDWORKS Custom Properties', 'bim2cam:Scribe text'),
        bbox: bbArr?.[0]?.boundingBox ?? null,
        rebarLength,
        couplerType,
        cogX,
        cogY,
        cogZ,
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
      rebarLength: r.rebarLength,
      couplerType: r.couplerType,
      cogX: r.cogX,
      cogY: r.cogY,
      cogZ: r.cogZ,
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
  // Note: datum extraction from properties happens in JigPanel via API

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

    case 9: // COG - Show all components except SZN, PAL, PLT with semantic colours
      for (const o of objects) {
        if (o.family === 'OTHER') continue;
        if (o.family === 'SZN' || o.family === 'PAL' || o.family === 'PLT') { add(o.id, HIDDEN, false); continue; }
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
      const colour = hotPink && focused ? HOT_PINK : withAlpha(RTW_COLOURS[o.rtwFamily!], focused ? 255 : 242);
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
  rtw: JigObject | AABB,
  strChildren: JigObject[],
  rebChildren?: JigObject[]
): DimSegment[] => {
  // Stringers sit at different Z heights along the vertical bar assembly.
  // Dimensions run along Z, drawn at the assembly's right edge (max.x).
  // Adjacent stringers (gap ≤ 2 mm end-to-start) are merged into one cluster.
  // Each cluster emits one dim: from REB bottom (skipping coupler) to the cluster's first stringer zMin.

  // Support both JigObject and raw AABB for backward compatibility
  const rtwBbox = (rtw as any).bbox ? (rtw as any).bbox : (rtw as AABB);
  const dimX   = rtwBbox.max.x * 1000;
  const cogY   = ((rtwBbox.min.y + rtwBbox.max.y) / 2) * 1000;

  // View 3: Use individual REB object's bbox (not RTW's), matching View 4's approach
  let datumZ = rtwBbox.min.z * 1000;

  if (rebChildren && rebChildren.length > 0) {
    const reb = rebChildren[0];  // Get the REB child object
    if (reb.bbox) {
      // Coupler logic (positional/bridging):
      // - MALE+BRIDGING: bridging extends beyond bar → subtract length from bbox.max
      // - FEMALE+BRIDGING: coupler at end, no extension → use bbox.min normally
      // - MALE or FEMALE (alone): no bridging component → use bbox.min normally
      const isMaleBridging = reb.couplerType && reb.couplerType.includes('MALE+BRIDGING');

      console.log(`[JIG] View3 DEBUG: ${reb.partNumber}, coupler='${reb.couplerType}', isMaleBridging=${isMaleBridging}, rebarLength=${reb.rebarLength}, bbox.min.z=${reb.bbox.min.z}, bbox.max.z=${reb.bbox.max.z}`);

      if (isMaleBridging && reb.rebarLength !== undefined) {
        // MALE+BRIDGING: bridging extends beyond bar, subtract length to skip coupler
        datumZ = (reb.bbox.max.z - reb.rebarLength / 1000) * 1000;
        console.log(`[JIG] View3: MALE+BRIDGING detected, using REB bbox.max - rebarLength=${reb.rebarLength}mm for ${reb.partNumber}, datumZ=${datumZ}`);
      } else {
        // FEMALE+BRIDGING, MALE, FEMALE, or no coupler: use REB's bbox min.z (normal position)
        datumZ = reb.bbox.min.z * 1000;
        console.log(`[JIG] View3: using REB bbox.min for ${reb.partNumber} (coupler: ${reb.couplerType || 'none'}), datumZ=${datumZ}`);
      }
    }
  }

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

// View 5: HLBU/HLCU/HLBL only — REB includes coupler in bbox, use rebarLength for actual REB position
export const buildHSBDimension = (
  reb: JigObject | AABB,
  strChildren: JigObject[],
  datumX: number
): DimSegment | null => {
  // Filter vertical STRs only
  const strs = strChildren.filter(s => s.family === 'STR' && s.bbox && (() => {
    const b = s.bbox!;
    const dx = Math.abs(b.max.x - b.min.x);
    const dy = Math.abs(b.max.y - b.min.y);
    const dz = Math.abs(b.max.z - b.min.z);
    return dz > dx && dz > dy; // vertical STR only
  })());
  if (!strs.length) return null;

  // Support both JigObject and raw AABB for backward compatibility
  const rebBbox = (reb as any).bbox ? (reb as any).bbox : (reb as AABB);
  const cogY = ((rebBbox.min.y + rebBbox.max.y) / 2) * 1000;
  const cogZ = ((rebBbox.min.z + rebBbox.max.z) / 2) * 1000;

  // View 5: REB bbox includes coupler, use rebarLength to detect coupler, but use bbox for final position
  const rebMinX = rebBbox.min.x;
  const rebMaxX = rebBbox.max.x;

  let rebEndX: number;
  const rebarLength = (reb as any).rebarLength;
  const couplerType = (reb as any).couplerType;
  const isMaleBridging = couplerType && couplerType.includes('MALE+BRIDGING');

  if (rebarLength !== undefined) {
    // Calculate actual bar extent from center using rebarLength (for coupler detection only)
    const rebCenterX = (rebMinX + rebMaxX) / 2;
    const rebHalfLength = rebarLength / 2000;
    const rebStart = rebCenterX - rebHalfLength;
    const rebEnd = rebCenterX + rebHalfLength;

    // Determine which end is FIXED using rebar positions
    const distToStart = Math.abs(rebStart - datumX);
    const distToEnd = Math.abs(rebEnd - datumX);
    const isFixedAtStart = distToStart < distToEnd;

    // Determine which end is SHORT (measured from center)
    const isShortAtStart = Math.abs(rebStart - rebCenterX) <= Math.abs(rebEnd - rebCenterX);
    const shortEndX = isShortAtStart ? rebStart : rebEnd;
    const fixedFromRebar = isFixedAtStart ? rebStart : rebEnd;

    // Coupler is at SHORT end; check if SHORT is at FIXED position
    const isShortAtFixed = Math.abs(shortEndX - fixedFromRebar) < 0.001;

    // Determine FIXED end from bbox (the one we'll use for measurement)
    const distToMinX = Math.abs(rebMinX - datumX);
    const distToMaxX = Math.abs(rebMaxX - datumX);
    const fixedFromBbox = distToMinX < distToMaxX ? rebMinX : rebMaxX;

    if (isMaleBridging && isShortAtFixed) {
      // Coupler is at FIXED end: exclude it by using rebar-based position
      rebEndX = fixedFromRebar * 1000;
      console.log(`[JIG] View5: SHORT@FIXED+MALE+BRIDGING for ${(reb as any).partNumber}, excluding coupler, rebEndX=${rebEndX}`);
    } else {
      // Coupler is at FAR end or no coupler: use bbox-based position (includes 19mm)
      rebEndX = fixedFromBbox * 1000;
      console.log(`[JIG] View5: using bbox for ${(reb as any).partNumber} (coupler: ${couplerType || 'none'}, short@fixed: ${isShortAtFixed}), rebEndX=${rebEndX}`);
    }
  } else {
    // Fallback: use bbox directly if rebarLength not available
    const distToMinX = Math.abs(rebMinX - datumX);
    const distToMaxX = Math.abs(rebMaxX - datumX);
    rebEndX = distToMinX < distToMaxX ? rebMinX * 1000 : rebMaxX * 1000;
  }

  // Find closest STR to datum
  let closestStr: JigObject | null = null;
  let minStrDist = Infinity;
  for (const str of strs) {
    const strCenterX = (str.bbox!.min.x + str.bbox!.max.x) / 2;
    const dist = Math.abs(strCenterX - datumX);
    if (dist < minStrDist) {
      minStrDist = dist;
      closestStr = str;
    }
  }

  if (!closestStr || !closestStr.bbox) return null;

  // Find closest edge of that STR to the datum
  const strMinX = closestStr.bbox.min.x * 1000;
  const strMaxX = closestStr.bbox.max.x * 1000;
  const strDatumMinX = Math.abs(closestStr.bbox.min.x - datumX);
  const strDatumMaxX = Math.abs(closestStr.bbox.max.x - datumX);
  const strEdgeX = strDatumMinX < strDatumMaxX ? strMinX : strMaxX;

  return { startX: rebEndX, startY: cogY, startZ: cogZ, endX: strEdgeX, endY: cogY, endZ: cogZ };
};

// View 4: Vertical bars → vertical measurements only (pure Z direction)
// For each bar mark: 1 dimension from bar bottom to horizontal bar level (keeping X,Y same)
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
    isRebarFamily(o.family) && o.bbox && !verticalBars.includes(o)
  );

  if (!verticalBars.length || !horizontalBars.length) return [];

  // ── find bottommost horizontal bar (lowest Z) ──────────────────────────────
  let bottomHorizBar: typeof objects[0] | null = null;
  let minZ = Infinity;
  for (const hBar of horizontalBars) {
    if (hBar.bbox && hBar.bbox.min.z < minZ) {
      minZ = hBar.bbox.min.z;
      bottomHorizBar = hBar;
    }
  }

  if (!bottomHorizBar || !bottomHorizBar.bbox) return [];

  const horizCogZ = (bottomHorizBar.bbox.min.z + bottomHorizBar.bbox.max.z) / 2 * 1000;

  // ── group vertical bars by mark, sorted by distance from datum ──────────────
  const barsByMark = new Map<string, typeof verticalBars>();
  for (const bar of verticalBars) {
    const mark = extractBarMark(bar.partNumber);
    if (!barsByMark.has(mark)) {
      barsByMark.set(mark, []);
    }
    barsByMark.get(mark)!.push(bar);
  }

  // Sort each mark's bars by distance from datum (closest first)
  for (const [_, bars] of barsByMark) {
    bars.sort((a, b) => {
      const distA = Math.abs((a.bbox!.min.x + a.bbox!.max.x) / 2 - datumX);
      const distB = Math.abs((b.bbox!.min.x + b.bbox!.max.x) / 2 - datumX);
      return distA - distB;
    });
  }

  // ── create 1 vertical dimension per bar mark (closest to datum) ──────────────
  const segments: DimSegment[] = [];

  for (const [barMark, bars] of barsByMark) {
    // Use only the closest bar to datum
    const vertBar = bars[0];
    if (!vertBar.bbox) continue;

    const vertBarCogX = (vertBar.bbox.min.x + vertBar.bbox.max.x) / 2 * 1000;
    const vertBarCogY = (vertBar.bbox.min.y + vertBar.bbox.max.y) / 2 * 1000;

    // Coupler logic (positional/bridging):
    // - MALE+BRIDGING: bridging extends beyond bar → subtract length from bbox.max
    // - FEMALE+BRIDGING: coupler at end, no extension → use bbox.min normally
    // - MALE or FEMALE (alone): no bridging component → use bbox.min normally
    let vertBarBottomZ = vertBar.bbox.min.z * 1000;
    const isMaleBridging = vertBar.couplerType && vertBar.couplerType.includes('MALE+BRIDGING');

    if (isMaleBridging && vertBar.rebarLength !== undefined) {
      // MALE+BRIDGING: bridging extends beyond bar, subtract length to skip coupler
      vertBarBottomZ = (vertBar.bbox.max.z - vertBar.rebarLength / 1000) * 1000;
      console.log(`[JIG] View4: MALE+BRIDGING detected, using bbox.max - rebarLength=${vertBar.rebarLength}mm for ${vertBar.partNumber}, bottomZ=${vertBarBottomZ}`);
    } else {
      // FEMALE+BRIDGING, MALE, FEMALE, or no coupler: use bbox.min.z (normal position)
      console.log(`[JIG] View4: using bbox.min for ${vertBar.partNumber} (coupler: ${vertBar.couplerType || 'none'}), bottomZ=${vertBarBottomZ}`);
    }

    // Pure vertical dimension: same X,Y from bottom to horizontal bar level
    segments.push({
      startX: vertBarCogX,
      startY: vertBarCogY,
      startZ: vertBarBottomZ,
      endX: vertBarCogX,  // Keep X same
      endY: vertBarCogY,  // Keep Y same
      endZ: horizCogZ,    // Only Z changes
    });
  }

  return segments;
};

// Extract bar mark from part number (e.g., "M1613A-REB-3027" → "3027")
const extractBarMark = (partNumber: string): string => {
  const parts = partNumber.split('-');
  return parts[parts.length - 1] || partNumber;
};

// View 6: Horizontal bars → pure horizontal dimensions only (2D horizontal plane, X direction only)
// For each bar mark: 1 dimension from bar end (closest to datum) → vertical bar center X position
export const buildView6VerticalBarDimensions = (
  data: JigData,
  datumX: number  // datum reference (min X for 'left', max X for 'right')
): DimSegment[] => {
  const { objects } = data;

  // ── identify vertical and horizontal bars ──────────────────────────────────
  const verticalBars = objects.filter(o =>
    isRebarFamily(o.family) && o.bbox && (o.isVertical || (o.rtwChildOf != null && isHSBAssemblyFamily(data.rtwById.get(o.rtwChildOf)?.rtwFamily)))
  );

  const horizontalBars = objects.filter(o =>
    isRebarFamily(o.family) && o.bbox && !o.isVertical && !verticalBars.includes(o)
  );

  if (!verticalBars.length || !horizontalBars.length) return [];

  // ── find closest vertical bar to datum ─────────────────────────────────────
  let closestVertBar: typeof objects[0] | null = null;
  let minVertDist = Infinity;
  for (const vBar of verticalBars) {
    if (!vBar.bbox) continue;
    const vBarCenterX = (vBar.bbox.min.x + vBar.bbox.max.x) / 2;
    const distToDatum = Math.abs(vBarCenterX - datumX);
    if (distToDatum < minVertDist) {
      minVertDist = distToDatum;
      closestVertBar = vBar;
    }
  }

  if (!closestVertBar || !closestVertBar.bbox) return [];

  const vertCogX = (closestVertBar.bbox.min.x + closestVertBar.bbox.max.x) / 2 * 1000;

  // ── group horizontal bars by mark, sorted by distance from datum ────────────
  const barsByMark = new Map<string, typeof horizontalBars>();
  for (const bar of horizontalBars) {
    const mark = extractBarMark(bar.partNumber);
    if (!barsByMark.has(mark)) {
      barsByMark.set(mark, []);
    }
    barsByMark.get(mark)!.push(bar);
  }

  // Sort each mark's bars by distance from datum (closest first)
  for (const [_, bars] of barsByMark) {
    bars.sort((a, b) => {
      const distA = Math.abs((a.bbox!.min.x + a.bbox!.max.x) / 2 - datumX);
      const distB = Math.abs((b.bbox!.min.x + b.bbox!.max.x) / 2 - datumX);
      return distA - distB;
    });
  }

  // ── create pure horizontal dimensions for each bar mark (2D horizontal plane) ─
  const segments: DimSegment[] = [];

  for (const [barMark, bars] of barsByMark) {
    // Use closest to datum
    const horizBar = bars[0];
    if (!horizBar.bbox) continue;

    // View 6: bbox includes couplers, use rebarLength to detect coupler, but use bbox for final position
    const barMinX = horizBar.bbox.min.x;
    const barMaxX = horizBar.bbox.max.x;

    let closestEndX: number;
    const couplerType = horizBar.couplerType;
    const isMaleBridging = couplerType && couplerType.includes('MALE+BRIDGING');

    if (horizBar.rebarLength !== undefined) {
      // rebarLength is accurate bar length; calculate actual bar extent from the center
      const barCenterX = (barMinX + barMaxX) / 2;
      const barHalfLength = (horizBar.rebarLength / 1000) / 2;
      const barStart = barCenterX - barHalfLength;
      const barEnd = barCenterX + barHalfLength;

      // Determine which end is FIXED using rebar positions
      const distToStart = Math.abs(barStart - datumX);
      const distToEnd = Math.abs(barEnd - datumX);
      const isFixedAtStart = distToStart < distToEnd;

      // Determine which end is SHORT (measured from center)
      const isShortAtStart = Math.abs(barStart - barCenterX) <= Math.abs(barEnd - barCenterX);
      const shortEndX = isShortAtStart ? barStart : barEnd;
      const fixedFromRebar = isFixedAtStart ? barStart : barEnd;

      // Coupler is at SHORT end; check if SHORT is at FIXED position
      const isShortAtFixed = Math.abs(shortEndX - fixedFromRebar) < 0.001;

      // Determine FIXED end from bbox (the one we'll use for measurement)
      const distToMinX = Math.abs(barMinX - datumX);
      const distToMaxX = Math.abs(barMaxX - datumX);
      const fixedFromBbox = distToMinX < distToMaxX ? barMinX : barMaxX;

      if (isMaleBridging && isShortAtFixed) {
        // Coupler is at FIXED end: exclude it by using rebar-based position
        closestEndX = fixedFromRebar;
      } else {
        // Coupler is at FAR end or no coupler: use bbox-based position (includes 19mm)
        closestEndX = fixedFromBbox;
      }
    } else {
      // Determine which end is closest to datum (using bbox)
      const distToMinX = Math.abs(barMinX - datumX);
      const distToMaxX = Math.abs(barMaxX - datumX);
      closestEndX = distToMinX < distToMaxX ? barMinX : barMaxX;
    }

    const horizEndX = closestEndX * 1000;
    const horizCogY = (horizBar.bbox.min.y + horizBar.bbox.max.y) / 2 * 1000;
    const horizCogZ = (horizBar.bbox.min.z + horizBar.bbox.max.z) / 2 * 1000;

    const finalDimension = Math.abs(vertCogX - horizEndX);
    console.log(`[JIG] View6 FINAL for ${horizBar.partNumber}:`);
    console.log(`  horizEndX=${horizEndX.toFixed(2)}mm, vertCogX=${vertCogX.toFixed(2)}mm`);
    console.log(`  DIMENSION = |${vertCogX.toFixed(2)} - ${horizEndX.toFixed(2)}| = ${finalDimension.toFixed(2)}mm`);

    // Pure horizontal dimension: only X changes, Y and Z stay same (2D horizontal plane)
    segments.push({
      startX: horizEndX,
      startY: horizCogY,
      startZ: horizCogZ,
      endX: vertCogX,
      endY: horizCogY,  // Keep Y same
      endZ: horizCogZ,  // Keep Z same
    });
  }

  return segments;
};

// View 9: Combined COG for all visible components (except SZN, PAL, PLT)
// Uses pre-calculated COG from CalculatedGeometryValues properties
export const buildView9COGDimensions = (
  data: JigData,
  datumX: number
): {
  cogX: number;
  cogY: number;
  cogZ: number;
  vertDim?: DimSegment;
  horizDim?: DimSegment;
} | null => {
  const { objects } = data;

  // ── Filter objects with COG: exclude SZN, PAL, PLT, and RTW children ────
  // Count only top-level objects (rtwChildOf === null) to prevent double-counting
  // RTW parents and their REB/STR children in the combined COG calculation
  const objectsWithCOG = objects.filter(o =>
    o.family !== 'SZN' && o.family !== 'PAL' && o.family !== 'PLT' &&
    o.family !== 'OTHER' && o.bbox && o.cogX !== undefined && o.cogY !== undefined && o.cogZ !== undefined &&
    !o.rtwChildOf // Exclude objects that are children of RTW assemblies
  );

  if (objectsWithCOG.length === 0) return null;

  // ── Calculate average COG from all visible component COGs ──────────────────────
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const obj of objectsWithCOG) {
    if (obj.cogX !== undefined) sumX += obj.cogX;
    if (obj.cogY !== undefined) sumY += obj.cogY;
    if (obj.cogZ !== undefined) sumZ += obj.cogZ;
  }

  const avgCogX = sumX / objectsWithCOG.length;
  const avgCogY = sumY / objectsWithCOG.length;
  const avgCogZ = sumZ / objectsWithCOG.length;

  const cogX = avgCogX * 1000;
  const cogY = avgCogY * 1000;
  const cogZ = avgCogZ * 1000;

  console.log(`[JIG] View9: Combined COG (from ${objectsWithCOG.length} objects) at (${cogX.toFixed(1)}, ${cogY.toFixed(1)}, ${cogZ.toFixed(1)})`);

  // ── Get bounding box of all visible objects ────────────────────────────────────
  let globalMinX = Infinity;
  let globalMinZ = Infinity;

  for (const obj of objectsWithCOG) {
    if (!obj.bbox) continue;
    globalMinX = Math.min(globalMinX, obj.bbox.min.x);
    globalMinZ = Math.min(globalMinZ, obj.bbox.min.z);
  }

  // ── Vertical dimension: from datum X at global min Z to COG ────────────────────
  const vertDim: DimSegment = {
    startX: datumX * 1000,
    startY: cogY,
    startZ: globalMinZ * 1000,
    endX: datumX * 1000,
    endY: cogY,
    endZ: cogZ,
  };

  // ── Horizontal dimension: from global min X to COG ───────────────────────────────
  const horizDim: DimSegment = {
    startX: globalMinX * 1000,
    startY: cogY,
    startZ: cogZ,
    endX: cogX,
    endY: cogY,
    endZ: cogZ,
  };

  return { cogX, cogY, cogZ, vertDim, horizDim };
};
