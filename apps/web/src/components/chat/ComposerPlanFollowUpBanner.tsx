import { memo } from "react";
import { Badge } from "../ui/badge";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <div className="px-3 py-3 sm:px-3 sm:py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="success"
          size="sm"
          className="h-5 min-w-5 rounded-full px-1.5 text-xs uppercase tracking-wide sm:h-5 sm:min-w-5"
        >
          Plan ready
        </Badge>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{planTitle}</span>
        ) : null}
      </div>
      {/* <div className="mt-2 text-xs text-muted-foreground">
        Review the plan
      </div> */}
    </div>
  );
});
