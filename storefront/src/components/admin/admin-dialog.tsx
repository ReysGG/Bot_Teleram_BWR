"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

type AdminDialogLayer = "default" | "nested" | "processing" | "result";

export function AdminDialog({
  children,
  className = "",
  description,
  dismissable = true,
  eyebrow,
  icon,
  layer = "default",
  onOpenChange,
  open,
  showClose = true,
  title,
  trigger,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  dismissable?: boolean;
  eyebrow?: string;
  icon?: ReactNode;
  layer?: AdminDialogLayer;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  showClose?: boolean;
  title: ReactNode;
  trigger?: ReactElement;
}) {
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !dismissable) return;
    onOpenChange(nextOpen);
  }

  return (
    <Dialog.Root modal open={open} onOpenChange={handleOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay
          className={`admin-modal-backdrop admin-dialog-overlay admin-dialog-layer-${layer}`}
        />
        <Dialog.Content
          className={`admin-modal admin-dialog-content admin-dialog-layer-${layer} ${className}`.trim()}
          onEscapeKeyDown={(event) => {
            if (!dismissable) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!dismissable) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissable) event.preventDefault();
          }}
        >
          {icon}
          <div className="admin-modal-heading">
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {description ?? "Dialog administrasi toko."}
              </Dialog.Description>
            </div>
            {showClose ? (
              <Dialog.Close asChild>
                <button
                  aria-label="Tutup modal"
                  className="modal-close"
                  disabled={!dismissable}
                  type="button"
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </Dialog.Close>
            ) : null}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
