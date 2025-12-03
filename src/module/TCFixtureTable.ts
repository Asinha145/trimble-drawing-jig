import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { GetIFCProperty } from "./ArrayObjectUtility";
import { Extract_Rebar, Extract_IFCASSEMBLY } from './ExtractAssembly.ts';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity, EntityParameter } from 'trimble-connect-workspace-api';
import { Color } from "antd/es/color-picker/index";

//This module contains module functions to produce a cast-in-items fixtures list

//###Private variables but global to the module file only
export let modelID: any = {};
export let modelName: string = "NULL";
export let rebarItems: any[] = [];
export let plateItems: any[] = [];
export let SubAssembliesHWS: any[] = [];
let IFC_FixtureList: any[] = [];
let haveExtracted: boolean = false //only extract eip fixture once to prevent list doubling
export let Cast_In_Items: any[] = [];
export let mainConcretePart_Id: any;
export let UT2IsLong: boolean; //Public U2IsLong property for TCBBSTable module loose mesh intent method
export let omittedStringers: any[] = [];
export let stringerColours: { [key: number]: { r: number; g: number; b: number; a: number } } = {};

export const GetModelID = async (API: WorkspaceAPI.WorkspaceAPI) => {
    //Getting model ID
    let _modelID: any = {};
    const modelDataObj = await API.viewer.getModels();

    //Checking for the model ID that is presently active
    let isLoaded: boolean = false;



    for (let index = 0; isLoaded === false; index++) {
        let modelData = modelDataObj[index];
        if (modelData.state === "loaded") {
            isLoaded = true;
            _modelID = modelData.id;
            modelName = modelData.name;
        }
    }

    let modelData2 = await API.viewer.getLoadedModel(_modelID);
    return _modelID;
}

export const GetRebarsVWS = async (API: WorkspaceAPI.WorkspaceAPI) => {

    modelID = await GetModelID(API);
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;
    rebarItems = [];


    for (let object of objectList) {
        let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);
        const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [object.id]);
        const heirarchyChildren: HierarchyEntity[] = await API.viewer.getHierarchyChildren(modelID, [object.id]);
        let rebarPart: any;
        let rebarProperties: any;
        for (const child of heirarchyChildren) {
            const objectName = child.name;
            if (objectName.includes("REB")) {
                rebarPart = child; //only one rebar in the RTW assumed
            }
        }
        if (rebarPart?.id) {
            rebarProperties = await API.viewer.getObjectProperties(modelID, [rebarPart.id]);
        }




        // Extract_Rebar returns an array of rebar object properties for the given object
        const rebars = Extract_Rebar(objectPropertyArray);

        if (rebars && rebars.length > 0) {
            rebars.forEach(item => {
                if (!rebarItems.includes(item)) {

                    //getting bounding box of the RTW doesn't work in the case of couplers. need to get rebar
                    let cogX: number = ((boundingBox[0].boundingBox.min.x + boundingBox[0].boundingBox.max.x) / 2) * 1000;
                    let cogY: number = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y) / 2) * 1000;
                    let cogZ: number = ((boundingBox[0].boundingBox.min.z + boundingBox[0].boundingBox.max.z) / 2) * 1000;
                    let datumList: { positionX: number; positionY: number; positionZ: number; label: number }[] = [];

                    datumList.push({ positionX: 0, positionY: 0, positionZ: 16, label: 1 });
                    datumList.push({ positionX: 0, positionY: 150, positionZ: 16, label: 2 });
                    datumList.push({ positionX: 0, positionY: 300, positionZ: 16, label: 3 });
                    datumList.push({ positionX: 0, positionY: 450, positionZ: 16, label: 4 });
                    datumList.push({ positionX: 0, positionY: 600, positionZ: 16, label: 5 });
                    datumList.push({ positionX: 0, positionY: 750, positionZ: 16, label: 6 });
                    datumList.push({ positionX: 7810, positionY: 0, positionZ: 16, label: 7 });
                    datumList.push({ positionX: 7810, positionY: 150, positionZ: 16, label: 8 });
                    datumList.push({ positionX: 7810, positionY: 300, positionZ: 16, label: 9 });
                    datumList.push({ positionX: 7810, positionY: 450, positionZ: 16, label: 10 });
                    datumList.push({ positionX: 7810, positionY: 600, positionZ: 16, label: 11 });
                    datumList.push({ positionX: 7810, positionY: 750, positionZ: 16, label: 12 });

                    const tolerance = 5; // mm
                    const targetX = ((boundingBox[0].boundingBox.min.x + boundingBox[0].boundingBox.max.x) / 2) * 1000;
                    const targetY = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y) / 2) * 1000;

                    const matchingDatum = datumList.find(datum => {
                        // For X: snap to 0 if targetX < 7810, else snap to 7810
                        const expectedX = targetX < 7810 ? 0 : 7810;

                        return (
                            datum.positionX === expectedX && // exact match for X based on rule
                            Math.abs(datum.positionY - targetY) <= tolerance // Y within ±5 mm
                        );
                    });
                    rebarItems.push({ RTWItem: item, datumItem: matchingDatum, rebarItem: rebarProperties[0] });
                }
            });
        }

    }
    return rebarItems;

}

