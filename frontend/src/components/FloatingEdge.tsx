import { getBezierPath, useNodes } from "reactflow";
import { getEdgeParams } from "../utils/utils";

const FloatingEdge = ({ id, source, target, markerEnd, style }) => {
  const nodes = useNodes();

  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  // Get correct edge parameters
  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  // Generate the bezier path for a smooth curve
  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      strokeWidth={2}
      stroke="white"
      markerEnd={markerEnd}
      style={style}
    />
  );
};

export default FloatingEdge;
