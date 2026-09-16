"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "./ZwirkImmersiveScene.module.css";

type Pointer = {
  x: number;
  y: number;
};

const nodes = [
  { label: "AD INTELLIGENCE", value: "LIVE", className: styles.nodeA },
  { label: "UNIT ECONOMICS", value: "SYNC", className: styles.nodeB },
  { label: "COMPETITIVE SIGNALS", value: "READY", className: styles.nodeC },
  { label: "DECISION ENGINE", value: "ACTIVE", className: styles.nodeD },
];

export default function ZwirkImmersiveScene() {
  const [pointer, setPointer] = useState<Pointer>({ x: 0, y: 0 });

  useEffect(() => {
    let raf = 0;
    let nextX = 0;
    let nextY = 0;

    const onPointerMove = (event: PointerEvent) => {
      nextX = event.clientX / window.innerWidth - 0.5;
      nextY = event.clientY / window.innerHeight - 0.5;

      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setPointer({ x: nextX, y: nextY });
      });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={styles.scene}
      style={
        {
          "--pointer-x": `${pointer.x * 22}deg`,
          "--pointer-y": `${pointer.y * -16}deg`,
          "--glow-x": `${50 + pointer.x * 14}%`,
          "--glow-y": `${38 + pointer.y * 10}%`,
        } as CSSProperties
      }
    >
      <div className={styles.noise} />
      <div className={styles.aurora} />
      <div className={styles.grid} />

      <div className={styles.stage}>
        <div className={styles.halo} />
        <div className={`${styles.orbit} ${styles.orbitOne}`} />
        <div className={`${styles.orbit} ${styles.orbitTwo}`} />
        <div className={`${styles.orbit} ${styles.orbitThree}`} />

        <div className={styles.core}>
          <div className={styles.coreInner}>
            <div className={styles.coreGlyph}>Z</div>
            <div className={styles.coreTitle}>ZWIRK</div>
            <div className={styles.coreMeta}>
              LIVE DECISION ENGINE
            </div>
          </div>
          <div className={styles.scanLine} />
        </div>

        {nodes.map((node) => (
          <div className={`${styles.node} ${node.className}`} key={node.label}>
            <span className={styles.nodeDot} />
            <span className={styles.nodeLabel}>{node.label}</span>
            <strong>{node.value}</strong>
          </div>
        ))}

        <div className={styles.telemetry}>
          <span>CONTEXT GRAPH</span>
          <i />
          <span>STREAMING</span>
          <b>●</b>
          <span>NOISE FILTERED</span>
        </div>
      </div>
    </div>
  );
}

