export default function PageShell({ title, description, toolbar, children }) {
  return (
    <div className="page-shell admin-fade-in">
      {(title || description) && (
        <header className="page-header">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </header>
      )}
      {toolbar && <div className="page-toolbar">{toolbar}</div>}
      <div className="page-body">{children}</div>
    </div>
  );
}