export const getPlatesHWS = async (API: WorkspaceAPI.WorkspaceAPI) => {

    modelID = await GetModelID(API);
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;
    plateItems = [];

    for (let object of objectList) {
        let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);
        for (let _object of objectPropertyArray) {
            const IFCProperties = _object.properties ?? [];

            const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
            // GetIFCProperty now returns number | null — guard against not-found
            if (ifcSolidworksPropIndex == null) continue; // skip if not found

            const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

            const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);

            if (partNumberIndex == null) continue;

            const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
            // Ensure partNumber is a string before calling includes
            const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
            if (partNumberStr.includes("PLT")) {
                const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [object.id]);
                let cogX: number = ((boundingBox[0].boundingBox.min.x + boundingBox[0].boundingBox.max.x) / 2) * 1000;
                let cogY: number = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y) / 2) * 1000;
                let cogZ: number = ((boundingBox[0].boundingBox.min.z + boundingBox[0].boundingBox.max.z) / 2) * 1000;

                let dimensionOffset: number; //this number will change depending on final origin point. TODO: Communicate requirements of this
                if (cogY < 50) {
                    dimensionOffset = -450;
                }
                else {
                    dimensionOffset = 450;
                }
                plateItems.push({ Plate: object, Name: partNumberStr, dimensionStart: { positionX: cogX, positionY: cogY, positionZ: cogZ }, dimensionEnd: { positionX: cogX, positionY: cogY + dimensionOffset, positionZ: cogZ } });
            }
        }
    }
    return plateItems;

}
type ColourInput = ColourByObjectId | Map<number, RGBA>;

