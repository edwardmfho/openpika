import { ComponentRegistry, initializeDefaultCatalog } from "@a2ui/react";
import { FilePreview } from "./FilePreview";
import { ImageGrid } from "./ImageGrid";
import { PdfViewer } from "./PdfViewer";

export function registerOpenPikaCatalog(): void {
  initializeDefaultCatalog();

  const registry = ComponentRegistry.getInstance();
  registry.register("FilePreview", { component: FilePreview as never });
  registry.register("ImageGrid", { component: ImageGrid as never });
  registry.register("PdfViewer", { component: PdfViewer as never });
}
