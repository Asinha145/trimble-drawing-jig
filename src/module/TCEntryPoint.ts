
import { connect as connectWorkspaceAPI, WorkspaceAPI } from "trimble-connect-workspace-api";


/** Instantiate extension .
*  @param window - Parent window object.
*  @param callback - Listen the events with args from the parent.
*  @param timeout - Connect timeout in milliseconds.
*  @returns TCExtensionAPI - Object with the interaction methods.
*/

//Public
export let API: any = {};




export const ConnectViewer = async () => {
  try {
    const _API = await connectWorkspaceAPI(
      window.parent,
      async (event: any) => {
        switch (event.type) {
          case "extension.command":
            console.log("Command executed:", event.data);
            break;
          case "extension.accessToken":
            console.log("Access token received:", event.data);
            break;
          case "viewer.onSelectionChanged":
            console.log("Selection changed:", event.data);
            break;
          default:
            console.warn("Unhandled event:", event);
        }
      },
      30000 // timeout
    );
  API = _API;
    console.log("Workspace API connected successfully.");
  } catch (error) {
    console.error("Failed to connect to Workspace API:", error);
    throw error;
  }


};



  //API = _API; //setting global var to re-use as args in other functions
