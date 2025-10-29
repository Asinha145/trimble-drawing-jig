import * as WorkspaceAPI from "trimble-connect-workspace-api";
import { GetIFCProperty } from "./ArrayObjectUtility";

//This module contains module functions to produce a cast-in-items fixtures list

//###Private variables but global to the module file only
export let modelID: any = {};
export let modelName: string = "NULL";
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

    return _modelID;
}
