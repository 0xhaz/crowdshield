export function HeaderBox({
  title,
  subtext,
  user,
  actions,
}: {
  title: string;
  subtext?: string;
  user?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="header-box">
        <h1 className="header-box-title">
          {title}
          {user && <span className="text-brand">&nbsp;{user}</span>}
        </h1>
        {subtext && <p className="header-box-subtext">{subtext}</p>}
      </div>
      {actions}
    </div>
  );
}