export const getSubAssembliesHWS = async (API: WorkspaceAPI.WorkspaceAPI, spacerColours: ColourInput) => {

    const modelID = await GetModelID(API);
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;

    type SubAssembly = {
        subAssemblyObjectID: number;
        subAssemblyName: string;
        subAssemblyStringerObjects: any[];
        fixturePosition: number;
    };

    const SubAssembliesHWS: SubAssembly[] = [];

    for (const object of objectList) {
        const objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);
        const heirarchyChildren: HierarchyEntity[] = await API.viewer.getHierarchyChildren(modelID, [object.id]);

        let rebarPart: any;
        const subAssyParts: any[] = [];
        let fixturePosition: number = 0; // default in case REB not found

        for (const child of heirarchyChildren) {
            const objectName = child.name ?? "";
            if (objectName.includes("REB")) {
                rebarPart = await API.viewer.getObjectProperties(modelID, [child.id]);
                subAssyParts.push(rebarPart); // only one rebar in the RTW assumed

                const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [child.id]);
                const cogY: number =
                    ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y) / 2) * 1000;
                fixturePosition = cogY < 550 ? 1 : 2; // hardcoded mid blade is y=550mm
            } else if (objectName.includes("STR")) {
                subAssyParts.push(await API.viewer.getObjectProperties(modelID, [child.id]));
            }
        }

        for (const _object of objectPropertyArray) {
            const IFCProperties = _object.properties ?? [];

            const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
            if (ifcSolidworksPropIndex == null) continue; // skip if not found

            const SOLIDWORKSCUSTOMPROPERTIES =
                IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

            const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);
            if (partNumberIndex == null) continue;

            const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
            const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);

            if (partNumberStr.includes("RTW") || partNumberStr.includes("RT2")) {
                SubAssembliesHWS.push({
                    subAssemblyObjectID: _object.id,
                    subAssemblyName: partNumberStr,
                    subAssemblyStringerObjects: subAssyParts,
                    fixturePosition: fixturePosition
                });
            }
        }
    }

    // Output rows now include an optional col3 for Rebar Diameter
    type Row = { col1: string; col2: string | number; col3?: string; id: number[]; color?: RGBA };
    const rows: Row[] = [];
    let i: number = 0;

    for (const assembly of SubAssembliesHWS) {
        // Main assembly header row
        rows.push({
            col1: assembly.subAssemblyName.includes("RTW")
                ? assembly.subAssemblyName.replace('RTW-', '')
                : assembly.subAssemblyName.replace('RT2-', ''),
            col2: assembly.fixturePosition,
            col3: "",
            id: [assembly.subAssemblyObjectID]
        });

        // Column headers
        rows.push({
            col1: "Part Number",
            col2: "Quantity",
            col3: "Rebar Dia",
            id: [9999999999]
        });

        // Map to store part name -> { qty, ids, rebarDia }
        const partMap = new Map<string, { qty: number; ids: number[]; rebarDia?: string }>();

        for (const stringerObj of assembly.subAssemblyStringerObjects) {
            const candidate = Array.isArray(stringerObj) ? stringerObj[0] : stringerObj;
            if (!candidate) continue;

            const IFCProperties = candidate?.properties ?? [];
            const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
            if (ifcSolidworksPropIndex == null) continue;

            const SOLIDWORKSCUSTOMPROPERTIES =
                IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

            const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);
            const partNumber =
                partNumberIndex != null
                    ? (SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "")
                    : "";

            // ✅ Correctly read Rebar diameter from "bim2cam:Rebar:Size"
            const rebarDiaIndex = GetIFCProperty("bim2cam:Rebar:Size", SOLIDWORKSCUSTOMPROPERTIES);
            const rebarDia =
                rebarDiaIndex != null
                    ? (SOLIDWORKSCUSTOMPROPERTIES[rebarDiaIndex as number]?.value ?? "")
                    : "";

            if (partNumber) {
                const key = typeof partNumber === "string" ? partNumber : String(partNumber);
                if (!partMap.has(key)) {
                    partMap.set(key, { qty: 0, ids: [], rebarDia: "" });
                }
                const entry = partMap.get(key)!;
                entry.qty += 1;

                // Add object.id
                if (typeof candidate?.id === "number") {
                    entry.ids.push(candidate.id);
                }

                // Attach rebar diameter (if present) to this part's entry.
                const diaStr = typeof rebarDia === "string" ? rebarDia : String(rebarDia);
                if (diaStr) {
                    if (!entry.rebarDia) {
                        entry.rebarDia = diaStr;
                    } else if (!entry.rebarDia.split("/").includes(diaStr)) {
                        entry.rebarDia = `${entry.rebarDia}/${diaStr}`;
                    }
                }
            }
        }

        // Push rows for each unique part

for (const [name, data] of Array.from(partMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
  // Find the first matching colour for any id in this row
  let colour: { r: number; g: number; b: number; a: number } | undefined;
  for (const id of data.ids) {
    const c =
      spacerColours instanceof Map
        ? spacerColours.get(id)
        : (spacerColours as { [key: number]: { r: number; g: number; b: number; a: number } })[id];
    if (c) { colour = c; break; }
  }

  rows.push({
    col1: name,
    col2: data.qty,
    col3: data.rebarDia ?? "",
    id: data.ids,
    ...(colour ? { colour } : {}) // only include colour when a match was found
  });
}


        if (i < 1) {
            rows.push({
                col1: "Sub-Assembly Reference",
                col2: "Fixture Position",
                col3: "",
                id: [9999999999]
            });
        }
        i++;
    }

    return rows;


}


