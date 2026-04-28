import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const pathOnly = req.originalUrl.split("?", 1)[0];
    if (pathOnly === "/api" || pathOnly.startsWith("/api/")) {
      return res.status(404).json({ message: "Route API non trovata" });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
