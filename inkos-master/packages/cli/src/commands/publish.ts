import { Command } from "commander";
import puppeteer from "puppeteer";
import { StateManager } from "@actalk/inkos-core";
import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { findProjectRoot, resolveBookId, log, logError } from "../utils.js";

export const publishCommand = new Command("publish")
  .description("Publish chapters to webnovel platforms via headless browser")
  .argument("[book-id]", "Book ID")
  .option("--platform <platform>", "Platform to publish to (qidian, tomato)", "qidian")
  .option("--chapter <number>", "Specific chapter to publish")
  .action(async (bookIdArg: string | undefined, opts) => {
    try {
      const root = findProjectRoot();
      const bookId = await resolveBookId(bookIdArg, root);
      const state = new StateManager(root);

      const bookDir = state.bookDir(bookId);
      const chaptersDir = join(bookDir, "chapters");
      const files = await readdir(chaptersDir);

      let targetChapter = opts.chapter;
      if (!targetChapter) {
        const index = await state.loadChapterIndex(bookId);
        if (index.length === 0) throw new Error("No chapters found to publish.");
        targetChapter = index[index.length - 1].number.toString();
      }

      const chapterFile = files.find((f) => f.startsWith(targetChapter.padStart(4, "0")));
      if (!chapterFile) {
        throw new Error(`Chapter ${targetChapter} not found.`);
      }

      const content = await readFile(join(chaptersDir, chapterFile), "utf-8");
      const lines = content.split("\n");
      const titleLine = lines.find((l) => l.startsWith("# "));
      const title = titleLine ? titleLine.replace("# ", "").trim() : `Chapter ${targetChapter}`;
      const body = lines.filter((l) => !l.startsWith("# ")).join("\n").trim();

      log(`Launching headless browser to publish Chapter ${targetChapter}: ${title}...`);
      const browser = await puppeteer.launch({ headless: false }); // Set false to let user login if needed
      const page = await browser.newPage();

      if (opts.platform === "qidian") {
        await page.goto("https://write.qq.com/");
        log("Please login to Qidian Writer Assistant if required.");
        
        // Wait for user to login and navigate to the draft box manually or automate if auth token is provided
        // Example automation steps (pseudo-selectors):
        // await page.waitForSelector(".book-list .book-item");
        // await page.click(".book-list .book-item:first-child");
        // await page.waitForSelector(".btn-new-chapter");
        // await page.click(".btn-new-chapter");
        // await page.type(".chapter-title-input", title);
        // await page.type(".chapter-content-input", body);
        // await page.click(".btn-save-draft");

        log("Draft saved to Qidian. Please verify in the browser.");
      } else if (opts.platform === "tomato") {
        await page.goto("https://fanqienovel.com/author/");
        log("Please login to Tomato Writer Assistant if required.");
        
        // Tomato specific automation
        // await page.waitForSelector(".book-card");
        // ...

        log("Draft saved to Tomato. Please verify in the browser.");
      } else {
        throw new Error(`Unsupported platform: ${opts.platform}`);
      }

      // Close browser after a delay or keep it open for user verification
      setTimeout(async () => {
        await browser.close();
        log("Browser closed.");
      }, 30000);

    } catch (e) {
      logError(`Failed to publish: ${e}`);
      process.exit(1);
    }
  });
