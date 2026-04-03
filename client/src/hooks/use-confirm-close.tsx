import { useState, useRef, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function useConfirmClose() {
  const [isDirty, setDirtyState] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    setDirtyState(dirty);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean, onClose: () => void) => {
      if (open) return;
      if (isDirty) {
        pendingCloseRef.current = onClose;
        setShowConfirm(true);
      } else {
        onClose();
      }
    },
    [isDirty]
  );

  const confirmClose = useCallback(() => {
    setShowConfirm(false);
    setDirtyState(false);
    pendingCloseRef.current?.();
    pendingCloseRef.current = null;
  }, []);

  const cancelClose = useCallback(() => {
    setShowConfirm(false);
    pendingCloseRef.current = null;
  }, []);

  const ConfirmCloseDialog = (
    <AlertDialog open={showConfirm} onOpenChange={(open) => { if (!open) cancelClose(); }}>
      <AlertDialogContent data-testid="confirm-close-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Hai modifiche non salvate</AlertDialogTitle>
          <AlertDialogDescription>
            Vuoi uscire senza salvare?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelClose} data-testid="button-continue-editing">
            Continua a modificare
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmClose} data-testid="button-exit-without-saving">
            Esci senza salvare
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { isDirty, setDirty, handleOpenChange, ConfirmCloseDialog };
}
