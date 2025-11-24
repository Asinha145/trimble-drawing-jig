import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { GetIFCProperty } from "./ArrayObjectUtility";
import { ConnectViewer, API } from './TCEntryPoint';
import { GetModelID, modelName,  GetRebars} from './TCFixtureTable';
import type { ObjectSelector, IModelEntities, HierarchyType, HierarchyEntity } from 'trimble-connect-workspace-api';


export const IFC_ASSEMBLY_LIST: any[] = []; //Encapusulation only accessed through get assembly data
export let IFC_REBAR_LIST: any[] = [];


export const Extract_IFCASSEMBLY = (_objectPropertyArray: WorkspaceAPI.ObjectProperties[]) => {
    for (let object of _objectPropertyArray) {
            IFC_ASSEMBLY_LIST.push(object);
    }

}


export const Extract_Rebar = (
    _objectPropertyArray: WorkspaceAPI.ObjectProperties[]): WorkspaceAPI.ObjectProperties[] => {
    let modelID = GetModelID(API);
    const rebarObjects: any[] = [];
    for (let object of _objectPropertyArray) {
        const IFCProperties = object.properties ?? [];
        
    const ifcRebarIndex = GetIFCProperty("SOLIDWORKS Custom Properties", IFCProperties);
    // GetIFCProperty now returns number | null — guard against not-found
    if (ifcRebarIndex == null) continue; // skip if not found

    const SOLIDWORKSCUSTOMPROPERTIES = IFCProperties[ifcRebarIndex as number]?.properties ?? [];
    
    const partNumberIndex = GetIFCProperty("bim2cam:Part Number", SOLIDWORKSCUSTOMPROPERTIES);

    if (partNumberIndex == null) continue;

    const partNumber = SOLIDWORKSCUSTOMPROPERTIES[partNumberIndex as number]?.value ?? "";
        // Ensure partNumber is a string before calling includes
        const partNumberStr = typeof partNumber === "string" ? partNumber : String(partNumber);
        if (partNumberStr.includes("RTW")) {
            rebarObjects.push(object);
        }
    }
    return rebarObjects;
};

