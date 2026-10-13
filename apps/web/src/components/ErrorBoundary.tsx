import { Component, type ErrorInfo, type ReactNode } from "react";
import { sfx } from "../state/motion";
import { Hush } from "./art";

/**
 * Keeps one broken screen from blanking the whole app (spec 8.11). App gives it `key={pathname}`,
 * so moving to another page clears the error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    sfx("error");
    console.error("Screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center" role="alert">
        <Hush pose="error" size={150} className="error-hush" />
        <h1 className="mt-6 font-sans text-3xl font-bold uppercase">Something broke on this page.</h1>
        <p className="mt-3 text-lg text-muted">Your bids and money are safe on chain. Reload to try again.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <button type="button" className="btn-primary inline-flex items-center" onClick={() => window.location.reload()}>
            <span className="relative z-10">Reload</span>
          </button>
          <a className="label inline-flex min-h-11 items-center !text-cyan underline underline-offset-4" href="/">Back to launches</a>
        </div>
        <details className="mt-8 max-w-full text-left text-sm text-muted">
          <summary className="cursor-pointer">What went wrong</summary>
          <p className="mt-2 break-words font-mono">{this.state.error.message}</p>
        </details>
      </div>
    );
  }
}
