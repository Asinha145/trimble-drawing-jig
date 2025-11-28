import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { GetIFCProperty } from "./ArrayObjectUtility";
import { Extract_Rebar, Extract_IFCASSEMBLY } from './ExtractAssembly.ts';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity } from 'trimble-connect-workspace-api';

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

export const getSubAssembliesHWS = async (API: WorkspaceAPI.WorkspaceAPI) => {

    modelID = await GetModelID(API);
    const objectListArray = await API.viewer.getObjects();
    const objectList = objectListArray[0].objects;
    SubAssembliesHWS = [];

    for (let object of objectList) {
        let objectPropertyArray = await API.viewer.getObjectProperties(modelID, [object.id]);
        const heirarchyChildren: HierarchyEntity[] = await API.viewer.getHierarchyChildren(modelID, [object.id]);
        let rebarPart: any;
        let subAssyParts: any[] = [];
        let rebarProperties: any;
        let fixturePosition: any;
        for (const child of heirarchyChildren) {
            const objectName = child.name;
            if (objectName.includes("REB")) {
                rebarPart = await API.viewer.getObjectProperties(modelID, [child.id]);
                subAssyParts.push(rebarPart); //only one rebar in the RTW assumed
                const boundingBox = await API.viewer.getObjectBoundingBoxes(modelID, [child.id]);
                let cogY: number = ((boundingBox[0].boundingBox.min.y + boundingBox[0].boundingBox.max.y) / 2) * 1000;
                fixturePosition = cogY < 550 ? 1 : 2; //hardcoded mid blade is y=550mm
            }
            else if (objectName.includes("STR")) {
                subAssyParts.push(await API.viewer.getObjectProperties(modelID, [child.id]));
            }
        }
        if (rebarPart?.id) {
            rebarProperties = await API.viewer.getObjectProperties(modelID, [rebarPart.id]);
        }

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
            if (partNumberStr.includes("RTW")) {
                SubAssembliesHWS.push({ subAssemblyObjectID: _object.id, subAssemblyName: partNumberStr, subAssemblyStringerObjects: subAssyParts, fixturePosition: fixturePosition });
            }
        }
    }
    //doing logic here instead


type Row = { col1: string; col2: string | number; id: number[] };
const rows: Row[] = [];
let i: number = 0;

for (const assembly of SubAssembliesHWS) {
  // Main assembly header row
  rows.push({
    col1: assembly.subAssemblyName.replace('RTW-', ''),
    col2: assembly.fixturePosition,
    id: [assembly.subAssemblyObjectID] 
  });

  rows.push({
    col1: "Part Number",
    col2: "Quantity",
    id: [9999999999]
  });

  // Map to store part name -> { qty, ids }
  const partMap = new Map<string, { qty: number; ids: number[] }>();

  for (const stringerObj of assembly.subAssemblyStringerObjects) {
    const candidate = Array.isArray(stringerObj) ? stringerObj[0] : stringerObj;

    const IFCProperties = candidate?.properties ?? [];
    const ifcSolidworksPropIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
    const SOLIDWORKSCUSTOMPROPERTIES =
      IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

    const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);
    const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";

    if (partNumber) {
      if (!partMap.has(partNumber)) {
        partMap.set(partNumber, { qty: 0, ids: [] });
      }
      const entry = partMap.get(partNumber)!;
      entry.qty += 1;

      // ✅ Add the object's direct property `object.id`
      console.log("Adding ID for part", partNumber, ":", candidate?.id, "mesh", i);
if (typeof candidate?.id === "number") {
  entry.ids.push(candidate.id);
}
    }
  }

  // Push rows for each unique part
  for (const [name, data] of Array.from(partMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({
      col1: name,
      col2: data.qty,
      id: data.ids // ✅ All object.id values for this part name
    });
  }

  if (i < 1) {
    rows.push({
      col1: "Sub-Assembly Reference",
      col2: "Fixture Position",
      id: [9999999999]
    });
  }
  i++;
}
console.log("Generated Sub-Assembly Rows:", rows);
return rows;
//line one of the table

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
console.log("Checking IFC Properties for station config:", IFCProperties);
            const ifcSolidworksPropIndex = GetIFCProperty("OrientedBoundingBox", IFCProperties);
            // GetIFCProperty now returns number | null — guard against not-found
            if (ifcSolidworksPropIndex == null) continue; // skip if not found

            const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcSolidworksPropIndex as number]?.properties ?? [];

            const partNumberIndex = GetIFCProperty("Name", SOLIDWORKSCUSTOMPROPERTIES);

            if (partNumberIndex == null) continue;

            const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
            // Ensure partNumber is a string before calling includes
            const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
            console.log("Checking part number for station config:", partNumberStr);
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