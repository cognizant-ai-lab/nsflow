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

import type { SvgIconComponent } from '@mui/icons-material';

import Analytics from '@mui/icons-material/Analytics';
import Assessment from '@mui/icons-material/Assessment';
import AttachMoney from '@mui/icons-material/AttachMoney';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import BarChart from '@mui/icons-material/BarChart';
import Bolt from '@mui/icons-material/Bolt';
import Build from '@mui/icons-material/Build';
import Business from '@mui/icons-material/Business';
import Calculate from '@mui/icons-material/Calculate';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import Category from '@mui/icons-material/Category';
import Chat from '@mui/icons-material/Chat';
import CheckCircle from '@mui/icons-material/CheckCircle';
import CloudUpload from '@mui/icons-material/CloudUpload';
import Code from '@mui/icons-material/Code';
import Dashboard from '@mui/icons-material/Dashboard';
import DataObject from '@mui/icons-material/DataObject';
import Description from '@mui/icons-material/Description';
import DirectionsCar from '@mui/icons-material/DirectionsCar';
import Download from '@mui/icons-material/Download';
import Edit from '@mui/icons-material/Edit';
import Email from '@mui/icons-material/Email';
import Error from '@mui/icons-material/Error';
import Explore from '@mui/icons-material/Explore';
import FilterAlt from '@mui/icons-material/FilterAlt';
import Flag from '@mui/icons-material/Flag';
import Folder from '@mui/icons-material/Folder';
import Group from '@mui/icons-material/Group';
import HelpOutlined from '@mui/icons-material/HelpOutlined';
import History from '@mui/icons-material/History';
import Home from '@mui/icons-material/Home';
import Image from '@mui/icons-material/Image';
import Info from '@mui/icons-material/Info';
import Insights from '@mui/icons-material/Insights';
import Inventory from '@mui/icons-material/Inventory';
import Language from '@mui/icons-material/Language';
import Link from '@mui/icons-material/Link';
import ListAlt from '@mui/icons-material/ListAlt';
import LocalShipping from '@mui/icons-material/LocalShipping';
import LocationOn from '@mui/icons-material/LocationOn';
import Lock from '@mui/icons-material/Lock';
import Map from '@mui/icons-material/Map';
import Memory from '@mui/icons-material/Memory';
import Notifications from '@mui/icons-material/Notifications';
import Payments from '@mui/icons-material/Payments';
import Person from '@mui/icons-material/Person';
import Phone from '@mui/icons-material/Phone';
import PieChart from '@mui/icons-material/PieChart';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Psychology from '@mui/icons-material/Psychology';
import QuestionAnswer from '@mui/icons-material/QuestionAnswer';
import Receipt from '@mui/icons-material/Receipt';
import Report from '@mui/icons-material/Report';
import Schedule from '@mui/icons-material/Schedule';
import Science from '@mui/icons-material/Science';
import Search from '@mui/icons-material/Search';
import Security from '@mui/icons-material/Security';
import Settings from '@mui/icons-material/Settings';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Sort from '@mui/icons-material/Sort';
import Star from '@mui/icons-material/Star';
import Storage from '@mui/icons-material/Storage';
import SupportAgent from '@mui/icons-material/SupportAgent';
import TableChart from '@mui/icons-material/TableChart';
import ThumbUp from '@mui/icons-material/ThumbUp';
import Timeline from '@mui/icons-material/Timeline';
import Transform from '@mui/icons-material/Transform';
import TrendingUp from '@mui/icons-material/TrendingUp';
import Visibility from '@mui/icons-material/Visibility';
import Warning from '@mui/icons-material/Warning';

/**
 * The icons a widget may name.
 *
 * A widget names its icon in data, so this used to look the name up in the whole MUI
 * set via `import * as MuiIcons`. A namespace import is opaque to tree shaking, so
 * that put roughly 3.7 MB into the bundle, more than the rest of the application put
 * together, to serve the handful of names widgets actually use.
 *
 * The set is fixed and imported one icon at a time instead. Each is a few hundred
 * bytes, and a name outside the set falls back to a generic icon rather than failing.
 * Adding one is a one line change here.
 */
