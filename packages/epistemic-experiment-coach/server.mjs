import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/server/app.mjs";

const port = Number(process.env.PORT || 8787);
const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");

createApp({ staticDir }).listen(port, () => console.log(`Coach API listening on http://localhost:${port}`));
