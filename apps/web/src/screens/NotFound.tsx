import { Link } from "react-router-dom";

export function NotFound({ message = "This page does not exist." }: { message?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16" role="alert">
      <h1 className="text-4xl font-bold tracking-[-0.03em]">Not found</h1>
      <p className="mt-3 text-mist">{message}</p>
      <Link className="btn-primary mt-6 inline-flex items-center no-underline" to="/"><span className="relative z-10">Back to auctions</span></Link>
    </div>
  );
}
