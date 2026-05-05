export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export async function calculateModelBoundingBox(API: any): Promise<BoundingBox | null> {
  try {
    // Get all objects in the model
    const allObjectsData = await API.viewer.getObjects();
    const objects = allObjectsData[0]?.objects || [];

    if (objects.length === 0) return null;

    // Get the first model ID
    const modelID = objects[0]?.modelId;
    if (!modelID) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    // Calculate bounding box from all objects
    for (const obj of objects) {
      try {
        const props = await API.viewer.getObjectProperties(modelID, [obj.id]);
        const objProps = props[0]?.properties || [];

        // Look for OrientedBoundingBox property set
        for (const pset of objProps) {
          if (pset.name === 'OrientedBoundingBox') {
            const props = pset.properties || [];
            let ox = 0, oy = 0, oz = 0;
            let xx = 0, yy = 0, zz = 0;

            for (const prop of props) {
              if (prop.name === 'OX') ox = Number(prop.value) || 0;
              if (prop.name === 'OY') oy = Number(prop.value) || 0;
              if (prop.name === 'OZ') oz = Number(prop.value) || 0;
              if (prop.name === 'XX') xx = Number(prop.value) || 0;
              if (prop.name === 'YY') yy = Number(prop.value) || 0;
              if (prop.name === 'ZZ') zz = Number(prop.value) || 0;
            }

            minX = Math.min(minX, ox - xx / 2);
            maxX = Math.max(maxX, ox + xx / 2);
            minY = Math.min(minY, oy - yy / 2);
            maxY = Math.max(maxY, oy + yy / 2);
            minZ = Math.min(minZ, oz - zz / 2);
            maxZ = Math.max(maxZ, oz + zz / 2);
            break;
          }
        }
      } catch (err) {
        // Skip objects with errors
        continue;
      }
    }

    if (minX === Infinity) return null;

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  } catch (err) {
    console.error('[BoundingBoxUtil] Error calculating bounding box:', err);
    return null;
  }
}

export function formatBoundingBox(bbox: BoundingBox | null): string {
  if (!bbox) return 'N/A';
  const width = (bbox.max.x - bbox.min.x) * 1000;
  const height = (bbox.max.y - bbox.min.y) * 1000;
  const depth = (bbox.max.z - bbox.min.z) * 1000;
  return `${width.toFixed(0)} × ${height.toFixed(0)} × ${depth.toFixed(0)} mm`;
}
