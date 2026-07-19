import { Card, PageHeader } from "@/components/ui";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="w-full">
        <PageHeader
          title="You're offline"
          description="Naeem & Sons Portal needs a connection for live stock and documents."
        />
        <Card>
          <p className="text-sm text-[var(--ink-muted)]">
            Reconnect to continue receiving, picking, and posting. Install the app from
            your browser menu for quicker access on the warehouse phone.
          </p>
        </Card>
      </div>
    </main>
  );
}
