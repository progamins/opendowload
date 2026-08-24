import { Router } from "express";
import {
  analyzeBatchController,
  analyzeController,
  cancelDownloadController,
  clearDownloadsController,
  deleteDownloadController,
  downloadController,
  downloadFileController,
  getDownloadController,
  getSettingsController,
  listDownloadsController,
  openFolderController,
  openFolderDialogController,
  putSettingsController,
  systemStatusController,
  systemVersionsController,
} from "./controllers/controllers.js";
import { progressBus } from "./services/events.js";

export const router = Router();

router.post("/analyze", analyzeController);
router.post("/analyze/batch", analyzeBatchController);
router.post("/download", downloadController);
router.post("/dialog/open-folder", openFolderDialogController);
router.get("/downloads", listDownloadsController);
router.get("/downloads/:id", getDownloadController);
router.get("/downloads/:id/file", downloadFileController);
router.get("/downloads/:id/folder", openFolderController);
router.post("/downloads/:id/cancel", cancelDownloadController);
router.delete("/downloads/:id", deleteDownloadController);
router.delete("/downloads", clearDownloadsController);
router.get("/settings", getSettingsController);
router.put("/settings", putSettingsController);
router.get("/system/status", systemStatusController);
router.get("/system/versions", systemVersionsController);

// Server-Sent Events stream for real-time download progress.
router.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const onProgress = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  progressBus.on("progress", onProgress);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    progressBus.off("progress", onProgress);
  });
});
