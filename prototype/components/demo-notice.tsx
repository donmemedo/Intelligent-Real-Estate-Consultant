import { FlaskConical } from "lucide-react";

export function DemoNotice() {
  return (
    <div className="demo-notice" role="note">
      <FlaskConical size={15} aria-hidden="true" />
      <span>Interactive prototype</span>
      <small>No live connections or customer actions</small>
    </div>
  );
}
