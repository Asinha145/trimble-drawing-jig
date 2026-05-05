import { API } from './TCEntryPoint';

export interface JigData {
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  datumValue: string;
  datumX: number;
}

export interface DimSegment {
  startX: number;
  startY: number;
  startZ: number;
  endX: number;
  endY: number;
  endZ: number;
}

export interface MeasurementMarkup {
  start: { positionX: number; positionY: number; positionZ: number };
  end: { positionX: number; positionY: number; positionZ: number };
  color: { r: number; g: number; b: number; a: number };
}

const ANNOTATION_RED = { r: 255, g: 0, b: 0, a: 255 };

async function getAllObjectIds(modelId: string, parentIds: string[] = []): Promise<string[]> {
  const objectIds: string[] = [];
  try {
    const children = await API.viewer.getHierarchyChildren(modelId, parentIds);
    if (!children || children.length === 0) return objectIds;

    for (const child of children) {
      objectIds.push(child.id);
      const nestedIds = await getAllObjectIds(modelId, [child.id]);
      objectIds.push(...nestedIds);
    }
  } catch (error) {
    console.warn("Error traversing hierarchy:", error);
  }
  return objectIds;
}

export async function getJigObjects(modelId: string): Promise<JigData | null> {
  try {
    const objectIds = await getAllObjectIds(modelId);
    if (!objectIds || objectIds.length === 0) {
      console.warn("No objects found in model");
      return null;
    }
    if (objectIds.length === 0) return null;

    // Get bounding boxes for all objects
    const boundingBoxes = await API.viewer.getObjectBoundingBoxes(modelId, objectIds);
    if (!boundingBoxes || boundingBoxes.length === 0) {
      console.warn("No bounding boxes found");
      return null;
    }

    // Calculate overall bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const bb of boundingBoxes as any[]) {
      if (bb && bb.boundingBox) {
        minX = Math.min(minX, bb.boundingBox.min.x);
        minY = Math.min(minY, bb.boundingBox.min.y);
        minZ = Math.min(minZ, bb.boundingBox.min.z);
        maxX = Math.max(maxX, bb.boundingBox.max.x);
        maxY = Math.max(maxY, bb.boundingBox.max.y);
        maxZ = Math.max(maxZ, bb.boundingBox.max.z);
      }
    }

    const boundingBox = {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };

    // Try to extract JigDatum from properties
    let datumValue = "left";
    let datumX = boundingBox.min.x;

    for (const id of objectIds.slice(0, 20)) { // Check first 20 objects for performance
      try {
        const props = await API.viewer.getObjectProperties(modelId, [id]);
        if (props && props[0]?.properties) {
          for (const prop of props[0].properties) {
            if (prop.name === "SOLIDWORKS Custom Properties" && prop.properties) {
              for (const customProp of prop.properties) {
                if (customProp.name?.includes("JigDatum")) {
                  datumValue = customProp.value?.toLowerCase() || "left";
                  datumX = datumValue === "right" ? boundingBox.max.x : boundingBox.min.x;
                  console.log("Found JigDatum:", datumValue);
                  break;
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue to next object
      }
    }

    return {
      boundingBox,
      datumValue,
      datumX
    };
  } catch (error) {
    console.error("Error getting JIG objects:", error);
    return null;
  }
}

function extractBarMark(partNumber: string): string {
  const parts = partNumber.split('-');
  return parts[parts.length - 1] || partNumber;
}

function euclideanDistance(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export async function buildView4VerticalBarDimensions(
  modelId: string,
  _data: JigData,
  _datumX: number
): Promise<MeasurementMarkup[]> {
  const measurements: MeasurementMarkup[] = [];

  try {
    const objectIds = await getAllObjectIds(modelId);
    if (!objectIds || objectIds.length === 0) return measurements;
    const verticalBars: Map<string, { id: string; minZ: number; maxZ: number; cogX: number; cogY: number; cogZ: number }> = new Map();
    const horizontalBars: { id: string; cogX: number; cogY: number; cogZ: number; minZ: number; maxZ: number }[] = [];

    // Scan all objects to classify them
    for (const id of objectIds) {
      try {
        const props = await API.viewer.getObjectProperties(modelId, [id]);
        const bb = await API.viewer.getObjectBoundingBoxes(modelId, [id]);

        if (!props || !props[0]?.properties || !bb || !bb[0]?.boundingBox) continue;

        const customProps = props[0].properties.find((p: any) => p.name === "SOLIDWORKS Custom Properties");
        if (!customProps || !customProps.properties) continue;

        const partNumber = customProps.properties.find((p: any) => p.name?.includes("bim2cam:Part Number"))?.value || "";
        if (!partNumber) continue;

        const bbox = bb[0].boundingBox;
        const cogX = (bbox.min.x + bbox.max.x) / 2 * 1000;
        const cogY = (bbox.min.y + bbox.max.y) / 2 * 1000;
        const cogZ = (bbox.min.z + bbox.max.z) / 2 * 1000;
        const minZ = bbox.min.z * 1000;
        const maxZ = bbox.max.z * 1000;

        const barMark = extractBarMark(partNumber);
        const isVertical = Math.abs(bbox.max.z - bbox.min.z) > Math.abs(bbox.max.x - bbox.min.x);

        if (isVertical) {
          // Vertical bar - add to map keyed by bar mark
          if (!verticalBars.has(barMark)) {
            verticalBars.set(barMark, { id, minZ, maxZ, cogX, cogY, cogZ });
          }
        } else {
          // Horizontal bar
          horizontalBars.push({ id, cogX, cogY, cogZ, minZ, maxZ });
        }
      } catch (e) {
        // Continue to next object
      }
    }

    // For each vertical bar mark, create a measurement to the closest horizontal bar
    for (const [mark, vertBar] of verticalBars.entries()) {
      let closestHBar: (typeof horizontalBars)[0] | null = null;
      let minDist = Infinity;

      for (const hBar of horizontalBars) {
        const dist = euclideanDistance(vertBar.cogX, vertBar.cogY, vertBar.minZ, hBar.cogX, hBar.cogY, hBar.maxZ);
        if (dist < minDist) {
          minDist = dist;
          closestHBar = hBar;
        }
      }

      if (closestHBar) {
        measurements.push({
          start: {
            positionX: vertBar.cogX,
            positionY: vertBar.cogY,
            positionZ: vertBar.minZ
          },
          end: {
            positionX: closestHBar.cogX,
            positionY: closestHBar.cogY,
            positionZ: closestHBar.cogZ
          },
          color: ANNOTATION_RED
        });
      }
    }
  } catch (error) {
    console.error("Error building View 4 dimensions:", error);
  }

  return measurements;
}

export async function buildViewGroups(_modelId: string): Promise<any> {
  return {};
}

export async function buildRTWFocusGroups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView2Groups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView3Groups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView5Groups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView6Groups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView7Groups(_modelId: string): Promise<any> {
  return {};
}

export async function buildView8Groups(_modelId: string): Promise<any> {
  return {};
}
