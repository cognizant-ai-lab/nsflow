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

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { ReactFlow, Background, Controls, useEdgesState, useNodesState, useReactFlow, 
  Node, Edge, EdgeMarkerType, Connection, NodeChange, NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Alert, Box, Chip, CircularProgress, Fade, Typography, Paper, useTheme, IconButton, Tooltip, Slider, alpha, Button, ButtonGroup, ClickAwayListener, Dialog, DialogActions, DialogContent, DialogTitle, Grow, Popper, MenuList, MenuItem, Snackbar } from "@mui/material";
import EditableAgentNode from "./EditableAgentNode";
import FloatingEdge from "./FloatingEdge";
import AgentContextMenu from "./AgentContextMenu";
import EdgeContextMenu from "./EdgeContextMenu";
import EditorPalette from "./EditorPalette";
import NetworkAgentEditorPanel from "./NetworkAgentEditorPanel";
import NetworkFileActions from "./NetworkFileActions";
import NetworkNameField from "./NetworkNameField";
import { useApiPort } from "../context/ApiPortContext";
import { createLayoutManager } from "../utils/agentLayoutManager";
import LayoutIcon from "@mui/icons-material/AccountTree";
import LaunchIcon from "@mui/icons-material/RocketLaunchTwoTone";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import HelpIcon from "@mui/icons-material/HelpOutlined";
import RenameIcon from "@mui/icons-material/DriveFileRenameOutline";
import NewDraftIcon from "@mui/icons-material/EditNote";
import ChatIcon from "@mui/icons-material/ChatBubbleOutlined";
import HomeIcon from "@mui/icons-material/Home";
import { useChatContext } from "../context/ChatContext";
import { getFeatureFlags, toServedNetworkPath, getManifestUpdatePeriodMs } from "../utils/config";
import { selectEntry, useEditorNetworkStore } from "../state/editorNetworkStore";
import { isDraftKey, useEditorDraftSession } from "../state/editorSession";
import { buildEditorGraph } from "../state/editorGraph";
import { toConnectivityList } from "../state/definitionShape";
import { describeEdit, recordEditorActivity } from "../state/editorActivity";
import { sendEditorUpdate } from "../state/editorRoundTrip";
import { waitForServedNetwork } from "../state/servedNetworks";
import type { ChatMessage } from "../uiCommon";
import { useEditorProgressBridge } from "../state/progressBridge";
import type { ConnectivityInfo } from "../uiCommon";
import {
  addAgent as addAgentToDefinition,
  definitionIssues,
  deleteAgent as deleteAgentFromDefinition,
  disconnectAgents as disconnectAgentsInDefinition,
  reparentAgent as reparentAgentInDefinition,
  duplicateAgent as duplicateAgentInDefinition,
  canDelete,
  canDuplicate,
  canHaveChildren,
  connectAgents as connectAgentsInDefinition,
  newAgentAttributes,
  uniqueAgentName,
} from "../state/editorOperations";
import { FRONTMAN_ITEM, PALETTE_DRAG_TYPE, type PaletteItem } from "../state/paletteSources";
import { requestChatFocus } from "../utils/focusChat";

export const nodeTypes = Object.freeze({
  agent: EditableAgentNode,
  editable_agent: EditableAgentNode,
  undefined_agent: EditableAgentNode,
});

export const edgeTypes = Object.freeze({
  floating: FloatingEdge,
});

/**
 * What the editor will and will not let you do, and why.
 *
 * Every line here corresponds to a rule enforced in `editorOperations`, so a greyed
 * out action always has an explanation the user can find.
 */
const EDITING_RULES: string[] = [
  "Adding an agent attaches it to the selected agent, or to the frontman when nothing is selected.",
  "The frontman is the network's entry point: it cannot be deleted or duplicated. Edit its instructions instead, or start a new draft.",
  "A toolbox tool or another network cannot have down-chain agents, so nothing can be attached to it.",
  "Right-click a connection to delete it, or drag its end onto another agent to move the child.",
  "A change that leaves an agent with no parent is kept on the canvas but not saved until you reconnect it.",
];

/** Starting over is a third kind of action, so a third hue. */
const NEW_DRAFT_TINT = "#c3b1f5";

/** A .hocon the backend has parsed, held while we decide whether to ask about it. */
type ParsedImport = {
  readonly definition: ConnectivityInfo[];
  readonly networkName: string;
  readonly hocon?: string;
  /** The file's own name, which is what the user recognises in a prompt. */
  readonly fileName: string;
};

