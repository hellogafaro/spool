import { describe, expect, it } from "vitest";

import { clearThreadPanelSearchParams, parseDiffRouteSearch } from "./diffRouteSearch";

describe("parseDiffRouteSearch", () => {
  it("parses valid diff search values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      panel: "diff",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats numeric and boolean diff toggles as open", () => {
    expect(
      parseDiffRouteSearch({
        diff: 1,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      panel: "diff",
      diffTurnId: "turn-1",
    });

    expect(
      parseDiffRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      panel: "diff",
      diffTurnId: "turn-1",
    });
  });

  it("parses plan panel search values", () => {
    expect(parseDiffRouteSearch({ plan: "1" })).toEqual({ panel: "tasks" });
    expect(parseDiffRouteSearch({ plan: true })).toEqual({ panel: "tasks" });
    expect(parseDiffRouteSearch({ tasks: "1" })).toEqual({ panel: "tasks" });
    expect(parseDiffRouteSearch({ tasks: true })).toEqual({ panel: "tasks" });
    expect(parseDiffRouteSearch({ tasks: "0" })).toEqual({});
  });

  it("parses shared panel values", () => {
    expect(parseDiffRouteSearch({ panel: "tasks" })).toEqual({ panel: "tasks" });
    expect(parseDiffRouteSearch({ panel: "diff" })).toEqual({ panel: "diff" });
    expect(parseDiffRouteSearch({ panel: "files" })).toEqual({ panel: "files" });
    expect(parseDiffRouteSearch({ panel: "unknown" })).toEqual({});
  });

  it("drops turn and file values when diff is closed", () => {
    const parsed = parseDiffRouteSearch({
      diff: "0",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({});
  });

  it("drops file value when turn is not selected", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      panel: "diff",
    });
  });

  it("normalizes whitespace-only values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "  ",
      diffFilePath: "  ",
    });

    expect(parsed).toEqual({ panel: "diff" });
  });
});

describe("clearThreadPanelSearchParams", () => {
  it("clears retained panel values explicitly", () => {
    expect(
      clearThreadPanelSearchParams({
        panel: "diff",
        diff: "1",
        plan: "1",
        tasks: "1",
        diffTurnId: "turn-1",
        diffFilePath: "src/app.ts",
        keep: "value",
      }),
    ).toEqual({
      keep: "value",
      panel: undefined,
      diff: undefined,
      plan: undefined,
      tasks: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });
});
