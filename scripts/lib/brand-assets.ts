export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "assets/prod/black-macos-1024.png",
  productionLinuxIconPng: "assets/prod/black-universal-1024.png",
  productionWindowsIconIco: "assets/prod/spool-black-windows.ico",
  productionWebFaviconIco: "assets/prod/spool-black-web-favicon.ico",
  productionWebFavicon16Png: "assets/prod/spool-black-web-favicon-16x16.png",
  productionWebFavicon32Png: "assets/prod/spool-black-web-favicon-32x32.png",
  productionWebAppleTouchIconPng: "assets/prod/spool-black-web-apple-touch-180.png",
  productionWebPwa192Png: "assets/prod/spool-black-pwa-192x192.png",
  productionWebPwa512Png: "assets/prod/spool-black-pwa-512x512.png",
  productionWebMaskableIcon512Png: "assets/prod/spool-black-maskable-icon-512x512.png",

  nightlyMacIconPng: "assets/nightly/blueprint-macos-1024.png",
  nightlyLinuxIconPng: "assets/nightly/blueprint-universal-1024.png",
  nightlyWindowsIconIco: "assets/nightly/blueprint-windows.ico",

  developmentDesktopIconPng: "assets/dev/blueprint-macos-1024.png",
  developmentWindowsIconIco: "assets/dev/blueprint-windows.ico",
  developmentWebFaviconIco: "assets/dev/blueprint-web-favicon.ico",
  developmentWebFavicon16Png: "assets/dev/blueprint-web-favicon-16x16.png",
  developmentWebFavicon32Png: "assets/dev/blueprint-web-favicon-32x32.png",
  developmentWebAppleTouchIconPng: "assets/dev/blueprint-web-apple-touch-180.png",
} as const;

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

export const DEVELOPMENT_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];

export const PUBLISH_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebPwa192Png,
    targetRelativePath: "dist/client/pwa-192x192.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebPwa512Png,
    targetRelativePath: "dist/client/pwa-512x512.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebMaskableIcon512Png,
    targetRelativePath: "dist/client/maskable-icon-512x512.png",
  },
];
