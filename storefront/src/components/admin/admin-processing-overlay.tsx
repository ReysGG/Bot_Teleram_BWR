"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle } from "lucide-react";

export function AdminProcessingOverlay({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Dialog.Root modal open>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-processing-backdrop" />
        <Dialog.Content
          className="admin-processing-card"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <LoaderCircle aria-hidden="true" className="admin-processing-spinner" size={34} />
          <div aria-live="assertive">
            <Dialog.Title asChild>
              <strong>{title}</strong>
            </Dialog.Title>
            <Dialog.Description asChild>
              <p>{description}</p>
            </Dialog.Description>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
