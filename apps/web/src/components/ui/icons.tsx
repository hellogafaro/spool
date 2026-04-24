import type { FC, SVGProps } from "react";
import {
  RiAddLine,
  RiAlertLine,
  RiArchive2Line,
  RiArchiveLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowGoBackLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowUpDownLine,
  RiArrowUpLine,
  RiArrowUpSLine,
  RiBardLine,
  RiBrainLine,
  RiBugLine,
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCloudLine,
  RiCloseLine,
  RiComputerLine,
  RiCornerUpLeftLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiEditBoxLine,
  RiErrorWarningLine,
  RiExpandUpDownLine,
  RiEyeLine,
  RiFileLine,
  RiFlashlightLine,
  RiFlaskLine,
  RiFolderAddLine,
  RiFolderLine,
  RiGitBranchLine,
  RiGitCommitLine,
  RiGitPullRequestLine,
  RiGlobalLine,
  RiHammerLine,
  RiInformationLine,
  RiLayoutColumnLine,
  RiLinkM,
  RiListCheck3,
  RiLoader4Line,
  RiLockLine,
  RiLockUnlockLine,
  RiMoreLine,
  RiPlayLine,
  RiQrCodeLine,
  RiQuillPenLine,
  RiRefreshLine,
  RiRestartLine,
  RiRobot2Line,
  RiSearchLine,
  RiSettings3Line,
  RiSettings4Line,
  RiSideBarLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiSparklingLine,
  RiSpeedUpLine,
  RiSplitCellsHorizontal,
  RiStarLine,
  RiStopFill,
  RiTaskLine,
  RiTerminalBoxLine,
  RiTerminalLine,
  RiTextWrap,
  RiTimeLine,
  RiToolsLine,
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";

type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: string | number | undefined;
  strokeWidth?: string | number | undefined;
  absoluteStrokeWidth?: boolean | undefined;
  primaryColor?: string | undefined;
  secondaryColor?: string | undefined;
  disableSecondaryOpacity?: boolean | undefined;
};

export type LucideIcon = FC<SVGProps<SVGSVGElement>>;

function createIcon(Component: RemixiconComponentType): LucideIcon {
  return function Icon({
    color,
    children: _children,
    fill,
    height,
    primaryColor,
    size,
    strokeWidth: _strokeWidth,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    secondaryColor: _secondaryColor,
    disableSecondaryOpacity: _disableSecondaryOpacity,
    width,
    ...props
  }: AppIconProps) {
    const resolvedColor = color ?? primaryColor ?? fill;
    const resolvedSize = size ?? width ?? height;

    return (
      <Component
        {...props}
        {...(resolvedColor === undefined ? {} : { color: resolvedColor })}
        {...(resolvedSize === undefined ? {} : { size: resolvedSize })}
      />
    );
  };
}