const WIDGET_ICONS: Record<string, SvgIconComponent> = {
  Analytics,
  Assessment,
  AttachMoney,
  AutoAwesome,
  BarChart,
  Bolt,
  Build,
  Business,
  Calculate,
  CalendarMonth,
  Category,
  Chat,
  CheckCircle,
  CloudUpload,
  Code,
  Dashboard,
  DataObject,
  Description,
  DirectionsCar,
  Download,
  Edit,
  Email,
  Error,
  Explore,
  FilterAlt,
  Flag,
  Folder,
  Group,
  HelpOutlined,
  History,
  Home,
  Image,
  Info,
  Insights,
  Inventory,
  Language,
  Link,
  ListAlt,
  LocalShipping,
  LocationOn,
  Lock,
  Map,
  Memory,
  Notifications,
  Payments,
  Person,
  Phone,
  PieChart,
  PlayArrow,
  Psychology,
  QuestionAnswer,
  Receipt,
  Report,
  Schedule,
  Science,
  Search,
  Security,
  Settings,
  ShoppingCart,
  Sort,
  Star,
  Storage,
  SupportAgent,
  TableChart,
  ThumbUp,
  Timeline,
  Transform,
  TrendingUp,
  Visibility,
  Warning,
};

/**
 * Shown when a widget names something outside the set.
 *
 * A generic icon rather than nothing: the widget header is laid out around having
 * one, so an empty space reads as a rendering bug rather than an unknown name.
 */
export const FALLBACK_WIDGET_ICON: SvgIconComponent = HelpOutlined;

/** Names already reported, so an unknown name is logged once rather than per render. */
const warnedNames = new Set<string>();

/**
 * Resolves a MUI icon name to its component.
 *
 * @param iconName - Name of the MUI icon (e.g., "Psychology", "Settings")
 * @returns The icon component or undefined if not found
 *
 * @example
 * const IconComponent = resolveIcon("Psychology");
 * if (IconComponent) {
 *   return <IconComponent sx={{ color: 'primary.main' }} />;
 * }
 */
export function resolveIcon(iconName?: string): SvgIconComponent | undefined {
  if (!iconName) {
    return undefined;
  }

  const icon = WIDGET_ICONS[iconName];
  if (icon) {
    return icon;
  }

  // Widget authors write both the plain and the Outlined form of a name, so try the
  // other one before giving up.
  const outlined = WIDGET_ICONS[`${iconName}Outlined`];
  if (outlined) {
    return outlined;
  }
  const plain = WIDGET_ICONS[iconName.replace(/Outlined$/, '')];
  if (plain) {
    return plain;
  }

  // Once per name, not once per call: this runs on every render of every widget card
  // and console.warn is slow enough for that to be felt.
  if (!warnedNames.has(iconName)) {
    warnedNames.add(iconName);
    console.warn(
      `Icon "${iconName}" is not in the widget icon set. Using the fallback. ` +
        `Add it to WIDGET_ICONS in utils/cruse/iconResolver.ts if it is worth having.`
    );
  }
  return FALLBACK_WIDGET_ICON;
}

/**
 * Whether this name resolves to a real icon rather than the fallback.
 *
 * Accepts the same spellings resolveIcon does. It used to check the raw key only,
 * which made it disagree with resolveIcon on every name in the set: each is listed in
 * one form, so the other form resolved fine and still answered false here.
 *
 * @param iconName - Name of the MUI icon
 * @returns true if the icon exists
 */
export function hasIcon(iconName: string): boolean {
  return (
    iconName in WIDGET_ICONS ||
    `${iconName}Outlined` in WIDGET_ICONS ||
    iconName.replace(/Outlined$/, '') in WIDGET_ICONS
  );
}

/** Every name this app will resolve, for documentation and UI builders. */
export const COMMON_WIDGET_ICONS = Object.keys(WIDGET_ICONS);
