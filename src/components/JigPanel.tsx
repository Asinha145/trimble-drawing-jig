import React, { useState, useEffect } from 'react';
import type { ObjectSelector, ObjectState } from 'trimble-connect-workspace-api';
import {
  getJigObjects,
  buildViewGroups,
  buildRTWFocusGroups,
  buildView4FocusGroups,
  buildView6FocusGroups,
  getRTWChildren,
  buildVLBDimensions,
  buildHSBDimension,
  buildView4VerticalBarDimensions,
  buildView6VerticalBarDimensions,
  isVLBFamily,
  isHSBAssemblyFamily,
  isRebarFamily,
  RTW_COLOURS,
  ANNOTATION_RED,
  type JigData,
  type JigObject,
  type RTWFamily,
  type ViewGroup,
} from '../module/TCJigData';
import './JigPanel.css';

interface Props {
  API: any;
  modelName: string;
}

type ViewIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const VIEW_LABELS: Record<ViewIndex, string> = {
  1: '1 Normal',
  2: '2 Pallet',
  3: '3 VLB Assy',
  4: '4 Vert Bars',
  5: '5 HSB Assy',
  6: '6 Horiz Bars',
  7: '7 Soft Zone',
  8: '8 Lift Plates',
};

const isHSBDimFamily = (f?: RTWFamily) => f === 'HLBU' || f === 'HLBL' || f === 'HLCU';

