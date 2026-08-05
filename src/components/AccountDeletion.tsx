import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CONFIRMATION_WORD = "USUŃ";

interface AccountDeletionProps {
  email?: string;
}

export default function AccountDeletion({ email }: AccountDeletionProps) {
  const [open, setOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmationText === CONFIRMATION_WORD && acknowledged && !isDeleting;

  const resetState = () => {
    setConfirmationText("");
    setAcknowledged(false);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleDelete = async () => {
    if (!canConfirm) {
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        setError("Nie udało się usunąć konta. Spróbuj ponownie później.");
        setIsDeleting(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Nie udało się usunąć konta. Spróbuj ponownie później.");
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive">Usuń konto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usunąć konto {email ? `(${email})` : ""}?</DialogTitle>
          <DialogDescription>
            Ta operacja jest nieodwracalna. Wszystkie Twoje dane, w tym fiszki, zostaną trwale usunięte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="delete-confirmation-text" className="text-sm font-medium">
              Wpisz &quot;{CONFIRMATION_WORD}&quot;, aby potwierdzić
            </label>
            <input
              id="delete-confirmation-text"
              type="text"
              value={confirmationText}
              onChange={(event) => {
                setConfirmationText(event.target.value);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="delete-acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => {
                setAcknowledged(checked === true);
              }}
              disabled={isDeleting}
            />
            <label htmlFor="delete-acknowledge" className="text-sm">
              Rozumiem, że ta operacja jest nieodwracalna.
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              handleOpenChange(false);
            }}
            disabled={isDeleting}
          >
            Anuluj
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={!canConfirm}>
            {isDeleting ? "Usuwanie…" : "Usuń konto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
