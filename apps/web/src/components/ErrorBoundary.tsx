import { Component, type ReactNode } from "react";

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-16" role="alert">
        <h1 className="text-3xl font-bold">Something went wrong on this page.</h1>
        <p className="mt-3 break-words text-mist">{this.state.error.message}</p>
        <a className="btn-primary mt-6 inline-flex items-center no-underline" href="/"><span className="relative z-10">Back to auctions</span></a>
      </div>
    );
  }
}
