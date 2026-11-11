// Makes the link preview picture (social-card.jpg) that Facebook, LinkedIn,
// Bluesky, X, and Slack show when someone shares the map. It opens the built
// page in Chrome, copies the full map and the logos onto a 1200 by 630 card,
// and saves a screenshot. Chrome comes preinstalled on GitHub's build machines.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CARD_W = 1200, CARD_H = 630;

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome", "/opt/google/chrome/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

// Runs inside the page: builds the card on top of everything else.
function compose({ W, H }) {
  const D = JSON.parse(document.getElementById("storymap-data").textContent);
  const map = document.getElementById("map").cloneNode(true);
  map.removeAttribute("id");
  map.querySelectorAll(".sel").forEach(e => e.classList.remove("sel"));
  map.querySelectorAll(".off").forEach(e => e.classList.remove("off"));
  // Full map, widened or heightened to the card's shape so nothing is cut off.
  let [x, y, w, h] = D.view;
  if (w / h < W / H) { const nw = h * W / H; x -= (nw - w) / 2; w = nw; }
  else { const nh = w * H / W; y -= (nh - h) / 2; h = nh; }
  map.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  map.setAttribute("preserveAspectRatio", "xMidYMid meet");
  map.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

  const card = document.createElement("div");
  card.id = "social-card";
  card.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;background:var(--water);z-index:2147483647;overflow:hidden`;
  card.appendChild(map);

  // Logos: small, bottom right, on a white panel so they read over the map.
  const badge = document.createElement("div");
  badge.style.cssText = "position:absolute;right:24px;bottom:24px;display:flex;align-items:center;gap:16px;background:#ffffff;border:1px solid var(--rule);border-radius:4px;padding:10px 16px";
  const cwp = document.querySelector(".topbar svg.cwp").cloneNode(true);
  cwp.style.cssText = "height:30px;width:auto;display:block";
  badge.appendChild(cwp);
  const partner = document.querySelector(".topbar .partner");
  if (partner) {
    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;height:26px;background:var(--rule)";
    const p = partner.cloneNode(true);
    p.style.cssText = "height:20px;width:auto;max-width:150px;display:block;object-fit:contain";
    badge.append(sep, p);
  }
  card.appendChild(badge);
  document.body.appendChild(card);
}

// Returns true if the card was made, or a reason string if not.
export async function makeSocialCard(outDir, outFile = "social-card.jpg") {
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { return "playwright-core is not installed (run npm install)"; }
  const exe = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!exe) return "Chrome was not found on this computer (set CHROME_PATH to its location)";
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(outDir, "index.html")).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(compose, { W: CARD_W, H: CARD_H });
    await page.waitForTimeout(200);
    await page.locator("#social-card").screenshot({ path: path.join(outDir, outFile), type: "jpeg", quality: 90 });
    return true;
  } catch (e) {
    return e.message.split("\n")[0];
  } finally {
    await browser.close();
  }
}