const EditorAgentFlow = ({ selectedNetwork }: { selectedNetwork: string }) => {
  const { apiUrl } = useApiPort();
  // v12 needs the node/edge type explicitly: an untyped useNodesState([]) infers never[].
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView, setViewport, getNodes, getEdges } = useReactFlow();
  const theme = useTheme();

  // Where a manual edit goes when the user has not picked a network: building a
  // network from scratch has to work before it has a name, so edits land in a draft
  // and the designer names it on the first round-trip. Without this the editor is
  // dead on a blank canvas, since every edit path needs a store key.
  //
  // The draft is scoped to this editing session, so arriving at the Editor gives a
  // clean canvas rather than reopening whatever was drawn days ago.
  const { draftKey, startNewSession } = useEditorDraftSession();
  const networkId = selectedNetwork || draftKey;

  // The store is the authority for the definition; the canvas renders from it.
  const entry = useEditorNetworkStore((state) => selectEntry(state, networkId));
  const applyEdit = useEditorNetworkStore((state) => state.applyEdit);
  const reconcileFromServer = useEditorNetworkStore((state) => state.reconcileFromServer);

  // Naming is offered for a draft only. Renaming a network that was selected from
  // the sidebar would save a second copy under the new name and leave the original
  // behind, which needs designer-side cleanup this cannot do from the browser.
  const isDraft = isDraftKey(networkId);
  const networkLabel = selectedNetwork || entry?.networkName || "";
  // Shown until the draft has a name, and reopened by the pencil after that.
  const [isNamingNetwork, setIsNamingNetwork] = useState(false);
  const showNameField = Boolean(entry) && (isDraft ? !entry?.networkName || isNamingNetwork : isNamingNetwork);
  // Chat-driven changes arrive on the progress/slydata sockets and land in the same
  // store, so the canvas does not care whether a change came from chat or a manual
  // edit. Keyed on networkId rather than selectedNetwork so that the handover works
  // in both directions: a user who builds a network by hand and then asks the chat to
  // reword its instructions sees the result on the same canvas, instead of the frames
  // being dropped because no network is formally "selected".
  useEditorProgressBridge(networkId);


  // Layout control state (similar to AgentFlow)
  const [baseRadius, setBaseRadius] = useState(30);
  const [levelSpacing, setLevelSpacing] = useState(80);
  const [tempBaseRadius, setTempBaseRadius] = useState(baseRadius);
  const [tempLevelSpacing, setTempLevelSpacing] = useState(levelSpacing);
  const { pluginCruse } = getFeatureFlags();
  const shouldForceLayoutRef = useRef(false);
  // The network whose viewport has already been pinned, so switching networks
  // re-frames the canvas but ordinary edits and selections do not.
  const pinnedViewportForRef = useRef<string | null>(null);
  const lastSeenNameRef = useRef<string | null>(null);
  const [showLaunchButton, setShowLaunchButton] = useState(false);
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  /** Why the last import failed, or undefined. */
  const [importError, setImportError] = useState<string | undefined>(undefined);
  /** A parsed import waiting on confirmation, because it would overwrite a network. */
  const [pendingImport, setPendingImport] = useState<ParsedImport | undefined>(undefined);
  const launchAnchorRef = useRef<HTMLDivElement>(null);

  // We'll read the latest agent_network_definition from logs in view-mode
  const { getLatestNetworkPayload, addSlyDataMessage, targetNetwork,
    progressTick, slyDataTick, waitingForAgent } = useChatContext();

  // The launch button becomes visible as soon as the designer reports a network name,
  // but a freshly-generated network isn't actually finished/registered until the agent
  // completes its turn. Disable launch while we're still waiting on the agent so users
  // can't launch a half-built network. `waitingForAgent` is true from message-send until
  // the final agent chat message arrives (or the chat socket closes); it's the same
  // signal the "Load Existing" dropdown already gates on. It is never true for loaded
  // existing networks, so those stay launchable immediately.
  //
  // Even after the agent finishes, the neuro-san server needs a couple of seconds to
  // reload its registries before the new network is discoverable via /api/v1/list. We
  // hold the button disabled for one manifest-reload period after generation completes
  // (the `waitingForAgent` true->false transition) so launching can't race that refresh.
  const [registryReloadPending, setRegistryReloadPending] = useState(false);
  const prevWaitingRef = useRef(waitingForAgent);
  useEffect(() => {
    const wasWaiting = prevWaitingRef.current;
    prevWaitingRef.current = waitingForAgent;
    // A generation cycle just finished: start the registry-reload grace period.
    if (wasWaiting && !waitingForAgent) {
      setRegistryReloadPending(true);
      const timer = setTimeout(() => setRegistryReloadPending(false), getManifestUpdatePeriodMs());
      return () => clearTimeout(timer);
    }
  }, [waitingForAgent]);

  // What the launch buttons will open. A chat-generated network is named by the
  // designer; a hand-built one carries the name the user gave it, which is also the
  // name it was saved under.
  const launchableNetworkName =
    getLatestNetworkPayload()?.agent_network_name || entry?.networkName || selectedNetwork || "";

  // Visible as soon as the canvas holds a network, rather than waiting for the
  // designer to announce a name: a network built by hand never produces that
  // announcement, so the button used to stay hidden however complete the network was.
  const hasNetworkToLaunch = (entry?.definition?.length ?? 0) > 0;

  // A network with no name has not been persisted, so there is nothing on the server
  // to launch yet. Showing the button but disabling it says that much more clearly
  // than hiding it.
  /**
   * True while the agent network designer is mid-turn.
   *
   * Manual editing is withheld throughout: the designer is rewriting the same
   * definition, so an edit sent into that is either overwritten or canonicalised on
   * top of a half-built network. The Launch button already used this condition; the
   * rest of the manual surface now uses the same one rather than each gate inventing
   * its own idea of "busy".
   */
  const designerBusy = waitingForAgent;

  const launchDisabled = waitingForAgent || registryReloadPending || !launchableNetworkName;

  // Latest agent network name for the launch button — same selector as the canvas
  // and outgoing sly_data, so all three always name the same network.
  const getLatestAgentNetworkName = useCallback(() => {
    return getLatestNetworkPayload()?.agent_network_name;
  }, [getLatestNetworkPayload]);

  // Layout manager for position caching and intelligent layout
  // Memoised deliberately. renderFromStore depends on this, and the effect that
  // renders depends on renderFromStore, so an unmemoised layout manager would give
  // renderFromStore a new identity on every render, re-run the effect, call
  // setNodes/setEdges, and loop until React throws "maximum update depth exceeded".
  const layoutManager = useMemo(
    () => createLayoutManager(networkId, { baseRadius, levelSpacing }),
    [networkId, baseRadius, levelSpacing]
  );
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string;
  }>({ visible: false, x: 0, y: 0, nodeId: "" });

  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  /** The agent a drop would attach to, or "" over empty canvas. */
  const [dropTargetId, setDropTargetId] = useState("");
  /** Held while the naming dialog is up, and added once the network has a name. */
  const [pendingFirstItem, setPendingFirstItem] = useState<PaletteItem | null>(null);
  
  // Agent editor state
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  /**
   * Counts explicit requests to open the agent panel.
   *
   * A counter, not a boolean. As a boolean this said "the panel may auto-expand",
   * which stayed true after the user closed the panel, so the next time the panel
   * reloaded its data (which happens on every progress frame while the designer
   * works) it opened itself again. A counter says "open now", once, and closing is
   * therefore final until the user asks again.
   */
  const [panelOpenRequests, setPanelOpenRequests] = useState(0);

  // Render the canvas from the store.
  //
  // This replaces the old fetch: edit mode used to GET /andeditor/state/connectivity
  // and view mode used to POST /connectivity/from_json just to turn a definition
  // into nodes and edges. Both are now done in the browser by buildEditorGraph,
  // which is verified to produce the same graph the backend did.
  const renderFromStore = useCallback(() => {
    const definition = entry?.definition ?? [];
    if (definition.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const graph = buildEditorGraph(definition, entry?.networkName ?? networkId);

    const rawNodes = graph.nodes.map((node) => ({
      ...node,
      // `selected` is React Flow's own flag and decides what the Delete key removes;
      // `data.selected` is what our node component styles from. Only the latter was
      // being set, and since this rebuilds every node object it also wiped whatever
      // selection React Flow had made on click — so Delete had nothing to act on.
      selected: node.id === selectedNodeId,
      data: { ...node.data, selected: node.id === selectedNodeId },
    }));

    const transformedEdges = graph.edges.map((edge) => ({
      ...edge,
      markerEnd: "arrowclosed" as EdgeMarkerType,
      style: { stroke: theme.palette.divider, strokeWidth: 2 },
      type: "floating",
    }));

    // Annotated as Node[] so the layout manager's return value is assignable
    // (rawNodes alone infers a narrower literal type under @xyflow/react 12).
    let finalNodes: Node[] = rawNodes;
    if (layoutManager && rawNodes.length > 0) {
      try {
        finalNodes = layoutManager.applyLayout(rawNodes, transformedEdges).nodes;
      } catch (error) {
        console.warn("Failed to apply layout, using raw positions:", error);
      }
    }

    setNodes(finalNodes);
    setEdges(transformedEdges);

    // Pin the viewport only when arriving at a different network. This used to run on
    // every call, and selectedNodeId is one of this callback's dependencies, so
    // merely clicking an agent snapped the canvas back to zoom 0.5 and the user lost
    // whatever they had zoomed in to. Panning and zooming are the user's to keep
    // until they switch networks or press one of the view controls.
    if (pinnedViewportForRef.current !== networkId) {
      pinnedViewportForRef.current = networkId;
      // Only setViewport here, deliberately. @xyflow/react 12 no longer runs fitView
      // synchronously: it sets fitViewQueued and executes once the fresh nodes are
      // measured, i.e. AFTER setViewport's animation has started, so a fitView() on
      // this line would interrupt and override the pinned viewport.
      setViewport({ x: -70, y: 100, zoom: 0.5 }, { duration: 800 });
    }
  }, [networkId, entry?.definition, entry?.networkName, selectedNodeId, layoutManager, theme, setNodes, setEdges, setViewport]);

  // Mark the drop target on the nodes already on the canvas.
  //
  // Deliberately not part of renderFromStore: that rebuilds the graph and runs the
  // layout, which on every dragover tick would thrash the canvas. This only rewrites
  // the one flag on the nodes whose value actually changed.
  useEffect(() => {
    setNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const isTarget = node.id === dropTargetId;
        if (Boolean(node.data.is_drop_target) === isTarget) return node;
        changed = true;
        return { ...node, data: { ...node.data, is_drop_target: isTarget } };
      });
      return changed ? next : current;
    });
  }, [dropTargetId, setNodes]);

  // Handle node click — always populate panel data, but don't auto-expand
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    // Selecting an agent and editing it are different intents. A single click only
    // selects — it decides what the palette attaches to and what Delete removes —
    // while the editor panel is opened deliberately, by double-click or by
    // right-click "Edit Agent". Loading the agent here as well meant the panel
    // followed every click around the canvas.
    setSelectedNodeId(node.id);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    closeEdgeMenu();

    // Update nodes to show selection
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: n.id === node.id,
        },
      }))
    );
  }, [setNodes]);

  // Handle node double-click — expand panel
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedAgentName(node.id);
    setPanelOpenRequests((count) => count + 1);
  }, []);

  const [edgeMenu, setEdgeMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    source: string;
    target: string;
  }>({ visible: false, x: 0, y: 0, source: "", target: "" });

  const closeEdgeMenu = useCallback(
    () => setEdgeMenu({ visible: false, x: 0, y: 0, source: "", target: "" }),
    []
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdgeMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      source: edge.source,
      target: edge.target,
    });
  }, []);

  // Handle node context menu (right-click)
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  // Handle canvas click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId("");
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    closeEdgeMenu();
    
    // Update nodes to remove selection
    setNodes((nds) => 
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: false,
        },
      }))
    );
  }, [setNodes, closeEdgeMenu]);

  // Handle nodes change (including position updates)
  const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    onNodesChange(changes);
    
    // Save positions when nodes are moved (simplified approach)
    const positionChanges = changes.filter(change => change.type === 'position' && change.dragging === false);
    if (positionChanges.length > 0 && layoutManager) {
      // Debounce position saving
      setTimeout(() => {
        setNodes(currentNodes => {
          layoutManager.savePositions(currentNodes);
          return currentNodes;
        });
      }, 500);
    }
  }, [onNodesChange, layoutManager, setNodes]);

  // Force layout recalculation.
  //
  // Reads the live nodes and edges through getNodes/getEdges rather than closing over
  // the `nodes` and `edges` state. This is called from a requestAnimationFrame, by
  // which point the render that scheduled it has been replaced: with a closure it ran
  // against the node list from BEFORE the edit and wrote that back, so an agent that
  // renderFromStore had just added was silently removed again. The symptom was an
  // added agent appearing only after some other interaction — a pane click or a
  // reload — re-ran renderFromStore with nothing left to overwrite it.
  const handleForceLayout = useCallback(() => {
    if (!layoutManager) return;
    try {
      const currentNodes = getNodes();
      if (currentNodes.length === 0) return;
      // Edges are already transformed, so only the nodes are replaced.
      setNodes(layoutManager.forceLayout(currentNodes, getEdges()).nodes);
      setTimeout(() => {
        // Padding rather than a zoom cap, because it scales with the graph. 0.17
        // lands at roughly 90% of the zoom 0.1 gave, which keeps the outermost nodes
        // clear of the layout row and the canvas actions in the top corners.
        fitView({ padding: 0.17, duration: 800 });
      }, 100);
    } catch (error) {
      console.warn('Failed to force layout:', error);
    }
  }, [layoutManager, getNodes, getEdges, setNodes, fitView]);

  // Apply an edit locally, then let the designer canonicalise it. The optimistic
  // apply is what makes editing feel immediate; the round-trip is what persists it.
  //
  // A newer edit supersedes an older one still in flight. Every edit sends the WHOLE
  // definition, so the newest send already contains everything the older one did and
  // the last write wins server-side regardless. What the abort prevents is the older
  // response arriving afterwards and reconciling a definition that is now stale,
  // which would undo the newer edit on the canvas. It also stops a queue building up
  // when a user adds several agents in quick succession.
  /** Set when the naming dialog is closing in order to hand over to the chat. */
  const focusChatOnCloseRef = useRef(false);
  const inFlightEditRef = useRef<AbortController | null>(null);
  /**
   * How many edits are being saved right now.
   *
   * A count rather than a boolean because edits supersede each other, so the
   * indicator has to survive one finishing while another is still going.
   *
   * This exists instead of slowing edits down. Rapid clicks are safe now that each
   * edit path reads the live definition, so the only thing missing was telling the
   * user their change registered. A delay would make every single edit feel worse
   * to fix a case that no longer misbehaves.
   */
  const [savingCount, setSavingCount] = useState(0);

  // Manual edits go over HTTP, so nothing about them reaches the sly_data websocket
  // the Sly Data panel listens to, and the panel sat on whatever the last chat turn
  // left there. Feeding the designer's echoed sly_data into the same stream a chat
  // turn writes to keeps one source for the panel rather than teaching it a second.
  const publishSlyData = useCallback(
    (frame: ChatMessage) => {
      const slyData = (frame as ChatMessage & { sly_data?: Record<string, unknown> }).sly_data;
      if (!slyData || !targetNetwork) return;
      // Only a frame carrying a definition is a complete picture of the network. The
      // same rule parseEchoedPayload applies, and for the same reason: a partial blob
      // would become the base for the next chat turn's sly_data, which round-trips
      // non-definition keys unchanged.
      if (!slyData.agent_network_definition) return;
      addSlyDataMessage({
        sender: targetNetwork,
        // Same markdown-fenced JSON the chat path posts, so the panel's parsing does
        // not have to know where the frame came from.
        text: `\`\`\`json\n${JSON.stringify(slyData, null, 2)}\n\`\`\``,
        network: targetNetwork,
      });
    },
    [addSlyDataMessage, targetNetwork]
  );

  const applyAndSync = useCallback(
    async (next: ConnectivityInfo[], agentName: string, message?: string) => {
      if (!apiUrl) return;
      applyEdit(networkId, next);

      // Logged on the local apply, not on the server round trip: this records what the
      // user did, and it did happen even when the definition is held back below for
      // being mid-rearrangement.
      recordEditorActivity(
        describeEdit(message ?? `Updated agent "${agentName}"`, launchableNetworkName || undefined)
      );

      // Hold a half-finished rearrangement locally rather than sending it. An
      // invalid definition is not rejected by the designer, it is REPAIRED by its
      // LLM, which restructures the network and discards the edit in progress. The
      // canvas still shows the change; the next valid edit persists everything.
      if (definitionIssues(next).length > 0) return;

      inFlightEditRef.current?.abort();
      const controller = new AbortController();
      inFlightEditRef.current = controller;

      setSavingCount((count) => count + 1);
      try {
        await sendEditorUpdate({
          apiUrl,
          networkId,
          agentName,
          definition: next,
          message,
          signal: controller.signal,
          onFrame: publishSlyData,
        });
      } catch (error) {
        // An abort is this function superseding itself, not a failure.
        if ((error as Error)?.name !== "AbortError") {
          console.error(`Failed to persist edit for ${agentName}:`, error);
        }
      } finally {
        setSavingCount((count) => Math.max(0, count - 1));
        if (inFlightEditRef.current === controller) inFlightEditRef.current = null;
      }
    },
    [networkId, apiUrl, applyEdit, publishSlyData, launchableNetworkName]
  );

  // Handle edge connection.
  //
  // Drawing an edge is how a free agent gets wired up, so it has to change the
  // definition. It used to only call setEdges, which meant the edge vanished the next
  // time the canvas rendered from the store and never reached the network. There is
  // no local setEdges here at all now: the store is the authority, and the render
  // effect draws the edge once the definition holds it.
  const onConnect = useCallback(
    (params: Connection) => {
      // Read from the store, not from this render's `entry`. Two clicks inside one
      // render cycle would otherwise both build on the same stale definition and the
      // first edit would be silently lost, which is exactly what a double click does.
      const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
      const next = connectAgentsInDefinition(definition, params.source ?? "", params.target ?? "");
      // Unchanged means the edge was refused: a toolbox tool or external reference
      // cannot have down-chains, and a duplicate or self-edge is nothing to do.
      if (next !== definition)
        void applyAndSync(
          next,
          params.source ?? "",
          `Connected "${params.target}" under "${params.source}"`
        );
    },
    [entry?.definition, applyAndSync]
  );

  // Context menu actions
  const handleEditAgent = (nodeId: string) => {
    setSelectedAgentName(nodeId);
    setPanelOpenRequests((count) => count + 1);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
  };

  const handleDeleteAgent = async (nodeId: string) => {
    const next = deleteAgentFromDefinition(entry?.definition ?? [], nodeId);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    setSelectedNodeId("");
    // deleteAgent returns the same array when nothing matched, so nothing to send.
    if (next !== (entry?.definition ?? []))
      await applyAndSync(next, nodeId, `Deleted agent "${nodeId}"`);
  };

  const handleDuplicateAgent = async (nodeId: string) => {
    // Read from the store, not from this render's `entry`. Two clicks inside one
    // render cycle would otherwise both build on the same stale definition and the
    // first edit would be silently lost, which is exactly what a double click does.
    const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
    // Uniquified, or a second copy would collide with the first and addAgent's
    // duplicate-name guard would silently make the action do nothing.
    const newAgentName = uniqueAgentName(definition, `${nodeId}_copy`);
    const next = duplicateAgentInDefinition(definition, nodeId, newAgentName);
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    if (next !== definition)
      await applyAndSync(next, newAgentName, `Added agent "${newAgentName}"`);
  };

  const handleAddChildAgent = async (nodeId: string) => {
    // Read from the store, not from this render's `entry`. Two clicks inside one
    // render cycle would otherwise both build on the same stale definition and the
    // first edit would be silently lost, which is exactly what a double click does.
    const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
    // Uniquified for the same reason as duplicate: a fixed "<parent>_child" meant an
    // agent could be given exactly one child, and every attempt after the first was
    // rejected as a duplicate name with nothing to show for it.
    const childAgentName = uniqueAgentName(definition, `${nodeId}_child`);
    const next = addAgentToDefinition(
      definition,
      childAgentName,
      nodeId,
      newAgentAttributes(childAgentName)
    );
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" });
    if (next !== definition)
      await applyAndSync(
        next,
        childAgentName,
        `Added agent "${childAgentName}" under "${nodeId}"`
      );
  };

  // One path for putting a palette item on the canvas, whether it was clicked or
  // dropped, so both persist exactly like a chat-generated agent does.
  //
  // With no explicit target `addAgent` attaches to the frontman, so nothing added
  // here can ever float free.
  const addPaletteItem = useCallback(
    async (item: PaletteItem, parentName?: string) => {
      if (!item?.agentName) return;

      // Read the entry live rather than from the render closure. This is called
      // straight after naming the network, and a captured `entry` would still be the
      // unnamed one, so the naming gate below would fire a second time and the agent
      // would never be added.
      const current = useEditorNetworkStore.getState().entries[networkId];
      const definition = current?.definition ?? [];

      // A network built by hand has no name until someone gives it one, and the
      // designer refuses to persist anything without `agent_network_name`. So the
      // first edit of an unnamed network would apply to the canvas and be silently
      // dropped server-side. Chat mode never hits this because the designer names
      // what it generates; manual mode has to ask. Asking once, before the first
      // agent exists, means every edit from then on persists.
      if (definition.length === 0 && !current?.networkName && networkId === draftKey) {
        setPendingFirstItem(item);
        return;
      }
      // Only a blank agent gets renamed to dodge a collision; a tool or a network
      // names something specific, so a second drop of it has to be a no-op.
      const agentName = item.uniquifyName
        ? uniqueAgentName(definition, item.agentName)
        : item.agentName;
      // An LLM agent needs instructions and a description; a toolbox tool must have
      // neither, since that absence is what marks it as a tool. addAgent refuses a
      // parent that cannot take children, so dropping onto a tool does nothing
      // rather than quietly attaching the agent somewhere else.
      const next = addAgentToDefinition(
        definition,
        agentName,
        parentName,
        item.isLlmAgent ? newAgentAttributes(agentName) : undefined
      );
      // addAgent returns the same array when the name is taken, which is what makes
      // adding the same tool twice a no-op rather than an error.
      if (next !== definition) await applyAndSync(next, agentName, `Duplicated agent "${agentName}"`);
    },
    [entry?.definition, applyAndSync]
  );

  // Delete one connection, leaving both agents in place. The agent that loses its
  // parent stays on the canvas so it can be reconnected; applyAndSync holds that
  // state locally until it is valid again.
  const handleDeleteConnection = useCallback(
    async (source: string, target: string) => {
      closeEdgeMenu();
      // Read from the store, not from this render's `entry`. Two clicks inside one
      // render cycle would otherwise both build on the same stale definition and the
      // first edit would be silently lost, which is exactly what a double click does.
      const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
      const next = disconnectAgentsInDefinition(definition, source, target);
      if (next !== definition) await applyAndSync(next, source, `Disconnect "${target}" from "${source}"`);
    },
    [entry?.definition, applyAndSync, closeEdgeMenu]
  );

  // Dragging an edge's endpoint onto another agent moves the child in ONE edit, so
  // the definition never passes through the rootless state that delete-then-connect
  // would produce.
  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      // Read from the store, not from this render's `entry`. Two clicks inside one
      // render cycle would otherwise both build on the same stale definition and the
      // first edit would be silently lost, which is exactly what a double click does.
      const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
      // Only the parent end is meaningful here: the child keeps its identity, and
      // what changes is which agent chains down to it.
      const next = reparentAgentInDefinition(
        definition,
        oldEdge.target,
        oldEdge.source,
        connection.source ?? ""
      );
      if (next !== definition) {
        void applyAndSync(next, connection.source ?? "", `Move "${oldEdge.target}" under "${connection.source}"`);
      }
    },
    [entry?.definition, applyAndSync]
  );

  // Selecting an agent and pressing Delete removes it, through the same path as the
  // context menu so the frontman guard and the child promotion apply either way.
  // React Flow raises this for any node it considers deleted; refusing one simply
  // leaves the definition unchanged.
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) void handleDeleteAgent(node.id);
    },
    // handleDeleteAgent is a plain function redeclared each render, so it is read
    // through the ref-free closure here; the definition it reads comes from `entry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.definition, applyAndSync]
  );

  // Selecting an edge and pressing Delete goes through the same path, so the keyboard
  // and the context menu cannot drift apart.
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) void handleDeleteConnection(edge.source, edge.target);
    },
    [handleDeleteConnection]
  );

  // Clicking a palette item attaches it to whichever agent is selected, falling back
  // to the frontman when nothing is.
  const handlePaletteAdd = useCallback(
    (item: PaletteItem) => addPaletteItem(item, selectedNodeId || undefined),
    [addPaletteItem, selectedNodeId]
  );

  // Why the canvas is not being saved, if it is not. Derived from the definition
  // rather than remembered from the last edit, so it survives a reload: the store is
  // persisted, so an unsaved rearrangement outlives the page that made it, and a
  // warning that disappeared on refresh would read as "saved".
  const pendingIssues = useMemo(() => {
    const definition = entry?.definition ?? [];
    // An empty canvas is not an unsaved change, it is a starting point.
    return definition.length === 0 ? [] : definitionIssues(definition);
  }, [entry?.definition]);

  // A click adds under the selected agent, so a selection that cannot take children
  // disables the palette rather than having the click land somewhere unexpected.
  // The designer takes precedence: while it is rewriting the network, nothing about
  // the current selection matters, and this is the reason the user needs to see.
  const paletteDisabledReason = designerBusy
    ? "The agent network designer is working. Manual editing resumes when it finishes."
    : selectedNodeId && !canHaveChildren(entry?.definition ?? [], selectedNodeId)
      ? `"${selectedNodeId}" cannot have down-chain agents. Deselect it to add elsewhere.`
      : undefined;

  // Name a network that is still a draft.
  //
  // The name is what decides persistence: verified against a live designer, an edit
  // sent without `agent_network_name` is canonicalised and echoed but never saved,
  // while one sent with a name is assembled and saved under it. So naming a draft is
  // also the moment it starts being persisted.
  //
  // Offered for a first name only. Renaming an already-saved network would save it
  // again under the new name and leave the old registry entry behind, which needs
  // designer-side cleanup this cannot do from here.
  const handleNameNetwork = useCallback(
    async (proposedName: string) => {
      const name = proposedName.trim();
      if (!name || !apiUrl) return;

      // Live, for the same reason addPaletteItem reads live: this runs from a dialog
      // whose callback was created before the current definition existed.
      const definition = useEditorNetworkStore.getState().entries[networkId]?.definition ?? [];
      // Record it locally first, so the panel and the next edit's outgoing sly_data
      // agree on the name even before the echo comes back. reconcileFromServer is
      // the right door: a name is not an edit, so it must not create an undo step.
      reconcileFromServer(networkId, { definition, networkName: name });

      // Nothing to persist for a network with no agents yet. The name is recorded
      // locally and the first agent added carries it, which is what makes that first
      // edit persist instead of being dropped for a missing agent_network_name.
      if (definition.length === 0) return;

      // Supersede any in-flight edit, for the same reason applyAndSync does: this
      // send carries the whole definition, and an older response landing afterwards
      // would reconcile a definition that predates the name.
      inFlightEditRef.current?.abort();
      const controller = new AbortController();
      inFlightEditRef.current = controller;

      try {
        await sendEditorUpdate({
          apiUrl,
          networkId,
          agentName: definition[0]?.origin ?? "frontman",
          definition,
          networkName: name,
          message: `Name this agent network "${name}"`,
          signal: controller.signal,
        });
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") {
          console.error(`Failed to name the network ${name}:`, error);
        }
      } finally {
        if (inFlightEditRef.current === controller) inFlightEditRef.current = null;
      }
    },
    [apiUrl, networkId, reconcileFromServer]
  );

  /** The agent under the cursor during a drag, if any. */
  const nodeUnderCursor = (event: React.DragEvent | React.MouseEvent): string =>
    (event.target as HTMLElement | null)?.closest(".react-flow__node")?.getAttribute("data-id") ?? "";

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      // Without preventDefault the browser refuses the drop entirely.
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      // Highlight what the drop would attach to. A tool cannot take children, so
      // hovering one highlights nothing rather than promising a connection that
      // would be refused.
      const hovered = nodeUnderCursor(event);
      const attachable = hovered && canHaveChildren(entry?.definition ?? [], hovered) ? hovered : "";
      setDropTargetId((current) => (current === attachable ? current : attachable));
    },
    [entry?.definition]
  );

  const onDragLeave = useCallback((event: React.DragEvent) => {
    // Leaving for a child element is not leaving the canvas, so only a move outside
    // the whole pane clears the highlight.
    const leavingTo = event.relatedTarget as globalThis.Node | null;
    if (leavingTo && event.currentTarget.contains(leavingTo)) return;
    setDropTargetId("");
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const payload = event.dataTransfer.getData(PALETTE_DRAG_TYPE);
      if (!payload) return;

      let item: PaletteItem;
      try {
        item = JSON.parse(payload) as PaletteItem;
      } catch {
        return;
      }

      // What was dropped ON decides the parent; dropping on empty canvas falls back
      // to the frontman. The drop POSITION is deliberately ignored, unlike Flowise's
      // free-form canvas: this graph is laid out as a hierarchy, so the layout
      // manager would immediately overwrite any position taken from the cursor.
      const droppedOnNodeId = nodeUnderCursor(event);
      setDropTargetId("");
      await addPaletteItem(item, droppedOnNodeId || undefined);
    },
    [addPaletteItem]
  );

  // Handle agent update from editor panel
  const handleAgentUpdated = async () => {
    // Nothing to refetch: the panel writes through the store, which re-renders the
    // canvas on its own.
  };

  /**
   * Download the network as a .hocon file.
   *
   * The text is whatever the designer last assembled and sent back as
   * `agent_network_hocon_text`, kept in the store. nsflow deliberately does not
   * assemble its own: the designer already owns that job, and a second writer here
   * would be a second answer to the same question, free to drift from the first.
   */
  const handleExportHocon = useCallback(async () => {
    const name = launchableNetworkName || selectedNetwork || "agent_network";

    // The store's copy first, then the served registry file. Two sources because the
    // store's copy is keyed on `selectedNetwork || draftKey` and there is no
    // migration between those keys, so selecting a network the store knew as a draft
    // moves the lookup to an entry that has no HOCON yet. Falling back means export
    // stays available on exactly the same condition as Launch, rather than blinking
    // out whenever the key changes underneath it.
    let text = entry?.hocon;
    if (!text && launchableNetworkName && apiUrl) {
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/export/agent_network/${encodeURIComponent(launchableNetworkName)}`
        );
        if (response.ok) text = await response.text();
      } catch {
        // Offline or the network is not served yet. Nothing to download, and the
        // button reporting failure is more noise than a no-op.
      }
    }
    if (!text) return;

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.hocon`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [apiUrl, entry?.hocon, launchableNetworkName, selectedNetwork]);

  /**
   * Open a .hocon file as the network under design.
   *
   * The backend parses it, because neuro-san's own restorer is what resolves
   * `include` and `${substitution}` the way a real load would. Parsing it in the
   * browser would mean a second HOCON dialect that agrees with neuro-san only until
   * someone uses a feature it does not implement.
   */
  /**
   * Save a parsed import and open it on the canvas.
   *
   * Saving is the step that makes it a real agent network rather than a picture of
   * one: until the designer has written it under its name, neuro-san does not serve
   * it, so Launch has nothing to open and Home and Cruse cannot see it. Doing this on
   * import rather than waiting for the user's first edit is the whole difference
   * between "imported" and "imported and usable".
   */
  const applyImport = useCallback(
    async (parsed: ParsedImport) => {
      if (!apiUrl) return;
      // Into the store first, exactly as a designer frame would arrive, so the canvas
      // draws immediately rather than after the round trip.
      useEditorNetworkStore.getState().reconcileFromServer(networkId, {
        definition: parsed.definition,
        networkName: parsed.networkName,
        hocon: parsed.hocon,
      });
      setImportError(undefined);

      // Hold Launch while the server picks the file up, using the same gate that
      // covers a chat-generated network. Saved is not servable until neuro-san's next
      // registry reload, and Launch before then opens nothing. `skip_designer` is set
      // inside sendEditorUpdate, so this saves the network exactly as imported.
      setRegistryReloadPending(true);
      try {
        await sendEditorUpdate({
          apiUrl,
          networkId,
          agentName: parsed.definition[0]?.origin ?? "",
          definition: parsed.definition,
          networkName: parsed.networkName,
          message: `Import agent network "${parsed.networkName}"`,
          onFrame: publishSlyData,
        });
        await waitForServedNetwork(apiUrl, parsed.networkName);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Could not save that network.");
      } finally {
        setRegistryReloadPending(false);
      }
    },
    [apiUrl, networkId, publishSlyData]
  );

  /**
   * Parse a chosen file, and ask first only when the import would overwrite.
   *
   * Parsing has to happen before the question can be asked, because the answer turns
   * on the imported network's name and that is inside the file.
   *
   * A differently named import is not destructive: the network currently on the
   * canvas has already been saved under its own name, so it survives untouched and
   * remains in the sidebar. Only an import of the SAME name replaces something, and
   * that is the only case worth interrupting for.
   */
  const handleImportRequested = useCallback(
    async (file: File) => {
      if (!apiUrl) return;
      setImportError(undefined);
      const body = new FormData();
      body.append("file", file);
      try {
        const response = await fetch(`${apiUrl}/api/v1/hocon/import`, { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) {
          setImportError(payload?.detail || "Could not read that file.");
          return;
        }
        const definition = toConnectivityList(payload.definition);
        const networkName: string | undefined = payload.network_name;
        if (!definition || !networkName) {
          setImportError("That file parsed but produced no agents.");
          return;
        }

        const parsed: ParsedImport = { definition, networkName, hocon: payload.hocon, fileName: file.name };
        // The server decides, because it is the one that knows the registry. Comparing
        // against the network on this canvas was too narrow: importing a name that is
        // already served overwrites it whether or not it happens to be open here.
        if (payload.name_is_taken) {
          setPendingImport(parsed);
          return;
        }
        await applyImport(parsed);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Could not read that file.");
      }
    },
    [apiUrl, applyImport]
  );

  // Handle launch to Cruse (default)
  const handleLaunchCruse = useCallback(() => {
    const agentNetworkName = launchableNetworkName;
    if (agentNetworkName) {
      // The designer reports the raw name (e.g. "foo"); neuro-san serves generated
      // networks under the configured subdirectory (e.g. "generated/foo"), which is
      // what Cruse matches against /api/v1/list. Map to the served path before launch.
      const servedName = toServedNetworkPath(agentNetworkName);
      const cruseUrl = `${window.location.origin}/cruse?network=${encodeURIComponent(servedName)}`;
      window.open(cruseUrl, '_blank');
    }
  }, [launchableNetworkName]);

  // Handle launch to Home (dropdown option)
  const handleLaunchHome = useCallback(() => {
    const agentNetworkName = launchableNetworkName;
    if (agentNetworkName) {
      const servedName = toServedNetworkPath(agentNetworkName);
      const homeUrl = `${window.location.origin}/home?network=${encodeURIComponent(servedName)}`;
      window.open(homeUrl, '_blank');
    }
    setLaunchMenuOpen(false);
  }, [launchableNetworkName]);

  // Toggle launch menu
  const handleToggleLaunchMenu = () => {
    setLaunchMenuOpen((prevOpen) => !prevOpen);
  };

  const handleCloseLaunchMenu = (event: Event | React.SyntheticEvent) => {
    if (
      launchAnchorRef.current &&
      launchAnchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }
    setLaunchMenuOpen(false);
  };

  // Effects
  // Load data when network changes or layout parameters change (similar to AgentFlow)
  //
  // Gated on the store entry rather than on selectedNetwork, so a draft built by
  // dragging renders even though no network has been chosen.
  useEffect(() => {
    if (entry) {
      renderFromStore();
    } else {
      setNodes([]);
      setEdges([]);
      setShowLaunchButton(false);
      lastSeenNameRef.current = null;
    }
  }, [entry, entry?.definition, baseRadius, levelSpacing, renderFromStore]);

  // Update temp values when actual values change
  useEffect(() => {
    setTempBaseRadius(baseRadius);
  }, [baseRadius]);

  useEffect(() => {
    setTempLevelSpacing(levelSpacing);
  }, [levelSpacing]);

  // Relayout after the progress stream changes the definition. The bridge already
  // wrote it to the store, so there is nothing to refetch; this only latches an
  // animated relayout so the graph settles into its new shape.
  useEffect(() => {
    if (entry) {
      shouldForceLayoutRef.current = true;
    }
  }, [progressTick, slyDataTick, entry]);

  // The same settle for a manual edit. Chat ticks used to be the only thing that
  // latched a relayout, so an agent added by hand stayed wherever the first layout
  // put it and the graph only tidied itself up later, when some unrelated chat frame
  // arrived. Keyed on the topology, so renaming instructions does not reshuffle the
  // canvas while the user is reading it.
  const topologySignature = useMemo(
    () =>
      (entry?.definition ?? [])
        .map((agent) => `${agent.origin}>${[...(agent.tools ?? [])].sort().join(",")}`)
        .sort()
        .join("|"),
    [entry?.definition]
  );
  const previousTopologyRef = useRef(topologySignature);
  useEffect(() => {
    if (previousTopologyRef.current === topologySignature) return;
    previousTopologyRef.current = topologySignature;
    shouldForceLayoutRef.current = true;
  }, [topologySignature]);

  // After nodes/edges update, run animated relayout once
  useEffect(() => {
    if (entry && shouldForceLayoutRef.current) {
      // reset the latch before invoking to avoid loops
      shouldForceLayoutRef.current = false;

      // wait for the DOM/positions to update, then animate
      requestAnimationFrame(() => {
        handleForceLayout();
      });
    }
  }, [nodes, edges, entry, handleForceLayout]);

  // Monitor for agent network name changes to show launch button
  useEffect(() => {
    if (selectedNetwork) {
      const currentName = getLatestAgentNetworkName();
      if (currentName && currentName !== lastSeenNameRef.current) {
        lastSeenNameRef.current = currentName;
        setShowLaunchButton(true);
      }
    }
  }, [progressTick, slyDataTick, selectedNetwork, getLatestAgentNetworkName]);


  return (
    <Box sx={{ 
      height: '100%', 
      backgroundColor: theme.palette.background.default,
      position: 'relative',
      display: 'flex'
    }}>
      {/* Main Flow Area */}
      <Box sx={{ 
        flexGrow: 1, 
        position: 'relative',
        backgroundColor: theme.palette.background.default
      }}>
        {/*
          Inside the flow area, not beside it: the palette is a notch floating over
          the canvas now, so it must be positioned against the canvas rather than
          taking a column of its own out of the row.
        */}
        <EditorPalette
          selectedNetwork={selectedNetwork}
          needsFrontman={(entry?.definition?.length ?? 0) === 0}
          disabledReason={paletteDisabledReason}
          onAddItem={handlePaletteAdd}
        />
        <ReactFlow
        nodes={nodes}
        // @xyflow/react 12 defaults --xy-controls-button-color-default to
        // `inherit`, so the Controls icons pick up the app's text colour (white
        // under the dark theme) while the button background stays on v12's light
        // palette, rendering them white-on-white. Handing v12 the palette mode
        // switches it to its own .dark variables. (v11 hardcoded the icon fill,
        // which is why this only appeared after the upgrade.)
        colorMode={theme.palette.mode}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        // Both, because the key a user calls "delete" differs by keyboard: the Mac
        // key labelled delete reports "Backspace", while "Delete" is a PC delete or
        // Mac fn+delete. xyflow binds only Backspace by default.
        /*
          No delete key while the designer works. The context menu already withholds
          Delete, and leaving the keyboard route open would be a way round it.
        */
        deleteKeyCode={designerBusy ? null : ["Delete", "Backspace"]}
        onReconnect={onReconnect}
        edgesReconnectable
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: "floating",
          markerEnd: "arrowclosed" as EdgeMarkerType,
        }}
        fitView
        onlyRenderVisibleElements
        attributionPosition="bottom-left"
        minZoom={0.01}
        maxZoom={3}
      >
        <Background/>
        <Controls 
          position="top-right"
          style={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '8px'
          }}
        />
      </ReactFlow>

      {/* Context Menu */}
      <AgentContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        nodeId={contextMenu.nodeId}
        onEdit={handleEditAgent}
        onDelete={handleDeleteAgent}
        onDuplicate={handleDuplicateAgent}
        onAddChild={handleAddChildAgent}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, nodeId: "" })}
        canAddChild={canHaveChildren(entry?.definition ?? [], contextMenu.nodeId)}
        canDuplicate={canDuplicate(entry?.definition ?? [], contextMenu.nodeId)}
        canDelete={canDelete(entry?.definition ?? [], contextMenu.nodeId)}
        readOnly={designerBusy}
      />

      {/* Name the network before its first agent exists */}
      <Dialog
        open={Boolean(pendingFirstItem)}
        onClose={() => setPendingFirstItem(null)}
        maxWidth="xs"
        fullWidth
        /*
          Focus the chat only once this dialog has finished leaving.
          MUI restores focus to whatever opened a dialog when it unmounts, which is the
          right thing for Cancel and the wrong thing here: asking for chat focus while
          the dialog was still closing meant MUI took it straight back, so the input
          lit up but had no caret. Keyed off the transition rather than a timeout, so
          it does not depend on guessing how long the animation takes.
        */
        slotProps={{
          transition: {
            onExited: () => {
              if (!focusChatOnCloseRef.current) return;
              focusChatOnCloseRef.current = false;
              requestChatFocus();
            },
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>Name this agent network</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            A network needs a name before it can be saved, so this is asked once, up
            front. Everything you build after this is saved as you go.
          </Typography>
          <NetworkNameField
            onSubmit={async (name) => {
              const item = pendingFirstItem;
              setPendingFirstItem(null);
              if (!item) return;
              await handleNameNetwork(name);
              // Name the frontman after the network rather than leaving every network
              // with an agent called "frontman": the name shows up in the generated
              // HOCON and in the chat, where "frontman" says nothing about what it
              // does. Renameable afterwards from the agent panel.
              await addPaletteItem(
                item === FRONTMAN_ITEM ? { ...item, agentName: `${name}_agent` } : item
              );
            }}
            onCancel={() => setPendingFirstItem(null)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 0, justifyContent: 'flex-start' }}>
          {/*
            Building by hand is one way in, not the only one. Offering the other here
            costs a line and saves a user who opened this dialog without realising
            they could simply describe what they want.
          */}
          <Button
            size="small"
            startIcon={<ChatIcon fontSize="small" />}
            onClick={() => {
              // Requested on exit, not here: see the dialog's onExited above.
              focusChatOnCloseRef.current = true;
              setPendingFirstItem(null);
            }}
            sx={{ textTransform: 'none' }}
          >
            Describe it in chat instead
          </Button>
        </DialogActions>
      </Dialog>

      {/*
        Confirm only when an import would overwrite the network it names.
        A differently named import replaces nothing: the current network stays saved
        under its own name. Asking then would be a question with no stakes.
      */}
      <Dialog open={Boolean(pendingImport)} onClose={() => setPendingImport(undefined)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Overwrite {pendingImport?.networkName}?</DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>{pendingImport?.fileName}</strong> is also called
            {" "}
            <strong>{pendingImport?.networkName}</strong>, so importing it replaces the
            {" "}
            {entry?.definition?.length ?? 0} agents currently saved under that name.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 0 }}>
          <Button onClick={() => setPendingImport(undefined)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              const parsed = pendingImport;
              setPendingImport(undefined);
              if (parsed) void applyImport(parsed);
            }}
            sx={{ textTransform: 'none' }}
          >
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>

      {/*
        Why an import failed. A snackbar rather than a dialog: the file is simply not
        one we can open, there is nothing to decide, and the reason comes from the
        backend so it names the actual problem.
      */}
      <Snackbar
        open={Boolean(importError)}
        autoHideDuration={8000}
        onClose={() => setImportError(undefined)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setImportError(undefined)} sx={{ maxWidth: 520 }}>
          {importError}
        </Alert>
      </Snackbar>

      {/* Connection Context Menu */}
      <EdgeContextMenu
        visible={edgeMenu.visible}
        x={edgeMenu.x}
        y={edgeMenu.y}
        source={edgeMenu.source}
        target={edgeMenu.target}
        onDelete={handleDeleteConnection}
        onClose={closeEdgeMenu}
      />

      {/* Network Info Panel */}
      {entry && (
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            p: 1,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            minWidth: 200
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            {showNameField ? (
              <NetworkNameField
                initialName={entry?.networkName ?? ''}
                onSubmit={(name) => { setIsNamingNetwork(false); void handleNameNetwork(name); }}
                onCancel={entry?.networkName ? () => setIsNamingNetwork(false) : undefined}
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Typography variant="subtitle1" noWrap sx={{
                  fontWeight: 600,
                  color: theme.palette.text.primary
                }}>
                  Editing: {networkLabel}
                </Typography>
                {/*
                  Was gated on isDraft, which turns false the moment the network is
                  named and selected — so the rename affordance disappeared exactly
                  when the user had a name to change. Renaming saves the network again
                  under the new name and leaves the old entry in the registry, which
                  the field's own helper text says.
                */}
                <Tooltip title="Rename this network">
                  <IconButton size="small" onClick={() => setIsNamingNetwork(true)}>
                    <RenameIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {/*
                The editor refuses a few things on purpose, and a refusal the user
                cannot explain reads as a bug. The rules live here so they are
                discoverable before something is greyed out, not only after.
              */}
              <Tooltip
                arrow
                placement="right"
                title={
                  <Box sx={{ p: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                      How Manual Editing Works
                    </Typography>
                    {EDITING_RULES.map((rule) => (
                      <Typography key={rule} variant="caption" sx={{ display: 'block', mb: 0.25 }}>
                        • {rule}
                      </Typography>
                    ))}
                  </Box>
                }
              >
                <IconButton size="small" sx={{ color: theme.palette.text.secondary }}>
                  <HelpIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reorganize Layout">
                <span style={{ display: 'inline-flex' }}>
                  <IconButton
                    size="small"
                    onClick={handleForceLayout}
                    disabled={nodes.length === 0}
                    sx={{
                      color: theme.palette.primary.main,
                      '&:hover': {
                        backgroundColor: theme.palette.primary.main + '20'
                      }
                    }}
                  >
                    <LayoutIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
          
          {/*
            Node and edge counts used to live here. The graph is on screen and the
            sidebar already lists the agents, so they were a second and third place to
            read the same thing while making this panel three lines tall.
          */}
          {pendingIssues.length > 0 && (
            // Not saved, and why. Silence here would look like a save that worked.
            <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${theme.palette.divider}`, maxWidth: 300 }}>
              <Typography variant="caption" sx={{ color: theme.palette.warning.main, fontWeight: 600 }}>
                Not saved yet
              </Typography>
              {pendingIssues.map((issue) => (
                <Typography key={issue} variant="caption" sx={{ display: 'block', color: theme.palette.text.secondary }}>
                  {issue}
                </Typography>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {/*
        Launch, centred on the second row.
        It is the one action about the network rather than about the canvas, so it reads
        better as a primary call to action than as one more icon in a corner row.

        Second row rather than the first: the network info panel sits top left and grows
        rightward with the name, so a long name ran into a top-centre button. This row
        already holds the file actions on the right and is empty in the middle. Not the
        true centre of the canvas either, which a radial layout fills with the front man.
      */}
      <Box
        sx={{
          position: 'absolute',
          top: 76,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
        }}
      >
          {(showLaunchButton || hasNetworkToLaunch) && (pluginCruse ? (
            // Cruse enabled: Show Launch to Cruse with dropdown for Home
            <>
              <ButtonGroup
                ref={launchAnchorRef}
                variant="contained"
                color="primary"
                sx={{
                  borderRadius: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  '& .MuiButton-root': {
                    height: 40,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                      transform: 'scale(1.02)',
                      transition: 'all 0.2s ease-in-out'
                    }
                  }
                }}
              >
                {/* Main Launch Button - Cruse */}
                <Tooltip title={launchDisabled
                  ? "Waiting for the agent network to finish generating..."
                  : `Launch ${selectedNetwork || lastSeenNameRef.current} in Cruse`}>
                  {/* span wrapper so the tooltip still shows while the button is disabled */}
                  <span>
                    <Button
                      onClick={handleLaunchCruse}
                      disabled={launchDisabled}
                      startIcon={<LaunchIcon />}
                      sx={{
                        minWidth: 100,
                        px: 2.5,
                        textTransform: 'none',
                        borderTopLeftRadius: '28px',
                        borderBottomLeftRadius: '28px',
                        backgroundColor: theme.palette.primary.main,
                      }}
                    >
                      Launch
                    </Button>
                  </span>
                </Tooltip>

                {/* Dropdown Arrow */}
                <Tooltip title="More launch options">
                  <span>
                    <Button
                      size="small"
                      onClick={handleToggleLaunchMenu}
                      disabled={launchDisabled}
                      sx={{
                        px: 0.5,
                        minWidth: 32,
                        borderTopRightRadius: '28px',
                        borderBottomRightRadius: '28px',
                        borderLeft: `1px solid ${alpha(theme.palette.common.white, 0.3)}`,
                        backgroundColor: theme.palette.primary.main,
                      }}
                    >
                      <ArrowDropDownIcon />
                    </Button>
                  </span>
                </Tooltip>
              </ButtonGroup>

              {/* Dropdown Menu */}
              <Popper
                open={launchMenuOpen}
                anchorEl={launchAnchorRef.current}
                role={undefined}
                placement="bottom-end"
                transition
                disablePortal
                sx={{ zIndex: 21 }}
              >
                {({ TransitionProps, placement }) => (
                  <Grow
                    {...TransitionProps}
                    style={{
                      transformOrigin: placement === 'bottom-end' ? 'right top' : 'right bottom',
                    }}
                  >
                    <Paper
                      elevation={8}
                      sx={{
                        mt: 1,
                        minWidth: 160,
                        borderRadius: 2,
                        backgroundColor: theme.palette.background.paper,
                      }}
                    >
                      <ClickAwayListener onClickAway={handleCloseLaunchMenu}>
                        <MenuList sx={{ py: 0.5 }}>
                          <MenuItem
                            onClick={handleLaunchHome}
                            sx={{
                              display: 'flex',
                              gap: 1,
                              py: 1,
                              px: 1.5,
                              '&:hover': {
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              }
                            }}
                          >
                            <HomeIcon fontSize="small" color="action" />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              Launch in Home
                            </Typography>
                          </MenuItem>
                        </MenuList>
                      </ClickAwayListener>
                    </Paper>
                  </Grow>
                )}
              </Popper>
            </>
          ) : (
            // Cruse disabled: Show simple Launch to Home button
            <Tooltip title={launchDisabled
              ? "Waiting for the agent network to finish generating..."
              : `Launch ${selectedNetwork || lastSeenNameRef.current} in Home`}>
              {/* span wrapper so the tooltip still shows while the button is disabled */}
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<LaunchIcon />}
                  onClick={handleLaunchHome}
                  disabled={launchDisabled}
                  sx={{
                    height: 40,
                    minWidth: 88,
                    px: 2,
                    textTransform: 'none',
                    borderRadius: '20px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    backgroundColor: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                      transform: 'scale(1.02)',
                      transition: 'all 0.2s ease-in-out'
                    }
                  }}
                >
                  Launch
                </Button>
              </span>
            </Tooltip>
          ))}
      </Box>

      {/*
        File actions and starting over. The container is always rendered
        because importing a .hocon has to be reachable on an empty canvas, which is
        exactly when a user has a file and nothing drawn yet. Each button keeps its
        own condition.
      */}
      {(
        <Box
          sx={{
            position: 'absolute',
            top: 76,
            // Below the layout controls rather than beside them. Those became a
            // single wide row and were sitting on top of these buttons; stacking is
            // what keeps both readable whatever the canvas width.
            right: 60,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >

          {/*
            Export appears on the same condition as Launch: both need a network that
            actually exists. Import has no such condition, since an empty canvas is
            the most natural place to open a file.
          */}
          {/*
            Says an edit registered, without taking the canvas away to say it.
            Non-modal and non-blocking on purpose: the alternative considered was
            slowing edits down so a double click could not outrun them, which would
            have made every edit feel worse to fix a case that reading the live
            definition already fixed. This only closes the feedback gap that made
            clicking again feel necessary.
          */}
          {/* Quick in, quicker out: it should be gone the moment the change lands, not
              linger and imply work that has finished. */}
          <Fade in={savingCount > 0} timeout={{ enter: 100, exit: 160 }}>
            <Chip
              size="small"
              icon={<CircularProgress size={12} thickness={6} sx={{ color: 'inherit' }} />}
              label="Saving"
              sx={{
                height: 26,
                backgroundColor: alpha(theme.palette.background.paper, 0.95),
                backdropFilter: 'blur(8px)',
                border: `1px solid ${theme.palette.divider}`,
                color: theme.palette.text.secondary,
                '& .MuiChip-icon': { ml: 1, color: theme.palette.primary.main },
              }}
            />
          </Fade>

          <NetworkFileActions
            onExportHocon={hasNetworkToLaunch ? handleExportHocon : undefined}
            onImport={handleImportRequested}
            importTooltip="Import a .hocon file, saved and opened here for editing"
            size={40}
          />

          {/*
            Always available, not only while a draft is open: once a chat turn names
            the network this stopped being a draft and the button vanished, which is
            exactly when a user is most likely to want to start another one.
          */}
          <Tooltip title={`${isDraft ? "Start a new draft, discarding this one." : "Start a new agent network."} You can always describe a network in the chat instead of building it by hand.`}>
              <span style={{ display: 'inline-flex' }}>
                <IconButton
                  onClick={() => {
                    // Start over the same way the Editor starts: ask for a name, then
                    // put the frontman down. A draft therefore always has both, and
                    // nothing can be added before the network's entry point exists.
                    startNewSession();
                    setPendingFirstItem(FRONTMAN_ITEM);
                  }}
                  sx={{
                    width: 40,
                    height: 40,
                    // Tinted to match the file actions beside it, in a third hue: the
                    // three sit in a row and colour is what separates them at a
                    // glance. Fixed pastels for the same reason as the palette notch,
                    // since this is on the canvas in both themes.
                    color: NEW_DRAFT_TINT,
                    backgroundColor: alpha(NEW_DRAFT_TINT, theme.palette.mode === 'dark' ? 0.16 : 0.14),
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${alpha(NEW_DRAFT_TINT, 0.35)}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                    transition: 'background-color 160ms, transform 160ms',
                    '&:hover': {
                      backgroundColor: alpha(NEW_DRAFT_TINT, 0.3),
                      color: NEW_DRAFT_TINT,
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                <NewDraftIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      )}

      {/*
        Layout Controls Panel.
        Always shown. Gating this on `selectedNetwork` meant it vanished for exactly
        the networks most in need of arranging: a fresh draft and a freshly imported
        one, both of which live under a draft key and so have no selected network.
      */}
      {(
        <Paper
          elevation={1}
          sx={{
            position: 'absolute',
            top: 16,
            right: 60, // Move left to avoid ReactFlow controls
            zIndex: 20,
            px: 1.25,
            py: 0.5,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(8px)',
            // Each control is one row of label-then-slider rather than a stacked
            // block, which is what made this taller than the canvas needed.
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontSize: '0.6rem',
              whiteSpace: 'nowrap'
            }}>
              Radius {tempBaseRadius}
            </Typography>
            <Slider
              size="small"
              value={tempBaseRadius}
              min={10}
              max={300}
              onChange={(_, value) => setTempBaseRadius(value as number)}
              onMouseUp={() => setBaseRadius(tempBaseRadius)}
              onTouchEnd={() => setBaseRadius(tempBaseRadius)}
              sx={{
                color: theme.palette.primary.main,
                height: 2,
                '& .MuiSlider-thumb': {
                  width: 8,
                  height: 8
                },
                '& .MuiSlider-track': {
                  height: 2
                },
                '& .MuiSlider-rail': {
                  height: 2
                },
                width: 64,
              }}
            />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="caption" sx={{ 
              color: theme.palette.text.secondary,
              fontSize: '0.6rem',
              whiteSpace: 'nowrap'
            }}>
              Spacing {tempLevelSpacing}
            </Typography>
            <Slider
              size="small"
              value={tempLevelSpacing}
              min={10}
              max={300}
              onChange={(_, value) => setTempLevelSpacing(value as number)}
              onMouseUp={() => setLevelSpacing(tempLevelSpacing)}
              onTouchEnd={() => setLevelSpacing(tempLevelSpacing)}
              sx={{
                color: theme.palette.secondary.main,
                height: 2,
                '& .MuiSlider-thumb': {
                  width: 8,
                  height: 8
                },
                '& .MuiSlider-track': {
                  height: 2
                },
                '& .MuiSlider-rail': {
                  height: 2
                },
                width: 64,
              }}
            />
          </Box>
        </Paper>
      )}

        {nodes.length === 0 && (
          <Box sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Must not intercept drags. This overlay covers the whole canvas, and as
            // a sibling of <ReactFlow> anything dropped on it never reaches the
            // canvas handler, so dropping onto an empty canvas silently did nothing.
            pointerEvents: 'none'
          }}>
            <Typography variant="h6" sx={{
              color: theme.palette.text.secondary,
              textAlign: 'center',
              // Broken deliberately rather than left to wrap: the two halves are the
              // two ways in, so the line break carries meaning.
              whiteSpace: 'pre-line',
              lineHeight: 1.6
            }}>
              {'Click or Drag an agent from the palette,\nselect a network from the sidebar, or describe one in the chat'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Network Agent Editor Panel */}
      <NetworkAgentEditorPanel
        networkId={networkId}
        selectedAgentName={selectedAgentName}
        onAgentUpdated={handleAgentUpdated}
        onAgentRenamed={(newName) => {
          // Follow the agent so the panel and the canvas selection do not stay on a
          // name that no longer exists.
          setSelectedAgentName(newName);
          setSelectedNodeId(newName);
        }}
        onClose={() => setSelectedAgentName(null)}
        openRequest={panelOpenRequests}
        readOnly={designerBusy}
      />
    </Box>
  );
};

export default EditorAgentFlow;
