import React from 'react';
import type { JigData } from '../module/TCJigData';
import './BoundingBoxInfo.css';

interface Props {
  jigData: JigData | null;
}

export const BoundingBoxInfo: React.FC<Props> = ({ jigData }) => {
  if (!jigData?.boundingBox) return null;

  const bbox = jigData.boundingBox;
  const width = (bbox.max.x - bbox.min.x) * 1000;
  const height = (bbox.max.y - bbox.min.y) * 1000;
  const depth = (bbox.max.z - bbox.min.z) * 1000;

  return (
    <div className="bbox-info">
      <div className="bbox-label">Model Bounds</div>
      <div className="bbox-dimensions">
        {width.toFixed(0)} × {height.toFixed(0)} × {depth.toFixed(0)} mm
      </div>
    </div>
  );
};