export const ArchiveIcon = createIcon(RiArchiveLine);
export const ArchiveX = createIcon(RiArchive2Line);
export const ArrowDownIcon = createIcon(RiArrowDownLine);
export const ArrowLeftIcon = createIcon(RiArrowLeftSLine);
export const ArrowUpLineIcon = createIcon(RiArrowUpLine);
export const ArrowUpDownIcon = createIcon(RiArrowUpDownLine);
export const ArrowUpIcon = createIcon(RiArrowUpSLine);
export const BardIcon = createIcon(RiBardLine);
export const BotIcon = createIcon(RiRobot2Line);
export const BrainIcon = createIcon(RiBrainLine);
export const BugIcon = createIcon(RiBugLine);
export const CheckIcon = createIcon(RiCheckLine);
export const ChevronDownIcon = createIcon(RiArrowDownSLine);
export const ChevronLeftIcon = createIcon(RiArrowLeftSLine);
export const ChevronRightIcon = createIcon(RiArrowRightSLine);
export const ChevronUpIcon = createIcon(RiArrowUpSLine);
export const ChevronsUpDownIcon = createIcon(RiExpandUpDownLine);
export const CircleAlertIcon = createIcon(RiAlertLine);
export const CircleCheckIcon = createIcon(RiCheckboxCircleLine);
export const Clock3Icon = createIcon(RiTimeLine);
export const CloudIcon = createIcon(RiCloudLine);
export const CloudUploadIcon = createIcon(RiCloudLine);
export const Columns2Icon = createIcon(RiLayoutColumnLine);
export const CopyIcon = createIcon(RiFileLine);
export const CornerLeftUpIcon = createIcon(RiCornerUpLeftLine);
export const DiffIcon = createIcon(RiGitPullRequestLine);
export const DownloadIcon = createIcon(RiDownloadLine);
export const EllipsisIcon = createIcon(RiMoreLine);
export const EyeIcon = createIcon(RiEyeLine);
export const FileIcon = createIcon(RiFileLine);
export const FlashlightIcon = createIcon(RiFlashlightLine);
export const FlaskConicalIcon = createIcon(RiFlaskLine);
export const FolderClosedIcon = createIcon(RiFolderLine);
export const FolderGit2Icon = createIcon(RiGitBranchLine);
export const FolderGitIcon = createIcon(RiGitBranchLine);
export const FolderIcon = createIcon(RiFolderLine);
export const FolderPlusIcon = createIcon(RiFolderAddLine);
export const GitCommitIcon = createIcon(RiGitCommitLine);
export const GitPullRequestIcon = createIcon(RiGitPullRequestLine);
export const GlobeIcon = createIcon(RiGlobalLine);
export const HammerIcon = createIcon(RiHammerLine);
export const InfoIcon = createIcon(RiInformationLine);
export const Link2Icon = createIcon(RiLinkM);
export const ListChecksIcon = createIcon(RiListCheck3);
export const ListTodoIcon = createIcon(RiTaskLine);
export const Loader2Icon = createIcon(RiLoader4Line);
export const LoaderCircleIcon = createIcon(RiLoader4Line);
export const LoaderIcon = createIcon(RiLoader4Line);
export const LockIcon = createIcon(RiLockLine);
export const LockOpenIcon = createIcon(RiLockUnlockLine);
export const MessageSquareIcon = createIcon(RiTerminalBoxLine);
export const MonitorIcon = createIcon(RiComputerLine);
export const PanelLeftCloseIcon = createIcon(RiSidebarFoldLine);
export const PanelLeftIcon = createIcon(RiSideBarLine);
export const PanelRightCloseIcon = createIcon(RiSidebarUnfoldLine);
export const PenLineIcon = createIcon(RiQuillPenLine);
export const PlayIcon = createIcon(RiPlayLine);
export const Plus = createIcon(RiAddLine);
export const PlusIcon = createIcon(RiAddLine);
export const QrCodeIcon = createIcon(RiQrCodeLine);
export const RefreshCwIcon = createIcon(RiRefreshLine);
export const RotateCcwIcon = createIcon(RiArrowGoBackLine);
export const RotateCwIcon = createIcon(RiRestartLine);
export const Rows3Icon = createIcon(RiTextWrap);
export const SearchIcon = createIcon(RiSearchLine);
export const Settings2Icon = createIcon(RiSettings4Line);
export const SettingsIcon = createIcon(RiSettings3Line);
export const SparklesIcon = createIcon(RiSparklingLine);
export const SpeedIcon = createIcon(RiSpeedUpLine);
export const SquarePenIcon = createIcon(RiEditBoxLine);
export const SquareSplitHorizontal = createIcon(RiSplitCellsHorizontal);
export const StarIcon = createIcon(RiStarLine);
export const StopIcon = createIcon(RiStopFill);
export const TerminalIcon = createIcon(RiTerminalLine);
export const TerminalSquare = createIcon(RiTerminalBoxLine);
export const TerminalSquareIcon = createIcon(RiTerminalBoxLine);
export const TextWrapIcon = createIcon(RiTextWrap);
export const Trash2 = createIcon(RiDeleteBinLine);
export const TriangleAlertIcon = createIcon(RiErrorWarningLine);
export const Undo2Icon = createIcon(RiArrowGoBackLine);
export const WrenchIcon = createIcon(RiToolsLine);
export const XIcon = createIcon(RiCloseLine);
export const ZapIcon = createIcon(RiAlertLine);
