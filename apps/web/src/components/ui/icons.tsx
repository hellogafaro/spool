import {
  Alert01Icon as Alert01IconSvg,
  AlertCircleIcon as AlertCircleIconSvg,
  ArchiveIcon as ArchiveIconSvg,
  ArchiveOff04Icon as ArchiveOff04IconSvg,
  ArrowDown01Icon as ArrowDown01IconSvg,
  ArrowLeft01Icon as ArrowLeft01IconSvg,
  ArrowRight01Icon as ArrowRight01IconSvg,
  ArrowUp01Icon as ArrowUp01IconSvg,
  ArrowUpDownIcon as ArrowUpDownIconSvg,
  BotIcon as BotIconSvg,
  BubbleChatIcon as BubbleChatIconSvg,
  Bug01Icon as Bug01IconSvg,
  CheckListIcon as CheckListIconSvg,
  CheckmarkCircle02Icon as CheckmarkCircle02IconSvg,
  Chemistry01Icon as Chemistry01IconSvg,
  CircleUnlock01Icon as CircleUnlock01IconSvg,
  Clock03Icon as Clock03IconSvg,
  CloudIcon as CloudIconSvg,
  CloudUploadIcon as CloudUploadIconSvg,
  ComputerIcon as ComputerIconSvg,
  ComputerTerminal02Icon as ComputerTerminal02IconSvg,
  CopyIcon as CopyIconSvg,
  Delete02Icon as Delete02IconSvg,
  Download01Icon as Download01IconSvg,
  File01Icon as File01IconSvg,
  FileDiffIcon as FileDiffIconSvg,
  Folder01Icon as Folder01IconSvg,
  FolderAddIcon as FolderAddIconSvg,
  FolderGitIcon as FolderGitIconSvg,
  FolderGitTwoIcon as FolderGitTwoIconSvg,
  GitCommitIcon as GitCommitIconSvg,
  GitPullRequestIcon as GitPullRequestIconSvg,
  GlobeIcon as GlobeIconSvg,
  InformationCircleIcon as InformationCircleIconSvg,
  LegalHammerIcon as LegalHammerIconSvg,
  Link01Icon as Link01IconSvg,
  ListChevronsDownUpIcon as ListChevronsDownUpIconSvg,
  Loading03Icon as Loading03IconSvg,
  LockIcon as LockIconSvg,
  MoreHorizontalIcon as MoreHorizontalIconSvg,
  PanelLeftCloseIcon as PanelLeftCloseIconSvg,
  PanelLeftIcon as PanelLeftIconSvg,
  PanelRightCloseIcon as PanelRightCloseIconSvg,
  PencilEdit01Icon as PencilEdit01IconSvg,
  PencilEdit02Icon as PencilEdit02IconSvg,
  PlayIcon as PlayIconSvg,
  PlusSignIcon as PlusSignIconSvg,
  QrCodeIcon as QrCodeIconSvg,
  RefreshIcon as RefreshIconSvg,
  RotateLeft02Icon as RotateLeft02IconSvg,
  RotateRight02Icon as RotateRight02IconSvg,
  Search01Icon as Search01IconSvg,
  Settings01Icon as Settings01IconSvg,
  Settings02Icon as Settings02IconSvg,
  SparklesIcon as SparklesIconSvg,
  SplitIcon as SplitIconSvg,
  StarIcon as StarIconSvg,
  TableColumnsSplitIcon as TableColumnsSplitIconSvg,
  TableRowsSplitIcon as TableRowsSplitIconSvg,
  Task01Icon as Task01IconSvg,
  TerminalIcon as TerminalIconSvg,
  TextWrapIcon as TextWrapIconSvg,
  Tick02Icon as Tick02IconSvg,
  Undo02Icon as Undo02IconSvg,
  Wrench01Icon as Wrench01IconSvg,
  ZapIcon as ZapIconSvg,
  Cancel01Icon as Cancel01IconSvg,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type FC, forwardRef, type SVGProps } from "react";

type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: string | number | undefined;
  strokeWidth?: string | number | undefined;
  absoluteStrokeWidth?: boolean | undefined;
  primaryColor?: string | undefined;
  secondaryColor?: string | undefined;
  disableSecondaryOpacity?: boolean | undefined;
};

export type LucideIcon = FC<SVGProps<SVGSVGElement>>;

