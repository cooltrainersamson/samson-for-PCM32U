import { useEffect, useRef, type JSX } from "react";
import { C, FONT_MONO } from "../tokens";
import type { WireEntry } from "../useRun";

export function WireLog({
  entries,
  maxHeight = 300,
}: {
  entries: readonly WireEntry[];
  maxHeight?: number;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      ref={ref}
      style={{
        background: "#05070a",
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        fontFamily: FONT_MONO,
        fontSize: 11,
        lineHeight: 1.5,
        padding: 10,
        maxHeight,
        overflowY: "auto",
        color: C.textMed,
      }}
    >
      {entries.length === 0 && (
        <div style={{ color: C.textDim, fontStyle: "italic" }}>
          Wire traffic will appear here when the run starts.
        </div>
      )}
      {entries.map((e, i) => {
        const color =
          e.direction === "tx"
            ? C.orange
            : e.direction === "rx"
              ? C.tiffany
              : C.textDim;
        const stamp = new Date(e.ts).toISOString().slice(11, 23);
        return (
          <div key={i}>
            <span style={{ color: C.textDim }}>{stamp}</span>{" "}
            <span style={{ color, fontWeight: 600 }}>
              {e.direction.toUpperCase().padEnd(4)}
            </span>{" "}
            <span style={{ color: C.text }}>{e.payload}</span>
          </div>
        );
      })}
    </div>
  );
}
