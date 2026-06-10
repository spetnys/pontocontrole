import { ProtectedShell } from "@/components/workspace/protected-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
