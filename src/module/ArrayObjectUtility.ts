/* Utility module used to extract required IFC property fields by name,
 from large array and object data sets */

//For retrieving index of particular object property by name
export const GetIFCProperty = (ifcPropertyName: string, targetArray: any[]) => {

    for (let arrayIndex = 0; arrayIndex < targetArray.length; arrayIndex++) {
        let detectedPropertyName = targetArray[arrayIndex].name;

        if (detectedPropertyName === ifcPropertyName) {

            return arrayIndex;
        }
    }

    return "NULL"

}

///END
