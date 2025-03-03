import { BaseEdge, EdgeProps, getBezierPath } from "reactflow";

const sanitizeCoord = (coord: number) => (isNaN(coord) ? 0 : coord);

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  console.log(`Edge ${id} coordinates before sanitization:`, {
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  sourceX = sanitizeCoord(sourceX);
  sourceY = sanitizeCoord(sourceY);
  targetX = sanitizeCoord(targetX);
  targetY = sanitizeCoord(targetY);

  console.log(`Edge ${id} coordinates after sanitization:`, {
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  // Generate the edge path
  const edgeData = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  let edgePath = Array.isArray(edgeData) ? edgeData[0] : edgeData;

  // Validate the edge path
  if (!edgePath || typeof edgePath !== "string" || edgePath.includes("NaN")) {
    console.warn(`Invalid edge path for ${id}, falling back to straight line`);
    edgePath = `M${sourceX},${sourceY} L${targetX},${targetY}`;
  }

  return (
    <BaseEdge id={id} path={edgePath} style={{ stroke: "white", strokeWidth: 2 }} />
  );
};

export default CustomEdge;
