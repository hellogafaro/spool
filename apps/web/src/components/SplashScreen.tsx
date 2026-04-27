import { TrunkLogo } from "./ui/trunk-logo";

export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex size-24 items-center justify-center" aria-label="Trunk splash screen">
        <TrunkLogo className="size-16 text-black dark:text-white" />
      </div>
    </div>
  );
}