export const JigPanel: React.FC<Props> = ({ API, modelName }) => {
  const [loading, setLoading] = useState(true);
  const [jigData, setJigData] = useState<JigData | null>(null);
  const [activeView, setActiveView] = useState<ViewIndex>(1);
  const [selectedRTWLabel, setSelectedRTWLabel] = useState<string | null>(null);

  useEffect(() => {
    const initJigData = async () => {
      const data = await getJigObjects(API);

      // Extract datum value from main JIG element properties
      if (API.viewer) {
        try {
          const modelID = data.modelID;
          const allObjects = await API.viewer.getObjects();
          const objects = allObjects[0]?.objects || [];

          // Find main JIG proxy
          for (const obj of objects) {
            const props = await API.viewer.getObjectProperties(modelID, [obj.id]);
            const objProps = props[0]?.properties || [];

            // Look for JigDatum property set
            for (const pset of objProps) {
              if (pset.name === 'JigDatum') {
                for (const prop of pset.properties || []) {
                  if (prop.name === 'Datum') {
                    const datumValue = String(prop.value).toLowerCase();
                    if (data.boundingBox) {
                      const datumX = datumValue === 'left'
                        ? data.boundingBox.min.x
                        : data.boundingBox.max.x;
                      data.datumValue = datumValue;
                      data.datumX = datumX;
                      console.log(`[JigPanel] Datum: '${datumValue}' → X = ${datumX.toFixed(3)}`);
                    }
                    break;
                  }
                }
                break;
              }
            }
            if (data.datumValue) break;
          }
        } catch (err) {
          console.warn('[JigPanel] Failed to extract datum:', err);
        }
      }

      setJigData(data);
      setLoading(false);
      API.extension.requestFocus();
    };

    initJigData();
  }, []);

  // ── apply view colour state to TC viewer ──────────────────────────────────

  const applyViewState = async (viewIndex: ViewIndex, data: JigData) => {
    await API.markup.removeMarkups();
    await API.viewer.reset();

    const groups = buildViewGroups(viewIndex, data);
    for (const group of groups) {
      if (!group.ids.length) continue;
      const selector: ObjectSelector = {
        modelObjectIds: [{ modelId: data.modelID, objectRuntimeIds: group.ids }],
      };
      const state: ObjectState = group.visible
        ? { color: group.colour, visible: true }
        : { visible: false };
      await API.viewer.setObjectState(selector, state);
    }
  };

  const applyColourGroupsOnly = async (groups: ViewGroup[], modelID: string) => {
    for (const group of groups) {
      if (!group.ids.length) continue;
      const selector: ObjectSelector = { modelObjectIds: [{ modelId: modelID, objectRuntimeIds: group.ids }] };
      const state: ObjectState = group.visible ? { color: group.colour, visible: true } : { visible: false };
      await API.viewer.setObjectState(selector, state);
    }
  };

  // ── annotation helpers ────────────────────────────────────────────────────

  const annotateAt = async (x: number, y: number, z: number, text: string) => {
    await API.markup.addTextMarkup([{
      start: { positionX: x, positionY: y, positionZ: z },
      end:   { positionX: x, positionY: y + 100, positionZ: z },
      text,
      color: ANNOTATION_RED,
    }]);
  };

  const addDim = async (sx: number, sy: number, sz: number, ex: number, ey: number, ez: number) => {
    await API.markup.addMeasurementMarkups([{
      start: { positionX: sx, positionY: sy, positionZ: sz },
      end:   { positionX: ex, positionY: ey, positionZ: ez },
      color: ANNOTATION_RED,
    }]);
  };

  const shortLabel = (partNumber: string) => partNumber.split('-').pop() ?? partNumber;

  // Returns the two endpoints along a bar's dominant axis (the longest dimension).
  // For a Z-dominant (truly vertical) bar, min/max are bottom and top.
  // For an X-dominant bar, min/max are left and right ends.
  const barEnds = (bbox: NonNullable<JigObject['bbox']>) => {
    const dx = Math.abs(bbox.max.x - bbox.min.x);
    const dy = Math.abs(bbox.max.y - bbox.min.y);
    const dz = Math.abs(bbox.max.z - bbox.min.z);
    const cx = ((bbox.min.x + bbox.max.x) / 2) * 1000;
    const cy = ((bbox.min.y + bbox.max.y) / 2) * 1000;
    const cz = ((bbox.min.z + bbox.max.z) / 2) * 1000;
    if (dz >= dx && dz >= dy) {
      return { min: { x: cx, y: cy, z: bbox.min.z * 1000 }, max: { x: cx, y: cy, z: bbox.max.z * 1000 } };
    }
    if (dx >= dy) {
      return { min: { x: bbox.min.x * 1000, y: cy, z: cz }, max: { x: bbox.max.x * 1000, y: cy, z: cz } };
    }
    return { min: { x: cx, y: bbox.min.y * 1000, z: cz }, max: { x: cx, y: bbox.max.y * 1000, z: cz } };
  };

  // ── view 3 helpers ────────────────────────────────────────────────────────

  const annotateRTWLabelsOnly = async (data: JigData, familyCheck: (f?: RTWFamily) => boolean) => {
    for (const rtw of data.objects.filter(o => o.family === 'RTW' && familyCheck(o.rtwFamily))) {
      if (!rtw.bbox) continue;
      const cx = ((rtw.bbox.min.x + rtw.bbox.max.x) / 2) * 1000;
      const cy = ((rtw.bbox.min.y + rtw.bbox.max.y) / 2) * 1000;
      const cz = ((rtw.bbox.min.z + rtw.bbox.max.z) / 2) * 1000;
      await annotateAt(cx, cy, cz, shortLabel(rtw.partNumber));
    }
  };

  const annotateRTW = async (rtwId: number, data: JigData) => {
    const rtw = data.rtwById.get(rtwId);
    if (!rtw) return;
    const children = getRTWChildren(rtwId, data.objects);
    const rebChildren = children.filter(c => c.family === 'REB' || c.family === 'REJ' || c.family === 'RB2');
    const strChildren = children.filter(c => c.family === 'STR');
    const rtwLabel = shortLabel(rtw.partNumber);

    for (const reb of rebChildren) {
      if (!reb.bbox) continue;
      const ends = barEnds(reb.bbox);
      await annotateAt(ends.max.x, ends.max.y, ends.max.z, shortLabel(reb.partNumber));
      await annotateAt(ends.min.x, ends.min.y, ends.min.z, rtwLabel);
    }
    for (const str of strChildren) {
      if (!str.bbox) continue;
      const cx = ((str.bbox.min.x + str.bbox.max.x) / 2) * 1000;
      const cy = ((str.bbox.min.y + str.bbox.max.y) / 2) * 1000;
      const cz = ((str.bbox.min.z + str.bbox.max.z) / 2) * 1000;
      await annotateAt(cx, cy, cz, str.partNumber);
    }
    if (isVLBFamily(rtw.rtwFamily) && strChildren.length && rtw.bbox) {
      const segs = buildVLBDimensions(rtw.bbox, strChildren);
      for (const s of segs) await addDim(s.startX, s.startY, s.startZ, s.endX, s.endY, s.endZ);
    } else if (isHSBDimFamily(rtw.rtwFamily) && rebChildren.length && rebChildren[0].bbox) {
      const seg = buildHSBDimension(rebChildren[0].bbox, strChildren);
      if (seg) await addDim(seg.startX, seg.startY, seg.startZ, seg.endX, seg.endY, seg.endZ);
    }
  };

  // ── auto-annotate everything visible in the active view ───────────────────

  const annotateAllInView = async (viewIndex: ViewIndex, data: JigData) => {
    const { objects } = data;

    switch (viewIndex) {
      case 2: {
        // Annotate all PLT at COG
        for (const o of objects.filter(o => o.family === 'PLT')) {
          if (!o.bbox) continue;
          const cx = ((o.bbox.min.x + o.bbox.max.x) / 2) * 1000;
          const cy = ((o.bbox.min.y + o.bbox.max.y) / 2) * 1000;
          const cz = ((o.bbox.min.z + o.bbox.max.z) / 2) * 1000;
          await annotateAt(cx, cy, cz, o.partNumber);
        }
        break;
      }

      case 4: {
        const { rtwById } = data;
        const vlbRTWIds = new Set(
          objects.filter(o => o.family === 'RTW' && isVLBFamily(o.rtwFamily)).map(o => o.id)
        );
        for (const reb of objects.filter(o =>
          (o.family === 'REB' || o.family === 'REJ' || o.family === 'RB2') &&
          (o.isVertical || (o.rtwChildOf != null && vlbRTWIds.has(o.rtwChildOf)))
        )) {
          if (!reb.bbox) continue;
          const ends = barEnds(reb.bbox);
          if (reb.rtwChildOf != null && vlbRTWIds.has(reb.rtwChildOf)) {
            const parentRtw = rtwById.get(reb.rtwChildOf);
            if (parentRtw) await annotateAt(ends.max.x, ends.max.y, ends.max.z, shortLabel(parentRtw.partNumber));
          }
        }

        // Add View 4 vertical bar dimensions (from bar bottom to closest horizontal bar center)
        if (data.datumX !== undefined) {
          const dims = buildView4VerticalBarDimensions(data, data.datumX);
          for (const dim of dims) {
            await addDim(dim.startX, dim.startY, dim.startZ, dim.endX, dim.endY, dim.endZ);
          }
          console.log('[JigPanel] View 4: Added', dims.length, 'vertical bar dimensions');
        }
        break;
      }

      case 5: {
        // Annotate all HSB RTW assemblies + their REB children
        const hsbRTWs = objects.filter(o => o.family === 'RTW' && isHSBAssemblyFamily(o.rtwFamily));
        for (const rtw of hsbRTWs) {
          const children = getRTWChildren(rtw.id, objects);
          const rebChildren = children.filter(c => c.family === 'REB' || c.family === 'REJ' || c.family === 'RB2');
          const strChildren = children.filter(c => c.family === 'STR');
          const rtwLabel = shortLabel(rtw.partNumber); // e.g. "HLBU01"

          for (const reb of rebChildren) {
            if (!reb.bbox) continue;
            const ends = barEnds(reb.bbox);
            await annotateAt(ends.max.x, ends.max.y, ends.max.z, shortLabel(reb.partNumber));
            await annotateAt(ends.min.x, ends.min.y, ends.min.z, rtwLabel);
          }

          for (const str of strChildren) {
            if (!str.bbox) continue;
            const cx = ((str.bbox.min.x + str.bbox.max.x) / 2) * 1000;
            const cy = ((str.bbox.min.y + str.bbox.max.y) / 2) * 1000;
            const cz = ((str.bbox.min.z + str.bbox.max.z) / 2) * 1000;
            await annotateAt(cx, cy, cz, str.partNumber);
          }

          // HSB dimension (HLBU/HLBL/HLCU only)
          if (isHSBDimFamily(rtw.rtwFamily) && rebChildren.length && rebChildren[0].bbox) {
            const seg = buildHSBDimension(rebChildren[0].bbox, strChildren);
            if (seg) await addDim(seg.startX, seg.startY, seg.startZ, seg.endX, seg.endY, seg.endZ);
          }
        }
        break;
      }

      case 6: {
        const { rtwById } = data;
        for (const reb of objects.filter(o => isRebarFamily(o.family) && !o.isVertical && o.rtwChildOf != null)) {
          if (!reb.bbox) continue;
          const ends = barEnds(reb.bbox);
          const parentRtw = rtwById.get(reb.rtwChildOf!);
          if (parentRtw) await annotateAt(ends.max.x, ends.max.y, ends.max.z, shortLabel(parentRtw.partNumber));
        }

        // Add View 6 horizontal bar dimensions (from closest end to datum → closest vertical bar center)
        if (data.datumX !== undefined) {
          const dims = buildView6VerticalBarDimensions(data, data.datumX);
          for (const dim of dims) {
            await addDim(dim.startX, dim.startY, dim.startZ, dim.endX, dim.endY, dim.endZ);
          }
          console.log('[JigPanel] View 6: Added', dims.length, 'horizontal bar dimensions');
        }
        break;
      }

      case 8: {
        // Annotate all LP3/LPS at COG with scribe text
        for (const lp of objects.filter(o => o.family === 'LP')) {
          if (!lp.bbox) continue;
          const cx = ((lp.bbox.min.x + lp.bbox.max.x) / 2) * 1000;
          const cy = ((lp.bbox.min.y + lp.bbox.max.y) / 2) * 1000;
          const cz = ((lp.bbox.min.z + lp.bbox.max.z) / 2) * 1000;
          await annotateAt(cx, cy, cz, shortLabel(lp.partNumber));
        }
        break;
      }

      // Views 1 and 7 need no annotations
    }
  };

  // ── view button click ─────────────────────────────────────────────────────

  const handleViewClick = async (viewIndex: ViewIndex) => {
    if (!jigData) return;
    setActiveView(viewIndex);
    setSelectedRTWLabel(null);
    await applyViewState(viewIndex, jigData);
    if (viewIndex === 3) {
      await annotateRTWLabelsOnly(jigData, isVLBFamily);
    } else if (viewIndex === 5) {
      await annotateRTWLabelsOnly(jigData, isHSBAssemblyFamily);
    } else {
      await annotateAllInView(viewIndex, jigData);
    }
  };

  // ── RTW selection (views 3 & 5 table 2) ──────────────────────────────────

  const handleRTWSelect = async (label: string, ids: number[]) => {
    if (!jigData) return;
    const familyCheck = activeView === 5 ? isHSBAssemblyFamily : isVLBFamily;
    await API.markup.removeMarkups();

    if (label === selectedRTWLabel) {
      setSelectedRTWLabel(null);
      await applyViewState(activeView as ViewIndex, jigData);
      await annotateRTWLabelsOnly(jigData, familyCheck);
      return;
    }

    setSelectedRTWLabel(label);
    const groups = buildRTWFocusGroups(jigData, new Set(ids), familyCheck);
    await applyColourGroupsOnly(groups, jigData.modelID);
    await annotateRTWLabelsOnly(jigData, familyCheck);
    for (const rtwId of ids) await annotateRTW(rtwId, jigData);
  };

  // ── bar selection (view 4 table 2 — markups stay, only colours change) ────

  const handleBarSelect = async (label: string, ids: number[]) => {
    if (!jigData) return;
    const view = activeView as ViewIndex;

    if (label === selectedRTWLabel) {
      setSelectedRTWLabel(null);
      await applyColourGroupsOnly(buildViewGroups(view, jigData), jigData.modelID);
      return;
    }

    setSelectedRTWLabel(label);
    const hotSet = new Set(ids);
    const groups = view === 6
      ? buildView6FocusGroups(jigData, hotSet)
      : buildView4FocusGroups(jigData, hotSet);
    await applyColourGroupsOnly(groups, jigData.modelID);
  };

  // ── clear all ─────────────────────────────────────────────────────────────

  const handleClearAll = async () => {
    await API.markup.removeMarkups();
    API.viewer.setSelection({ modelObjectIds: [] }, 'set');
    if (jigData) {
      setSelectedRTWLabel(null);
      await applyViewState(activeView, jigData);
      if (activeView === 3) {
        await annotateRTWLabelsOnly(jigData, isVLBFamily);
      } else if (activeView === 5) {
        await annotateRTWLabelsOnly(jigData, isHSBAssemblyFamily);
      } else {
        await annotateAllInView(activeView, jigData);
      }
    }
  };


  // ── render ────────────────────────────────────────────────────────────────

  if (loading) return <p>Loading JIG data…</p>;

  // ── table data ─────────────────────────────────────────────────────────────
  const { objects, rtwById } = jigData!;

  const bomRows = (() => {
    if (activeView === 2) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o => o.family === 'PLT'))
        map.set(o.partNumber, (map.get(o.partNumber) ?? 0) + 1);
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    if (activeView === 3) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o =>
        o.rtwChildOf != null && isVLBFamily(rtwById.get(o.rtwChildOf)?.rtwFamily) &&
        (isRebarFamily(o.family) || o.family === 'STR')
      )) map.set(o.partNumber, (map.get(o.partNumber) ?? 0) + 1);
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    if (activeView === 4) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o => o.family === 'RTW' && isVLBFamily(o.rtwFamily)))
        map.set(shortLabel(o.partNumber), (map.get(shortLabel(o.partNumber)) ?? 0) + 1);
      for (const o of objects.filter(o => isRebarFamily(o.family) && o.isVertical && o.rtwChildOf == null))
        map.set(shortLabel(o.partNumber), (map.get(shortLabel(o.partNumber)) ?? 0) + 1);
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    if (activeView === 5) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o =>
        o.rtwChildOf != null && isHSBAssemblyFamily(rtwById.get(o.rtwChildOf)?.rtwFamily) &&
        (isRebarFamily(o.family) || o.family === 'STR')
      )) map.set(o.partNumber, (map.get(o.partNumber) ?? 0) + 1);
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    if (activeView === 6) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o => isRebarFamily(o.family) && !o.isVertical)) {
        const label = o.rtwChildOf != null
          ? shortLabel(rtwById.get(o.rtwChildOf)?.partNumber ?? o.partNumber)
          : shortLabel(o.partNumber);
        map.set(label, (map.get(label) ?? 0) + 1);
      }
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    if (activeView === 8) {
      const map = new Map<string, number>();
      for (const o of objects.filter(o => o.family === 'LP'))
        map.set(o.partNumber, (map.get(o.partNumber) ?? 0) + 1);
      return Array.from(map.entries()).map(([pn, qty]) => ({ pn, qty })).sort((a, b) => a.pn.localeCompare(b.pn));
    }
    return [];
  })();

  // Views 4 & 6 — standalone bars only (no RTW rows) for bar selection table
  const barSelectionRows = (activeView === 4 || activeView === 6) ? (() => {
    const map = new Map<string, number[]>();
    const pred = activeView === 6
      ? (o: typeof objects[0]) => isRebarFamily(o.family) && !o.isVertical && o.rtwChildOf == null
      : (o: typeof objects[0]) => isRebarFamily(o.family) && !!o.isVertical && o.rtwChildOf == null;
    for (const o of objects.filter(pred)) {
      const label = shortLabel(o.partNumber);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(o.id);
    }
    return Array.from(map.entries())
      .map(([label, ids]) => ({ label, ids, qty: ids.length }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })() : [];

  const rtwRows = (activeView === 3 || activeView === 5) ? (() => {
    const familyCheck = activeView === 5 ? isHSBAssemblyFamily : isVLBFamily;
    const map = new Map<string, number[]>();
    for (const o of objects.filter(o => o.family === 'RTW' && familyCheck(o.rtwFamily))) {
      const label = shortLabel(o.partNumber);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(o.id);
    }
    return Array.from(map.entries())
      .map(([label, ids]) => ({ label, ids, qty: ids.length }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })() : [];

  return (
    <div className="jig-root">
      <div className="jig-header">
        <span>{modelName}</span>
        <span className="jig-subtitle">JIG Drawing</span>
      </div>

      <div className="jig-view-grid">
        {([1, 2, 3, 4, 5, 6, 7, 8] as ViewIndex[]).map(v => (
          <button
            key={v}
            className={`jig-view-btn${activeView === v ? ' active' : ''}`}
            onClick={() => handleViewClick(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {(activeView === 2 || activeView === 3 || activeView === 4 || activeView === 5 || activeView === 6 || activeView === 8) && (
        <div className="jig-table-container">
          <table className="jig-table">
            <thead><tr><th>Part Number</th><th>QTY</th></tr></thead>
            <tbody>
              {bomRows.map(r => (
                <tr key={r.pn}><td>{r.pn}</td><td>{r.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(activeView === 3 || activeView === 5) && (
        <div className="jig-table-container">
          <table className="jig-table">
            <thead><tr><th>RTW</th><th>QTY</th></tr></thead>
            <tbody>
              {rtwRows.map(r => (
                <tr key={r.label} className={selectedRTWLabel === r.label ? 'active' : ''}>
                  <td>{r.label}</td>
                  <td>
                    <button className="jig-btn" onClick={() => handleRTWSelect(r.label, r.ids)}>
                      {r.qty}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(activeView === 4 || activeView === 6) && barSelectionRows.length > 0 && (
        <div className="jig-table-container">
          <table className="jig-table">
            <thead><tr><th>Bar</th><th>QTY</th></tr></thead>
            <tbody>
              {barSelectionRows.map(r => (
                <tr key={r.label} className={selectedRTWLabel === r.label ? 'active' : ''}>
                  <td>{r.label}</td>
                  <td>
                    <button className="jig-btn" onClick={() => handleBarSelect(r.label, r.ids)}>
                      {r.qty}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="jig-footer">
        <button className="jig-btn" onClick={handleClearAll}>Clear All</button>
      </div>
    </div>
  );
};
