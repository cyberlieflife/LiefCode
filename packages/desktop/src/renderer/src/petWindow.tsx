import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PetDesktopPet, PetDesktopStatus } from "@zcode/shared";
import { DesktopPetView, type DesktopPetWindowBridge } from "@/pet/desktopEntry.js";
import type { DesktopPetSnapshot } from "../../preload/petWindow.js";

interface PetWindowBridge extends DesktopPetWindowBridge {
  getSnapshot(): Promise<DesktopPetSnapshot | null>;
  onPet(callback: (pet: PetDesktopPet | null) => void): () => void;
  onStatus(callback: (status: PetDesktopStatus) => void): () => void;
}

declare global {
  interface Window {
    zcodePet?: PetWindowBridge;
  }
}

const bridge = window.zcodePet;

function PetWindowApp() {
  const [pet, setPet] = useState<PetDesktopPet | null>(null);
  const [status, setStatus] = useState<PetDesktopStatus | null>(null);

  useEffect(() => {
    if (!bridge) return;
    const offPet = bridge.onPet(setPet);
    const offStatus = bridge.onStatus(setStatus);
    // 先订阅再取快照：快照返回前的更新不会被覆盖。
    void bridge.getSnapshot().then((snapshot) => {
      if (!snapshot) return;
      setPet((current) => current ?? snapshot.pet);
      setStatus((current) => current ?? snapshot.status);
    });
    return () => {
      offPet();
      offStatus();
    };
  }, []);

  if (!bridge || !pet || !status) return null;
  return <DesktopPetView pet={pet} status={status} bridge={bridge} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PetWindowApp />
  </StrictMode>,
);
