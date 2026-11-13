/**
 * openPath (a double-click on a part) must scroll the tree to the part.
 *
 * The tree adds rows lazily, as they scroll into view: an expanded node that was never in
 * view has no rows for its children yet. These tests lay the rows out (happy-dom does no
 * layout) and scroll smoothly as a browser does: to where scrollTo was told to go, with
 * scroll events on the way.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { setupTreeView, cleanupTreeView } from "../helpers/treeview-setup.js";

const ROW = 20; // px for each row
const VIEW = 400; // px of the tree in view
const STEPS = 10; // scroll events in one smooth scroll

/** 18 groups of three parts, each followed by a part of its own: an assembly of 18 cartridges. */
function createGroupedTree(groups = 18) {
  const root = {};
  for (let i = 0; i < groups; i++) {
    root[`group${i}`] = { chamber: [1, 1], valve: [1, 1], cap: [1, 1] };
    root[`sleeve${i}`] = [1, 1];
  }
  return { root };
}

let scrollTop = 0;
const laidOut = [
  "offsetTop",
  "offsetHeight",
  "clientHeight",
  "scrollHeight",
  "scrollTop",
  "getBoundingClientRect",
  "scrollTo",
];
const saved = {};

function isContainer(el) {
  return el.id === "tree-scroll-container";
}

function shown(el) {
  for (let p = el; p && !isContainer(p); p = p.parentElement) {
    if (p.style && p.style.display === "none") return false;
  }
  return true;
}

/** Every row in view or out of it, top to bottom. */
function rows(container) {
  return Array.from(container.querySelectorAll(".tv-node-content")).filter(
    shown,
  );
}

function container(el) {
  return el.closest("#tree-scroll-container");
}

function ownRow(el) {
  return el.classList.contains("tv-node-content")
    ? el
    : Array.from(el.children).find((c) =>
        c.classList.contains("tv-node-content"),
      );
}

function layOut() {
  scrollTop = 0;
  const proto = HTMLElement.prototype;
  for (const name of laidOut)
    saved[name] = Object.getOwnPropertyDescriptor(proto, name);
  const maxScroll = (c) => Math.max(0, rows(c).length * ROW - VIEW);
  const getters = {
    offsetTop() {
      const c = container(this);
      return !c || isContainer(this) ? 0 : rows(c).indexOf(ownRow(this)) * ROW;
    },
    offsetHeight() {
      if (isContainer(this)) return VIEW;
      return shown(this) ? rows(this).length * ROW : 0; // its own row and its children's
    },
    clientHeight() {
      return isContainer(this) ? VIEW : this.offsetHeight;
    },
    scrollHeight() {
      return isContainer(this)
        ? Math.max(VIEW, rows(this).length * ROW)
        : this.offsetHeight;
    },
  };
  for (const [name, get] of Object.entries(getters)) {
    Object.defineProperty(proto, name, { get, configurable: true });
  }
  Object.defineProperty(proto, "scrollTop", {
    get() {
      return isContainer(this) ? scrollTop : 0;
    },
    set(value) {
      if (isContainer(this))
        scrollTop = Math.max(0, Math.min(value, maxScroll(this)));
    },
    configurable: true,
  });
  Object.defineProperty(proto, "getBoundingClientRect", {
    value() {
      const top = isContainer(this) ? 0 : this.offsetTop - scrollTop;
      const height = isContainer(this)
        ? VIEW
        : shown(this)
          ? this.offsetHeight
          : 0;
      return {
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 250,
        width: 250,
        x: 0,
        y: top,
      };
    },
    configurable: true,
    writable: true,
  });
  // A smooth scroll keeps the destination it was given, and the page reacts to each step.
  Object.defineProperty(proto, "scrollTo", {
    value({ top }) {
      const start = scrollTop;
      for (let i = 1; i <= STEPS; i++) {
        this.scrollTop = start + ((top - start) * i) / STEPS;
        this.dispatchEvent(new Event("scroll"));
      }
    },
    configurable: true,
    writable: true,
  });
}

function restore() {
  const proto = HTMLElement.prototype;
  for (const name of laidOut) {
    if (saved[name]) Object.defineProperty(proto, name, saved[name]);
    else delete proto[name];
  }
}

/** Where the row of `path` is in view: 0 at the top, VIEW at the bottom. */
function inView(ctx, path) {
  return ctx.treeView.getDomNode(path).getBoundingClientRect();
}

describe("TreeView - openPath scrolls to the part", () => {
  let ctx;

  beforeEach(() => {
    layOut();
    ctx = setupTreeView(createGroupedTree());
    ctx.treeView.expandAll();
  });

  afterEach(() => {
    cleanupTreeView(ctx);
    restore();
  });

  test("the expanded groups below the view have no rows yet", () => {
    // Opening the tree adds rows for the groups in view at first: 0 to 9 here.
    const withRows = Array.from({ length: 18 }, (_, i) => i).filter((i) =>
      ctx.container.querySelector(`[data-path="/root/group${i}/cap"]`),
    );
    expect(withRows).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("a part far down the tree ends in view", () => {
    ctx.treeView.openPath("/root/group14/cap");
    const row = inView(ctx, "/root/group14/cap");
    expect(row.top).toBeGreaterThanOrEqual(0);
    expect(row.bottom).toBeLessThanOrEqual(VIEW);
  });

  test("a part below the groups shown so far ends in the middle of the view", () => {
    ctx.treeView.openPath("/root/group12/valve");
    const row = inView(ctx, "/root/group12/valve");
    expect(Math.abs(row.top + ROW / 2 - VIEW / 2)).toBeLessThanOrEqual(ROW);
  });

  test("a part after scrolling back up ends in the middle of the view", () => {
    ctx.treeView.openPath("/root/group15/valve");
    ctx.treeView.openPath("/root/group2/chamber");
    const row = inView(ctx, "/root/group2/chamber");
    expect(Math.abs(row.top + ROW / 2 - VIEW / 2)).toBeLessThanOrEqual(ROW);
  });
});
