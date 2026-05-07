// Auto-update state hook. Subscribes to UpdateEvents from the main
// process and exposes a single rolling state the App can render.
//
// The state is intentionally a flat union — the banner doesn't care
// about history, just the latest status.

import { useEffect, useState } from "react";
import type { UpdateEvent } from "@shared/ipc/events";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; currentVersion: string }
  | {
      kind: "available";
      version: string;
      releaseUrl: string;
      canAutoInstall: boolean;
    }
  | { kind: "downloading"; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

export function useUpdates(): {
  state: UpdateState;
  install: () => void;
  checkAgain: () => void;
} {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    const unsub = window.samson.onUpdate((ev: UpdateEvent) => {
      switch (ev.type) {
        case "checking":
          setState({ kind: "checking" });
          break;
        case "current":
          setState({ kind: "current", currentVersion: ev.currentVersion });
          break;
        case "available":
          setState({
            kind: "available",
            version: ev.version,
            releaseUrl: ev.releaseUrl,
            canAutoInstall: ev.canAutoInstall,
          });
          break;
        case "downloading":
          setState({ kind: "downloading", percent: ev.percent });
          break;
        case "ready":
          setState({ kind: "ready", version: ev.version });
          break;
        case "error":
          setState({ kind: "error", message: ev.message });
          break;
      }
    });
    return unsub;
  }, []);

  const install = (): void => {
    void window.samson.installUpdate();
  };

  const checkAgain = (): void => {
    void window.samson.checkForUpdates();
  };

  return { state, install, checkAgain };
}
