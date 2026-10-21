import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Map,
  Maximize,
  Menu,
  Monitor,
  Moon,
  MousePointer,
  Network,
  RefreshCw,
  Search,
  Sun,
  X
} from "lucide-react";

const icons = {
  branch: GitBranch,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  search: Search,
  refresh: RefreshCw,
  menu: Menu,
  lock: LockKeyhole,
  key: KeyRound,
  help: CircleHelp,
  eye: Eye,
  eyeOff: EyeOff,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  monitor: Monitor,
  moon: Moon,
  sun: Sun,
  pointer: MousePointer,
  graph: Network,
  fit: Maximize,
  map: Map,
  more: Ellipsis,
  close: X
};

export type IconName = keyof typeof icons;

export function Icon({ name }: { name: IconName }) {
  const Component = icons[name];
  return <Component className="icon" strokeWidth={1.7} aria-hidden="true" />;
}
