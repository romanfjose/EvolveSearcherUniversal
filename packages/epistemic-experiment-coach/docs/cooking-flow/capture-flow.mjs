import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

async function shot(name) {
  await page.screenshot({ path: path.join(here, `${name}.png`), fullPage: true });
}

async function waitUntilReady() {
  await page.waitForFunction(() => !document.body.innerText.match(/Finding a useful angle|Creating your next options|Building the simple plan|Thinking…/));
}

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await shot("01-welcome");

const problem = "I want to learn to cook a few simple dinners, but recipes quickly feel overwhelming. I want a gentle starting point—not pressure to make something impressive.";
await page.locator("textarea").fill(problem);
await shot("02-honest-start");
await page.getByRole("button", { name: /Help me understand it/ }).click();
await waitUntilReady();
await page.getByRole("heading", { name: "What sounds most like you?" }).waitFor();
await shot("03-possible-angles");

await page.getByPlaceholder("Write your own reason…").fill("Too many steps and decisions overwhelm me");
await page.getByRole("button", { name: "Use this" }).click();
await page.getByRole("heading", { name: "Too many steps and decisions overwhelm me" }).waitFor();
await shot("04-working-hypothesis");

const boundary = "I learn best at my own pace. Please remember that and don't push me to improve quickly when you suggest the challenge.";
await page.getByLabel("Ask the coach").fill(boundary);
await page.getByRole("button", { name: "Ask" }).click();
await waitUntilReady();
await page.getByText(boundary, { exact: true }).waitFor();
await shot("05-pace-and-boundary");

await page.getByRole("button", { name: "Give me a reality challenge" }).click();
await waitUntilReady();
await page.getByRole("heading", { name: "Choose the version you would actually do" }).waitFor();
await shot("06-challenge-options");

await page.getByPlaceholder("Cook milanesas with instant mash…").fill("Make one simple scrambled egg");
await page.getByRole("button", { name: "Build my plan" }).click();
await waitUntilReady();
await page.getByText("Minimum success:", { exact: true }).waitFor();
await shot("07-tiny-experiment-plan");

const checks = page.locator('.ee-check input[type="checkbox"]');
if (await checks.count()) {
  await checks.nth(0).check();
  if ((await checks.count()) > 1) await checks.nth(1).check();
}
await shot("08-progress-in-action");

await page.getByRole("button", { name: /I tried it/ }).click();
await page.getByRole("heading", { name: "How did it go?" }).waitFor();
await shot("09-one-question-debrief");

await page.getByRole("button", { name: "Done—it was easier than expected" }).click();
await page.getByRole("heading", { name: "That counts as progress." }).waitFor();
await shot("10-learning-captured");

await browser.close();
