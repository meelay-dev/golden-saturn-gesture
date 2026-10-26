// Pure gesture policies emit target values and one-shot events; they own no camera or GPU resources.
import { clamp, distance, midpoint } from "./math.js";

export class Interaction {
  constructor() {
    this.reset();
  }
  reset() {
    this.state = "IDLE";
    this.armed = new Set();
    this.previous = new Map();
    this.lastSeen = -Infinity;
    this.lastBurst = -Infinity;
    this.target = null;
    this.dominantId = null;
  }
  update(hands, time) {
    const events = [];
    const visibleIds = new Set(hands.map((hand) => hand.id));
    for (const id of this.armed)
      if (!visibleIds.has(id) && time - this.lastSeen > 0.55)
        this.armed.delete(id);
    if (!hands.length) {
      const holding = this.target && time - this.lastSeen <= 0.2;
      this.state = holding ? "HOLD" : "IDLE";
      if (!holding && time - this.lastSeen > 0.55) {
        this.armed.clear();
        this.previous.clear();
      }
      return {
        ...(this.target ?? { center: { x: 0.5, y: 0.5 }, scale: 0, tilt: 0 }),
        state: this.state,
        opacity: holding ? this.target.opacity : 0,
        events,
      };
    }
    this.lastSeen = time;
    for (const hand of hands)
      if (hand.gesture === "PINCH") this.armed.add(hand.id);
    const released = hands.find(
      (hand) =>
        hand.gesture === "OPEN" &&
        this.armed.has(hand.id) &&
        this.previous.get(hand.id) !== "OPEN",
    );
    if (released) {
      if (time - this.lastBurst >= 0.75) {
        events.push({ type: "burst", center: released.palm });
        this.lastBurst = time;
      }
      this.armed.delete(released.id);
    }
    const engaged = hands.filter(
      (hand) => hand.gesture === "OPEN" || hand.gesture === "PINCH",
    );
    const both =
      engaged.length === 2 && engaged[0].gesture === engaged[1].gesture;
    let center,
      scale = 0,
      opacity = 0,
      tilt = 0,
      ringVisibility = 0;
    if (both) {
      this.state = "TWO_HANDS";
      center = midpoint(engaged[0].palm, engaged[1].palm);
      scale = clamp(
        distance(engaged[0].palm, engaged[1].palm) * 4.2,
        0.7,
        2.15,
      );
      opacity = 1;
      ringVisibility = 1;
      const ordered = [...engaged].sort((a, b) => a.palm.x - b.palm.x);
      tilt = Math.atan2(
        ordered[1].palm.y - ordered[0].palm.y,
        ordered[1].palm.x - ordered[0].palm.x,
      );
    } else {
      const hand =
        released ??
        hands.find(
          (hand) => hand.id === this.dominantId && hand.gesture === "PINCH",
        ) ??
        hands.find((hand) => hand.gesture === "PINCH") ??
        hands.find((hand) => hand.gesture === "OPEN") ??
        hands.find((hand) => hand.id === this.dominantId) ??
        hands[0];
      this.dominantId = hand.id;
      this.state = hand.gesture;
      center = hand.gesture === "PINCH" ? hand.anchor : hand.palm;
      if (this.state === "PINCH") {
        scale = 0.36;
        opacity = 1;
        ringVisibility = 0.1;
      }
      if (this.state === "OPEN") {
        scale = 0.65;
        opacity = 0.035;
        ringVisibility = 0;
      }
      if (this.state === "FIST") this.armed.delete(hand.id);
    }
    this.previous = new Map(hands.map((hand) => [hand.id, hand.gesture]));
    this.target = { center, scale, opacity, tilt, ringVisibility };
    return { ...this.target, state: this.state, events };
  }
}

