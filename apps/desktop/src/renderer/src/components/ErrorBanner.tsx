/**
 * Single visible sink for failures raised anywhere in the research shell.
 *
 * Before this existed, failures from research CRUD, model switching and
 * attachments were stored in state that nothing rendered, so a broken action
 * looked like a dead button.
 */
export function ErrorBanner({
  message,
  onDismiss
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="global-error" role="alert">
      <span className="global-error-text">{message}</span>
      <button
        type="button"
        className="global-error-close"
        aria-label="关闭提示"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