function createIcon(icon: IconSvgElement, displayName: string): LucideIcon {
  const Component = forwardRef<SVGSVGElement, AppIconProps>(function Icon(props, ref) {
    const {
      absoluteStrokeWidth,
      disableSecondaryOpacity,
      primaryColor,
      secondaryColor,
      size,
      strokeWidth,
      ...rest
    } = props;
    const parsedStrokeWidth =
      strokeWidth === undefined
        ? 2
        : typeof strokeWidth === "string"
          ? Number.parseFloat(strokeWidth)
          : strokeWidth;
    const strokeWidthProps =
      typeof parsedStrokeWidth === "number" && Number.isFinite(parsedStrokeWidth)
        ? { strokeWidth: parsedStrokeWidth }
        : {};

    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        {...rest}
        {...(size === undefined ? {} : { size })}
        {...strokeWidthProps}
        {...(absoluteStrokeWidth === undefined ? {} : { absoluteStrokeWidth })}
        {...(primaryColor === undefined ? {} : { primaryColor })}
        {...(secondaryColor === undefined ? {} : { secondaryColor })}
        {...(disableSecondaryOpacity === undefined ? {} : { disableSecondaryOpacity })}
      />
    );
  });
  Component.displayName = displayName;
  return Component as LucideIcon;
}

