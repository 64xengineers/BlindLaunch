import { Bubble, Hush, PrimaryLink } from "../components/ui";

export function NotFound({ message = "This page doesn't exist, or the launch link is wrong." }: { message?: string }) {
  return (
    <div className="hm-wrap">
      <div className="panel panel-lg hm-nf rise" role="alert">
        <div className="hm-nf-hush">
          <span className="hm-nf-says shout" aria-hidden="true">Wrong door</span>
          <span className="hush-wrap inline-block"><Hush pose="error" size={190} /></span>
        </div>
        <div>
          <span className="label !text-coral">Error 404</span>
          <h1 className="hm-h1 mt-2">Nothing here</h1>
          <Bubble className="mt-6 max-w-[30em]">{message}</Bubble>
          <PrimaryLink to="/" icon="chevron-right" className="mt-9 min-w-[320px]">Back to launches</PrimaryLink>
        </div>
      </div>
    </div>
  );
}
