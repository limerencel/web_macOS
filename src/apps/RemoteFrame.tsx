import type { AppWindowProps } from './registry';

export default function RemoteFrame({ payload }: AppWindowProps) {
  const url = typeof payload?.url === 'string' ? payload.url : '';
  const name = typeof payload?.name === 'string' ? payload.name : 'Remote application';
  if (!url) return <div className="p-5 text-sm text-neutral-500">No application URL was provided.</div>;
  return (
    <div className="h-full bg-white dark:bg-neutral-950" data-testid="remote-frame">
      <iframe
        src={url}
        title={name}
        className="w-full h-full border-0"
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-downloads"
      />
    </div>
  );
}
