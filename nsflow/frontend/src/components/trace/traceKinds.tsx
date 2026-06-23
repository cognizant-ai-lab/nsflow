/*
Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { ReactElement } from "react";
import {
  SmartToyOutlined,
  Hub,
  Build,
  CloudOutlined,
  Timeline,
} from "@mui/icons-material";
import { TraceKind } from "../../context/TraceContext";

export type KindStyle = {
  label: string;
  color: string;
  icon: ReactElement;
};

const ICON_SX = { fontSize: 16 };

export const KIND_STYLES: Record<TraceKind, KindStyle> = {
  agent: {
    label: "agent",
    color: "#4f86f7",
    icon: <SmartToyOutlined sx={ICON_SX} />,
  },
  sub_network: {
    label: "sub-network",
    color: "#a374db",
    icon: <Hub sx={ICON_SX} />,
  },
  tool: {
    label: "tool",
    color: "#e0a23a",
    icon: <Build sx={ICON_SX} />,
  },
  external_agent: {
    label: "external",
    color: "#3fb5a8",
    icon: <CloudOutlined sx={ICON_SX} />,
  },
  network_total: {
    label: "network",
    color: "#9aa0a6",
    icon: <Timeline sx={ICON_SX} />,
  },
  // Boundary kinds are never rendered but are listed to satisfy the union.
  invocation_start: {
    label: "invocation start",
    color: "#9aa0a6",
    icon: <Timeline sx={ICON_SX} />,
  },
  invocation_end: {
    label: "invocation end",
    color: "#9aa0a6",
    icon: <Timeline sx={ICON_SX} />,
  },
};

/**
 * Best-guess kind when the backend didn't tag it (older replay buffer events,
 * or steps synthesized from otrace transitions).
 */
export const guessKind = (otrace: string[], isNetworkTotal?: boolean): TraceKind => {
  if (isNetworkTotal) return "network_total";
  const leaf = otrace[otrace.length - 1] ?? "";
  if (typeof leaf === "string" && leaf.startsWith("/")) return "sub_network";
  return "agent";
};

export const styleFor = (
  kind: TraceKind | undefined,
  otrace: string[],
  isNetworkTotal?: boolean
): KindStyle => KIND_STYLES[kind ?? guessKind(otrace, isNetworkTotal)];
