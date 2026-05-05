import playwright from 'playwright';

const browser = await playwright.chromium.connect({ wsEndpoint: 'ws://localhost:9222' });
const context = browser.contexts()[0];
const page = context.pages()[0];

// Get all frames
const frames = page.frames();
console.log(`Total frames: ${frames.length}`);

// Try to find and click View 4 in each frame
for (const frame of frames) {
  try {
    const view4 = await frame.$('button:text("View 4")').catch(() => null);
    if (view4) {
      console.log('Found View 4 button, clicking...');
      await frame.click('button:text("View 4")');
      console.log('View 4 clicked successfully');
      break;
    }
  } catch (e) {
    // Try next frame
  }
}

await browser.close();