export const ArchiveIcon = createIcon(ArchiveIconSvg, "ArchiveIcon");
export const ArchiveX = createIcon(ArchiveOff04IconSvg, "ArchiveX");
export const ArrowDownIcon = createIcon(ArrowDown01IconSvg, "ArrowDownIcon");
export const ArrowLeftIcon = createIcon(ArrowLeft01IconSvg, "ArrowLeftIcon");
export const ArrowUpDownIcon = createIcon(ArrowUpDownIconSvg, "ArrowUpDownIcon");
export const ArrowUpIcon = createIcon(ArrowUp01IconSvg, "ArrowUpIcon");
export const BotIcon = createIcon(BotIconSvg, "BotIcon");
export const BugIcon = createIcon(Bug01IconSvg, "BugIcon");
export const CheckIcon = createIcon(Tick02IconSvg, "CheckIcon");
export const ChevronDownIcon = createIcon(ArrowDown01IconSvg, "ChevronDownIcon");
export const ChevronLeftIcon = createIcon(ArrowLeft01IconSvg, "ChevronLeftIcon");
export const ChevronRightIcon = createIcon(ArrowRight01IconSvg, "ChevronRightIcon");
export const ChevronUpIcon = createIcon(ArrowUp01IconSvg, "ChevronUpIcon");
export const ChevronsUpDownIcon = createIcon(ListChevronsDownUpIconSvg, "ChevronsUpDownIcon");
export const CircleAlertIcon = createIcon(AlertCircleIconSvg, "CircleAlertIcon");
export const CircleCheckIcon = createIcon(CheckmarkCircle02IconSvg, "CircleCheckIcon");
export const Clock3Icon = createIcon(Clock03IconSvg, "Clock3Icon");
export const CloudIcon = createIcon(CloudIconSvg, "CloudIcon");
export const CloudUploadIcon = createIcon(CloudUploadIconSvg, "CloudUploadIcon");
export const Columns2Icon = createIcon(TableColumnsSplitIconSvg, "Columns2Icon");
export const CopyIcon = createIcon(CopyIconSvg, "CopyIcon");
export const CornerLeftUpIcon = createIcon(Undo02IconSvg, "CornerLeftUpIcon");
export const DiffIcon = createIcon(FileDiffIconSvg, "DiffIcon");
export const DownloadIcon = createIcon(Download01IconSvg, "DownloadIcon");
export const EllipsisIcon = createIcon(MoreHorizontalIconSvg, "EllipsisIcon");
export const EyeIcon = createIcon(Search01IconSvg, "EyeIcon");
export const FileIcon = createIcon(File01IconSvg, "FileIcon");
export const FlaskConicalIcon = createIcon(Chemistry01IconSvg, "FlaskConicalIcon");
export const FolderClosedIcon = createIcon(Folder01IconSvg, "FolderClosedIcon");
export const FolderGit2Icon = createIcon(FolderGitTwoIconSvg, "FolderGit2Icon");
export const FolderGitIcon = createIcon(FolderGitIconSvg, "FolderGitIcon");
export const FolderIcon = createIcon(Folder01IconSvg, "FolderIcon");
export const FolderPlusIcon = createIcon(FolderAddIconSvg, "FolderPlusIcon");
export const GitCommitIcon = createIcon(GitCommitIconSvg, "GitCommitIcon");
export const GitPullRequestIcon = createIcon(GitPullRequestIconSvg, "GitPullRequestIcon");
export const GlobeIcon = createIcon(GlobeIconSvg, "GlobeIcon");
export const HammerIcon = createIcon(LegalHammerIconSvg, "HammerIcon");
export const InfoIcon = createIcon(InformationCircleIconSvg, "InfoIcon");
export const Link2Icon = createIcon(Link01IconSvg, "Link2Icon");
export const ListChecksIcon = createIcon(CheckListIconSvg, "ListChecksIcon");
export const ListTodoIcon = createIcon(Task01IconSvg, "ListTodoIcon");
export const Loader2Icon = createIcon(Loading03IconSvg, "Loader2Icon");
export const LoaderCircleIcon = createIcon(Loading03IconSvg, "LoaderCircleIcon");
export const LoaderIcon = createIcon(Loading03IconSvg, "LoaderIcon");
export const LockIcon = createIcon(LockIconSvg, "LockIcon");
export const LockOpenIcon = createIcon(CircleUnlock01IconSvg, "LockOpenIcon");
export const MessageSquareIcon = createIcon(BubbleChatIconSvg, "MessageSquareIcon");
export const MonitorIcon = createIcon(ComputerIconSvg, "MonitorIcon");
export const PanelLeftCloseIcon = createIcon(PanelLeftCloseIconSvg, "PanelLeftCloseIcon");
export const PanelLeftIcon = createIcon(PanelLeftIconSvg, "PanelLeftIcon");
export const PanelRightCloseIcon = createIcon(PanelRightCloseIconSvg, "PanelRightCloseIcon");
export const PenLineIcon = createIcon(PencilEdit01IconSvg, "PenLineIcon");
export const PlayIcon = createIcon(PlayIconSvg, "PlayIcon");
export const Plus = createIcon(PlusSignIconSvg, "Plus");
export const PlusIcon = createIcon(PlusSignIconSvg, "PlusIcon");
export const QrCodeIcon = createIcon(QrCodeIconSvg, "QrCodeIcon");
export const RefreshCwIcon = createIcon(RefreshIconSvg, "RefreshCwIcon");
export const RotateCcwIcon = createIcon(RotateLeft02IconSvg, "RotateCcwIcon");
export const RotateCwIcon = createIcon(RotateRight02IconSvg, "RotateCwIcon");
export const Rows3Icon = createIcon(TableRowsSplitIconSvg, "Rows3Icon");
export const SearchIcon = createIcon(Search01IconSvg, "SearchIcon");
export const Settings2Icon = createIcon(Settings02IconSvg, "Settings2Icon");
export const SettingsIcon = createIcon(Settings01IconSvg, "SettingsIcon");
export const SparklesIcon = createIcon(SparklesIconSvg, "SparklesIcon");
export const SquarePenIcon = createIcon(PencilEdit02IconSvg, "SquarePenIcon");
export const SquareSplitHorizontal = createIcon(SplitIconSvg, "SquareSplitHorizontal");
export const StarIcon = createIcon(StarIconSvg, "StarIcon");
export const TerminalIcon = createIcon(TerminalIconSvg, "TerminalIcon");
export const TerminalSquare = createIcon(ComputerTerminal02IconSvg, "TerminalSquare");
export const TerminalSquareIcon = createIcon(ComputerTerminal02IconSvg, "TerminalSquareIcon");
export const TextWrapIcon = createIcon(TextWrapIconSvg, "TextWrapIcon");
export const Trash2 = createIcon(Delete02IconSvg, "Trash2");
export const TriangleAlertIcon = createIcon(Alert01IconSvg, "TriangleAlertIcon");
export const Undo2Icon = createIcon(Undo02IconSvg, "Undo2Icon");
export const WrenchIcon = createIcon(Wrench01IconSvg, "WrenchIcon");
export const XIcon = createIcon(Cancel01IconSvg, "XIcon");
export const ZapIcon = createIcon(ZapIconSvg, "ZapIcon");