export const getStationConfigHWS = async (API: WorkspaceAPI.WorkspaceAPI) => {
    modelID = await GetModelID(API);
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;
    let stationType: any;

    for (let object of objectList) {
        let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);

        for (let _object of objectPropertyArray) {
            const IFCProperties = _object.properties ?? [];
            const ifcSolidworksPropIndex = GetIFCProperty("OrientedBoundingBox", IFCProperties);
            // GetIFCProperty now returns number | null — guard against not-found
            if (ifcSolidworksPropIndex == null) continue; // skip if not found

            const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

            const partNumberIndex = GetIFCProperty("Name", SOLIDWORKSCUSTOMPROPERTIES);

            if (partNumberIndex == null) continue;

            const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
            // Ensure partNumber is a string before calling includes
            const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
            if (partNumberStr.includes("HWS-P-0015")) {
                stationType = "Standard/Theobold";
            }
            else if (partNumberStr.includes("HWS-P-0020")) {
                stationType = "Bespoke";
            }
        }
    }
    return stationType;
}

export const getDatumSideHWS = async (API: WorkspaceAPI.WorkspaceAPI) => {
    modelID = await GetModelID(API);
    
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;
    let DatumSide: any;
    let heirarchyParent: HierarchyEntity[];

    for (let object of objectList) {
        

        let parentEntities = await API.viewer.getHierarchyParents(modelID, [object.id]);

        for (let _object of parentEntities) {
            const name = _object.name;
            let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [_object.id]);

            for (let obj of objectPropertyArray) {
                const IFCProperties = obj.properties ?? [];
                const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);

                // GetIFCProperty now returns number | null — guard against not-found
                if (ifcSolidworksPropIndex == null) continue; // skip if not-found

                const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

                const partNumberIndex = GetIFCProperty("bim2cam:Datum Side", SOLIDWORKSCUSTOMPROPERTIES);

                if (partNumberIndex == null) continue;

                const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";

                // Ensure partNumber is a string before calling includes
                const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
                if (partNumberStr.includes("WEST")) {
                    DatumSide = "WEST";
                    return DatumSide;
                }
                else if (partNumberStr.includes("EAST")) {
                    DatumSide = "EAST";
                    return DatumSide;
                }
        }
    }
    }

    return DatumSide;
}


