import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { trapTab } from "../src/components/wallet";
import { ListProblem, listView, scanReach } from "../src/screens/MyBids";

const account = "0x00000000000000000000000000000000000000c5";

describe("listView (My bids, My launches)", () => {
  const base = { account, ready: true, loading: false, error: null, count: undefined };

  it("says the load failed instead of showing an empty page", () => {
    expect(listView({ ...base, error: "HTTP request failed." })).toBe("error");
  });

  it("shows loading while the first load, or a retry, is still running", () => {
    expect(listView({ ...base, loading: true })).toBe("loading");
    expect(listView({ ...base, loading: true, error: "HTTP request failed." })).toBe("loading");
  });

  it("says the app is not on this network instead of loading forever", () => {
    expect(listView({ ...base, ready: false, loading: true })).toBe("offline");
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(listView({ ...base, account: null, error: "HTTP request failed." })).toBe("signIn");
  });

  it("keeps showing loaded rows when a later refresh fails", () => {
    expect(listView({ ...base, count: 0 })).toBe("empty");
    expect(listView({ ...base, count: 2, error: "HTTP request failed." })).toBe("list");
  });

  it("renders the failure as an alert with a Try again button", () => {
    const html = renderToStaticMarkup(createElement(ListProblem, { view: "error", what: "your bids", error: "HTTP request failed.", onRetry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t load your bids. HTTP request failed.");
    expect(html).toContain("Try again");
  });
});

describe("scanReach (My launches)", () => {
  it("knows when the newest pages hold every launch", () => {
    expect(scanReach(1n, 5)).toEqual({ scanned: 0, all: true });
    expect(scanReach(4n, 5)).toEqual({ scanned: 3, all: true });
    expect(scanReach(101n, 5)).toEqual({ scanned: 100, all: true });
  });

  it("knows when older launches were not looked at, so it never says nothing was launched", () => {
    expect(scanReach(102n, 5)).toEqual({ scanned: 100, all: false });
    expect(scanReach(250n, 10)).toEqual({ scanned: 200, all: false });
    expect(scanReach(250n, 15)).toEqual({ scanned: 249, all: true });
  });
});

describe("trapTab (sign-in modal)", () => {
  const items = ["close", "passkey", "create", "wallet"];

  it("wraps Tab from the last item to the first, and Shift+Tab from the first to the last", () => {
    expect(trapTab(items, "wallet", "dialog", true, false)).toBe("close");
    expect(trapTab(items, "close", "dialog", true, true)).toBe("wallet");
    expect(trapTab(items, "dialog", "dialog", true, true)).toBe("wallet");
  });

  it("lets the browser move focus between items inside", () => {
    expect(trapTab(items, "passkey", "dialog", true, false)).toBeNull();
    expect(trapTab(items, "create", "dialog", true, true)).toBeNull();
  });

  it("pulls focus back in when it fell out, as when a sign-in starts and its button goes away", () => {
    const waiting = ["close"];
    expect(trapTab(waiting, "body", "dialog", false, false)).toBe("close");
    expect(trapTab(waiting, "body", "dialog", false, true)).toBe("close");
    expect(trapTab(items, "body", "dialog", false, false)).toBe("close");
    expect(trapTab(items, "body", "dialog", false, true)).toBe("wallet");
  });

  it("keeps focus on the dialog when nothing inside can take it", () => {
    expect(trapTab([], "body", "dialog", false, false)).toBe("dialog");
  });
});
