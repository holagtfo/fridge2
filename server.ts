import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "node:child_process";
import http from "node:http";
import { analyzeHandler } from "./api/analyze.js";
import { generateImageHandler } from "./api/generate-image.js";

function openBrowser(url: string) {
  const platform = process.platform;
  try {
    if (platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    console.warn("Could not open the browser automatically; open the URL above manually.");
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3000;
const PORT_ATTEMPTS = 25;

function tryListenHttp(
  server: http.Server,
  port: number,
  attemptsLeft: number
): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    if (attemptsLeft <= 0) {
      reject(
        new Error(
          `No free port found after ${PORT_ATTEMPTS} tries. Close the other app using this port or set PORT in the environment (e.g. PORT=3001).`
        )
      );
      return;
    }

    const onError = (err: NodeJS.ErrnoException) => {
      server.off("error", onError);
      if (err.code === "EADDRINUSE") {
        console.warn(`Port ${port} is already in use, trying ${port + 1}...`);
        server.close(() => {
          resolve(tryListenHttp(server, port + 1, attemptsLeft - 1));
        });
        return;
      }
      reject(err);
    };

    server.once("error", onError);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", onError);
      resolve({ port });
    });
  });
}

async function startServer() {
  // Vite resolves the project from cwd by default; if you run `npm run dev` from
  // another directory, the app would be blank. Always use this folder (where server.ts lives).
  process.chdir(__dirname);

  const app = express();
  const preferred =
    Number(process.env.PORT) > 0 ? Number(process.env.PORT) : DEFAULT_PORT;

  // Middleware
  app.use(express.json({ limit: "50mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/analyze", analyzeHandler);
  app.post("/api/generate-image", generateImageHandler);

  const httpServer = http.createServer(app);

  // Vite middleware for development — must share this HTTP server for HMR WebSockets.
  // Otherwise Vite defaults to a separate port (24678); if that fails or mismatches the app
  // port, the browser can stay blank while /@vite/client breaks.
  if (process.env.NODE_ENV !== "production") {
    const hmrEnabled = process.env.DISABLE_HMR !== "true";
    const vite = await createViteServer({
      root: __dirname,
      envDir: __dirname,
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const { port: actualPort } = await tryListenHttp(httpServer, preferred, PORT_ATTEMPTS);
  const url = `http://localhost:${actualPort}`;
  console.log(`Server running on ${url}`);
  if (actualPort !== preferred) {
    console.log(
      `(Port ${preferred} was busy — use the URL above, not http://localhost:${preferred})`
    );
  }
  const isDev = process.env.NODE_ENV !== "production";
  const skipOpen = process.env.OPEN_BROWSER === "0" || process.env.OPEN_BROWSER === "false";
  if (isDev && !skipOpen) {
    openBrowser(url);
  }
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