export const getOmittedStringers = async (
  API: WorkspaceAPI.WorkspaceAPI,
  stationTypeArg?: string,   // e.g., "Vertical Weld Station"
  toleranceMM: number = 1    // X containment tolerance in millimetres
) => {
  const modelID = await GetModelID(API);

  // --- Helpers --------------------------------------------------------------

  const getPropIndex = (name: string, props: any[]): number | null => {
    const idx = GetIFCProperty(name, props);
    return idx == null ? null : (idx as number);
  };

  const toStr = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));

  // 1D overlap: intersects (touching counts as overlap)
  const overlaps1D = (minA: number, maxA: number, minB: number, maxB: number) =>
    minA <= maxB && maxA >= minB;

  // 1D containment with tolerance (weld fully inside stringer along one axis)
  // Assumes units are millimetres; if metres, pass toleranceMM/1000.
  const inside1DWithTol = (
    minW: number,
    maxW: number,
    minS: number,
    maxS: number,
    tol: number
  ) => minW >= (minS - tol) && maxW <= (maxS + tol);

  // Classic AABB overlap on all axes
  const overlapsAABB = (
    w: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
    s: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  ) =>
    overlaps1D(w.min.x, w.max.x, s.min.x, s.max.x) &&
    overlaps1D(w.min.y, w.max.y, s.min.y, s.max.y) &&
    overlaps1D(w.min.z, w.max.z, s.min.z, s.max.z);

  // Station-aware overlap: X must be fully contained (with tolerance); Y/Z may overlap
  const overlapsAABB_XContainedTol = (
    w: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
    s: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
    tol: number
  ) =>
    inside1DWithTol(w.min.x, w.max.x, s.min.x, s.max.x, tol) &&
    overlaps1D(w.min.y, w.max.y, s.min.y, s.max.y) &&
    overlaps1D(w.min.z, w.max.z, s.min.z, s.max.z);

  // --- Fetch all objects once ----------------------------------------------

  const objectsResponse = await API.viewer.getObjects();
  const allObjects = (objectsResponse?.[0]?.objects ?? []) as Array<{ id: number }>;

  // --- Cache properties and bounding boxes ---------------------------------

  type PropsEntry = {
    id: number;
    properties?: any[];
    // add other fields if your viewer includes them
  };
  const propsEntryById = new Map<number, PropsEntry | null>();
  const bboxById = new Map<
    number,
    { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null
  >();

  const getPropsEntry = async (id: number): Promise<PropsEntry | null> => {
    if (propsEntryById.has(id)) return propsEntryById.get(id)!;
    const propsArr = await API.viewer.getObjectProperties(modelID, [id]);
    const entry = propsArr?.[0] ?? null;
    propsEntryById.set(id, entry);
    return entry;
  };

  const getAABB = async (id: number) => {
    if (bboxById.has(id)) return bboxById.get(id)!;
    const bbArr = await API.viewer.getObjectBoundingBoxes(modelID, [id]);
    const bb = bbArr?.[0]?.boundingBox ?? null;
    bboxById.set(id, bb);
    return bb;
  };

  // --- Determine station type (argument preferred, else detect) -------------

  const detectStationType = async (): Promise<string | null> => {
    for (const obj of allObjects) {
      const entry = await getPropsEntry(obj.id);
      const IFCProps = entry?.properties ?? [];
      const swIdx = getPropIndex("SOLIDWORKS Custom Properties", IFCProps);
      if (swIdx == null) continue;
      const swProps = IFCProps[swIdx]?.properties ?? [];
      const stIdx = getPropIndex("Station_Type", swProps);
      if (stIdx == null) continue;
      const stVal = swProps[stIdx]?.value ?? "";
      const stStr = toStr(stVal).trim();
      if (stStr) return stStr;
    }
    return null;
  };

  const stationType = stationTypeArg ?? (await detectStationType()) ?? "";
  const isVerticalStation = toStr(stationType).trim().toLowerCase() === "vertical weld station";

  // --- Classify: EXCLUDED welds and candidate stringers ---------------------

  const excludedWeldIds: number[] = [];
  const candidateStringerIds: number[] = [];

  for (const obj of allObjects) {
    const entry = await getPropsEntry(obj.id);
    const IFCProps = entry?.properties ?? [];
    const swIdx = getPropIndex("SOLIDWORKS Custom Properties", IFCProps);
    if (swIdx == null) continue;
    const swProps = IFCProps[swIdx]?.properties ?? [];

    // EXCLUDED welds via CLEARANCE_CHECK
    {
      const clearanceIdx = getPropIndex("bim 2 cam:CLEARANCE_CHECK", swProps);
      if (clearanceIdx != null) {
        const clearanceVal = swProps[clearanceIdx]?.value ?? "";
        if (toStr(clearanceVal).includes("EXCLUDED")) {
          excludedWeldIds.push(obj.id);
          continue; // weld won't be a stringer; skip STR detection
        }
      }
    }

    // Stringers via Part Number contains "STR"
    {
      const pnIdx = getPropIndex("bim2cam:Part Number", swProps);
      if (pnIdx != null) {
        const pnVal = swProps[pnIdx]?.value ?? "";
        if (toStr(pnVal).includes("STR")) {
          candidateStringerIds.push(obj.id);
        }
      }
    }
  }

  // Prefetch bbox for candidate stringers
  await Promise.all(candidateStringerIds.map(id => getAABB(id)));

  // --- Clash test (station-aware, with tolerance for Vertical) --------------

  const omittedStringerProps: number[] = [];
  const seenStringer = new Set<number>();

  for (const weldId of excludedWeldIds) {
    const weldAABB = await getAABB(weldId);
    if (!weldAABB) continue;

    for (const strId of candidateStringerIds) {
      if (seenStringer.has(strId)) continue;

      const strAABB = await getAABB(strId);
      if (!strAABB) continue;

      const isClash = isVerticalStation
        ? overlapsAABB_XContainedTol(weldAABB, strAABB, toleranceMM)
        : overlapsAABB(weldAABB, strAABB);

      if (isClash) {
        const strPropsEntry = await getPropsEntry(strId);
        if (strPropsEntry) {
          omittedStringerProps.push(strPropsEntry.id);
          seenStringer.add(strId);
        }
      }
    }
   }

  console.log("Omitted Stringers (properties):", omittedStringerProps);
  return omittedStringerProps;
}

