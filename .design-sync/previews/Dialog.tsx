import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "arcade";

// Overlay component: rendered open (defaultOpen) inside a single full-card so the
// portaled popup is captured. modal={false} avoids scroll-locking the harness.
export function CashOut() {
  return (
    <div
      className="dark"
      style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100%", position: "relative" }}
    >
      <style>{`html,body{background:var(--bg);margin:0}`}</style>
      <Dialog defaultOpen modal={false}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Cash out 12 🧅?</DialogTitle>
            <DialogDescription>
              Your onions will be sent to your OnionDAO wallet. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button>Confirm cash-out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
