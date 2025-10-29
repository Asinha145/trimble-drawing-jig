
import * as WorkspaceAPI from "trimble-connect-workspace-api";


/** Instantiate extension .
*  @param window - Parent window object.
*  @param callback - Listen the events with args from the parent.
*  @param timeout - Connect timeout in milliseconds.
*  @returns TCExtensionAPI - Object with the interaction methods.
*/

//Public
export let API: any = {};


export const ConnectViewer = async () => {
  const _API = await WorkspaceAPI.connect(
    window.parent,
    async (event: any) => {
      switch (event) {
        case "extension.command":
          //"Command executed by the user: args.data"
          break;
        case "extension.accessToken":
          //"Accestoken or status: args.data"
          break;
        case "viewer.onSelectionChanged":
          //User Selected Objects!"
          //#region explanation
          /* JS is single threaded, when async event is triggered it processes one by one:
          -if x5 events are triggered with x5 renders, DimensionFixture method is executed 5 times breaking 
          -To avoid this, flag is created the first event to set flag to true will only execute 
          -The others will not be able to executee until first one sets flag back to false
          -in that time the other x4 event callbacks will be prevented
          */
          //#endregion
          break;
        default:
      }
    },
    30000
  );

  API = _API; //setting global var to re-use as args in other functions

}