type RGBA = { r: number; g: number; b: number; a: number };
type ColourByObjectId = { [key: number]: RGBA };

export const getStringerColours = async (API: WorkspaceAPI.WorkspaceAPI) => {
  modelID = await GetModelID(API);
  
  const objectListArray = await API.viewer.getObjects();
  const objectList = objectListArray[0].objects;
  let stringerNames: any[] = [];

  for (let object of objectList) {
    let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);

    for (let obj of objectPropertyArray) {
      const IFCProperties = obj.properties ?? [];
      const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);

      // GetIFCProperty now returns number | null — guard against not-found
      if (ifcSolidworksPropIndex == null) continue; // skip if not-found

      const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

      const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);

      if (partNumberIndex == null) continue;

      const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";

      // Ensure partNumber is a string before calling includes
      const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
      if (partNumberStr.includes("STR")) {
        stringerNames.push(partNumberStr);
      }
    }
  }

  let distinctStringerNames = [...new Set(stringerNames)];
  console.log("Stringer Names: ", distinctStringerNames);

  /* --------------------------
   * ADDITIONS START HERE
   * -------------------------- */

  // 1) Assign evenly spaced colours per distinct stringer name (Option 2)
  const colourByPartNumber = coloursByEvenHue(distinctStringerNames, 70, 50); // saturation=70, lightness=50

  // 2) Build flat export: object.id -> colour
  //    We re-scan objects to read their partNumberStr (no changes to your existing loop).
  const stringerColours: ColourByObjectId = {};

  for (let object of objectList) {
    const objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);

    // Find partNumberStr for this object (same logic as above; duplicated on purpose to avoid changing your code)
    let partNumberStrForObject: string | undefined;

    for (let obj of objectPropertyArray) {
      const IFCProperties = obj.properties ?? [];
      const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
      if (ifcSolidworksPropIndex == null) continue;

      const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];
      const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);
      if (partNumberIndex == null) continue;

      const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
      const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);

      if (partNumberStr) {
        partNumberStrForObject = partNumberStr;
        break;
      }
    }

    // Only assign colours to objects whose part number is one of the distinct stringer names
    if (partNumberStrForObject && distinctStringerNames.includes(partNumberStrForObject)) {
      const colour = colourByPartNumber.get(partNumberStrForObject);
      if (colour) {
        stringerColours[object.id] = colour;
      }
    }
  }
console.log("Stringer Colours: ", stringerColours);
  return stringerColours;
};

/* ---------------------- Colour helpers (Option 2: evenly spaced hues) ---------------------- */

function coloursByEvenHue<T extends string | number>(
  distinctValues: T[],
  saturation = 70,  // %: increase for more vivid colours
  lightness = 50    // %: adjust for brightness vs dark background
): Map<T, RGBA> {
  const map = new Map<T, RGBA>();
  const n = distinctValues.length || 1;

  distinctValues.forEach((v, i) => {
    const h = Math.round((i * 360) / n); // evenly spaced hue
    const { r, g, b } = hslToRgb(h, saturation, lightness);
    map.set(v, { r, g, b, a: 255 });     // use a: 1 if your API requires 0–1 alpha
  });

  return map;
}

/** HSL to RGB converter (h in [0..360], s,l in [0..100]). */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= hp && hp < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (1 <= hp && hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (2 <= hp && hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (3 <= hp && hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (4 <= hp && hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else if (5 <= hp && hp < 6) { r1 = c; g1 = 0; b1 = x; }

  const m = l - c / 2;
   const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return { r, g, b };
}