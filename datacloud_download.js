const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const { execSync } = require('child_process');


 console.log("process.argv[0]: " + process.argv[0]);
 console.log("process.argv[1]: " + process.argv[1]);
 console.log("process.argv[2]: " + process.argv[2]);
 console.log("process.argv[3]: " + process.argv[3]);
 console.log("process.argv[4]: " + process.argv[4]);

// Check if dataKitName parameter was provided
const dataKitName = process.argv[2];
if (!dataKitName) {
    console.error("Please provide a DataKit name as parameter");
    process.exit(1);
}

const instanceUrl = process.argv[3];
if (!instanceUrl) {
    console.error("Please provide a instanceUrl as parameter");
    process.exit(1);
}

const accessToken = process.argv[4];
if (!accessToken) {
    console.error("Please provide a accessToken as parameter");
    process.exit(1);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const downloadPath = path.resolve("./downloads");
const parentPath = path.resolve("../");

// Helper: Clear downloads folder
function clearDownloadsFolder() {
    if (fs.existsSync(downloadPath)) {
        fs.readdirSync(downloadPath).forEach(file => {
            const filePath = path.join(downloadPath, file);
            fs.unlinkSync(filePath);
        });
        console.log("🗑️ Downloads folder cleared");
    }
}

// Helper: Wait for `package.xml` to finish downloading
function waitForDownload(downloadPath, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();

        const interval = setInterval(() => {
            const files = fs.readdirSync(downloadPath);
            const downloading = files.find(f => f.endsWith(".crdownload"));
            const finished = files.find(f => f === "package.xml");

            if (finished && !downloading) {
                clearInterval(interval);
                resolve(finished);
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                reject(new Error("❌ Download did not complete in time."));
            }
        }, 500);
    });
}

(async () => {  
    console.log("🚀 Launching browser...");

    // Clear downloads folder first
    clearDownloadsFolder();

    // Make sure download folder exists
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath);
    }

    const browser = await puppeteer.launch({
    headless: "new",
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    userDataDir: "./userDataDir",
    defaultViewport: { width: 1516, height: 699 }
  });

    const page = await browser.newPage();

    try {
        // Allow downloads to a specific folder
        const client = await page.target().createCDPSession();
        await client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloadPath
        });

        console.log("🔗 Authenticating via frontdoor...");
        // Use frontdoor.jsp for authentication
        const frontdoorUrl = `${instanceUrl}/secur/frontdoor.jsp?sid=${accessToken}`;
        await page.goto(frontdoorUrl);
        await wait(2000);

        // Navigate to the DataKit page after authentication
        console.log("🔄 Navigating to DataKit page...");
        const dataKitUrl = `${instanceUrl}/lightning/setup/CdpPackageKits/${dataKitName}/view`;
        await page.goto(dataKitUrl);
        
        console.log("🕒 Waiting for page to load...");
        await wait(5000); // Reduced wait time since we're already authenticated

        console.log("📦 Waiting for Download Manifest button...");
        await page.waitForSelector('::-p-aria("Download Manifest")', {
            visible: true,
            timeout: 60000
        });

        const downloadButton = await page.$('::-p-aria("Download Manifest")');
        if (!downloadButton) throw new Error("❌ Could not find the Download Manifest button.");

        console.log("⬇️ Clicking Download Manifest...");
        await downloadButton.click();

        console.log("📁 Waiting for package.xml to download...");
        const downloadedFile = await waitForDownload(downloadPath, 30000);
        console.log(`✅ Download complete: ${downloadedFile}`);

    } catch (error) {
        console.error("🚨 Error during automation:", error.message);
        await page.screenshot({ path: "error-screen.png" });
        console.log("📸 Screenshot saved to error-screen.png");
    } finally {
        console.log("🧼 Closing browser...");
        await browser.close();
    }
})();