// Reference mode: one stable controlling hand; the other selects colour only.
export class ReferenceInteraction {
  constructor() {
    this.reset();
  }
  reset() {
    this.dominantId = null;
    this.lastSeen = -Infinity;
    this.lastBurst = -Infinity;
    this.releaseAt = -Infinity;
    this.target = null;
    this.previous = "IDLE";
    this.armed = false;
    this.color = "ivory";
  }
  update(hands, time, { side = "auto", mirror = true } = {}) {
    let hand = hands.find((h) => h.id === this.dominantId),
      snap = false;
    if (hand && time - this.lastSeen > 0.55) {
      this.armed = false;
      this.previous = "IDLE";
      this.releaseAt = -Infinity;
      snap = true;
    }
    if (!hand && time - this.lastSeen > 0.35) {
      const ready = (h) => ["PINCH", "ZOOM", "FIST"].includes(h.gesture);
      if (side === "auto")
        hand =
          hands.find((h) => h.gesture === "PINCH" || h.gesture === "ZOOM") ??
          hands.find((h) => h.gesture === "FIST");
      else {
        const screenX = (h) => (mirror ? 1 - h.palm.x : h.palm.x);
        const eligible = hands.filter((h) =>
          side === "left" ? screenX(h) < 0.5 : screenX(h) >= 0.5,
        );
        eligible.sort((a, b) =>
          side === "left" ? screenX(a) - screenX(b) : screenX(b) - screenX(a),
        );
        hand = eligible.find(ready);
      }
      if (hand) {
        this.dominantId = hand.id;
        this.armed = false;
        this.previous = "IDLE";
        this.releaseAt = -Infinity;
        snap = true;
      }
    }
    if (!hand) {
      const holding = this.target && time - this.lastSeen <= 0.2;
      if (time - this.lastSeen > 0.55) {
        this.armed = false;
        this.previous = "IDLE";
      }
      return {
        ...(this.target ?? {
          center: { x: 0.5, y: 0.5 },
          scale: 0,
          tilt: 0,
          ringVisibility: 0,
        }),
        state: holding ? "HOLD" : "IDLE",
        opacity: holding ? this.target.opacity : 0,
        palmGlow: 0,
        events: [],
      };
    }
    this.lastSeen = time;
    const secondary = hands.find((h) => h.id !== hand.id),
      count = secondary?.fingerCount ?? 0;
    if (count >= 1 && count <= 4)
      this.color = ["ivory", "cyan", "violet", "gold"][count - 1];
    let state = hand.gesture,
      center = hand.anchor ?? hand.palm,
      scale = 0.88,
      opacity = 1,
      pitch = 0.08,
      events = [];
    if (state === "FIST") {
      center = hand.gripAnchor ?? hand.anchor ?? hand.palm;
      scale = 0.94;
      this.armed = true;
    } else if (state === "PINCH" || state === "ZOOM") {
      this.armed = true;
      const zoom = clamp(((hand.pinch ?? 0.2) - 0.3) / 1.9, 0, 1);
      scale = 0.88 + Math.pow(zoom, 1.12) * 2.32;
      pitch = 0.08 + zoom * 0.38;
    } else if (state === "OPEN") {
      center = hand.palm;
      opacity = 0;
      if (this.armed && this.previous !== "OPEN") {
        if (time - this.lastBurst >= 0.85) {
          events.push({ type: "burst", center, color: this.color });
          this.lastBurst = time;
          this.releaseAt = time;
        }
        this.armed = false;
      }
    } else {
      // Brief uncertain poses preserve the last coherent object, without inventing a release.
      scale = this.target?.scale ?? 0.88;
      opacity = this.target?.opacity ?? 0;
      center = this.target?.center ?? hand.palm;
      pitch = this.target?.pitch ?? 0.08;
    }
    this.previous = state;
    const palmGlow =
      state === "OPEN" ? Math.exp(-(time - this.releaseAt) * 0.45) * 0.16 : 0;
    this.target = {
      state,
      center,
      scale,
      opacity,
      tilt: clamp(hand.roll ?? 0, -1.1, 1.1),
      pitch,
      ringVisibility: 1,
      handRadius: (hand.palmSize ?? 0.18) * 0.95,
      color: this.color,
      palmGlow,
      primaryId: hand.id,
      secondaryFingers: count,
      snap,
      reference: true,
    };
    return { ...this.target, events };
  }
}
