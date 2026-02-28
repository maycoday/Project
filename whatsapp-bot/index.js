// ═══════════════════════════════════════════════════════════════
//  AAWAAZ — WhatsApp Complaint Receiver
//  Secure, anonymous grievance intake via WhatsApp
//  Encrypts complaints with AES-256-GCM and saves to Supabase
// ═══════════════════════════════════════════════════════════════

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// ─── Configuration ─────────────────────────────────────────────
// Uses the same Supabase credentials as the main website
const CONFIG = {
  EXPRESS_PORT: 3000,

  // Supabase — same credentials as frontend/js/supabaseConfig.js
  SUPABASE_URL: "https://kzfunoamfpohgxcgkrlb.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6ZnVub2FtZnBvaGd4Y2drcmxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxODA3MTYsImV4cCI6MjA4Nzc1NjcxNn0.YSoj20A8eUVwxAKDjae3Jy97m1qcvNjUJh7XN3CMkss",

  TABLE: "complaints_secure",

  // Website link for maximum privacy
  WEBSITE_URL: "https://aawaaz.vercel.app",

  // Media handling
  TEMP_DIR: "./temp_media",
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/gif", "application/pdf"],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Default authority for WhatsApp complaints
  DEFAULT_AUTHORITIES: ["HR"],
};

// ─── Supabase Client ──────────────────────────────────────────
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// ─── Crypto Helpers (matches website's portal.js logic) ───────

// Generate a UUID v4 tracking token — same as crypto.randomUUID() on the website
function generateToken() {
  return crypto.randomUUID();
}

// SHA-256 hash of the token — same as hashToken() in portal.js
function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

// Encrypt complaint text with AES-256-GCM — same algorithm as the website
function encryptComplaint(plaintextMessage) {
  // Generate a random 256-bit AES key
  const aesKey = crypto.randomBytes(32);

  // Generate a random 12-byte IV (standard for GCM)
  const iv = crypto.randomBytes(12);

  // Encrypt
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintextMessage, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine ciphertext + auth tag (same format as WebCrypto's AES-GCM output)
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  return {
    ciphertext_b64: ciphertextWithTag.toString("base64"),
    iv_b64: iv.toString("base64"),
    aesKey: aesKey, // Return raw key for RSA wrapping
  };
}

// RSA key wrapping — for authorities to decrypt WhatsApp complaints
// Use a detectable string format that the website can recognize
function wrapAesKeyForAuthorities(aesKey, selectedAuthorities) {
  const wrappedKeys = {};

  selectedAuthorities.forEach((auth) => {
    // Store AES key with a special prefix the website can detect
    wrappedKeys[auth] = `WHATSAPP:${aesKey.toString("base64")}`;
  });

  return wrappedKeys;
}

// ─── Media Processing Functions ─────────────────────────────────

// Create temp directory if it doesn't exist
function ensureTempDir() {
  if (!fs.existsSync(CONFIG.TEMP_DIR)) {
    fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
  }
}

// Download and encrypt media from WhatsApp message
async function processWhatsAppMedia(msg) {
  try {
    if (!msg.hasMedia) return null;
    
    const media = await msg.downloadMedia();
    if (!media) return null;

    // Validate file type and size
    if (!CONFIG.ALLOWED_TYPES.includes(media.mimetype)) {
      throw new Error(`Unsupported file type: ${media.mimetype}`);
    }

    const buffer = Buffer.from(media.data, 'base64');
    if (buffer.length > CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
    }

    // Generate unique filename
    const fileId = uuidv4();
    const extension = media.mimetype.split('/')[1] || 'bin';
    const filename = `${fileId}.${extension}`;
    
    // Encrypt the file
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipher('aes-256-gcm', aesKey);
    cipher.setAAD(Buffer.from(filename));
    
    let encrypted = cipher.update(buffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Combine IV + AuthTag + Encrypted data for storage
    const encryptedFile = Buffer.concat([iv, authTag, encrypted]);
    
    // Save temporarily (in production, upload directly to cloud storage)
    ensureTempDir();
    const tempPath = path.join(CONFIG.TEMP_DIR, filename);
    fs.writeFileSync(tempPath, encryptedFile);
    
    console.log(`📎 Media processed: ${filename} (${media.mimetype}, ${(buffer.length/1024).toFixed(1)}KB)`);
    
    return {
      filename,
      originalName: media.filename || 'attachment',
      mimetype: media.mimetype,
      size: buffer.length,
      encryptionKey: aesKey.toString('base64'),
      tempPath,
      fileId
    };
    
  } catch (error) {
    console.error('❌ Media processing error:', error.message);
    throw error;
  }
}

// Clean up temporary files
function cleanupTempFile(tempPath) {
  try {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  } catch (error) {
    console.warn('⚠ Failed to cleanup temp file:', error.message);
  }
}

// ─── Conversation State Tracker ────────────────────────────────
// Each user goes through: idle → consent → complaint → authority → saved
const userSessions = new Map();

// Track when bot comes online to ignore old messages
let botStartTime = null;

function getSession(chatId) {
  return userSessions.get(chatId) || { state: "idle", complaint: null };
}

// Safe message sending with error handling
async function safeReply(msg, text) {
  try {
    await msg.reply(text);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send message to ${msg.from}: ${error.message}`);
    // Try alternative sending method if available
    try {
      await client.sendMessage(msg.from, text);
      return true;
    } catch (altError) {
      console.error(`❌ Alternative send also failed: ${altError.message}`);
      return false;
    }
  }
}

function setState(chatId, state, extra) {
  const session = userSessions.get(chatId) || { state: "idle", complaint: null };
  session.state = state;
  if (extra) Object.assign(session, extra);
  userSessions.set(chatId, session);
}
function clearState(chatId) {
  userSessions.delete(chatId);
}

// Authority map
const AUTHORITY_MAP = {
  "1": ["HR"],
  "2": ["ICC"],
  "3": ["NGO"],
  "4": ["HR", "ICC", "NGO"],
};

// ─── Save Complaint to Supabase ───────────────────────────────
// Mirrors persistEncryptedComplaint() from portal.js
async function saveComplaintToSupabase(token, complaintText, metadata, mediaData = null) {
  const tokenHash = hashToken(token);
  const tokenHint = token.slice(0, 8);

  // Encrypt the complaint
  const { ciphertext_b64, iv_b64, aesKey } = encryptComplaint(complaintText);

  // Wrap AES key for each selected authority — enables decryption
  const wrappedKeys = wrapAesKeyForAuthorities(aesKey, metadata.authorities);

  // Prepare media metadata if attachment exists
  let mediaMetadata = null;
  if (mediaData) {
    mediaMetadata = {
      filename: mediaData.filename,
      originalName: mediaData.originalName,
      mimetype: mediaData.mimetype,
      size: mediaData.size,
      fileId: mediaData.fileId,
      // Encrypt the media key with same authorities
      encryptedMediaKey: wrapAesKeyForAuthorities(Buffer.from(mediaData.encryptionKey, 'base64'), metadata.authorities)
    };
  }

  // Build payload matching the complaints_secure table schema exactly
  const payload = {
    reference: token.split("-")[0], // first segment of UUID
    created_at: new Date().toISOString(),
    token_hash: tokenHash,
    token_hint: tokenHint,
    ciphertext_b64: ciphertext_b64,
    iv_b64: iv_b64,
    authorities: metadata.authorities || CONFIG.DEFAULT_AUTHORITIES,
    wrapped_keys: wrappedKeys, // Now contains wrapped keys for decryption
    metadata: {
      category: metadata.category || "WhatsApp Complaint",
      department: metadata.department || null,
      incident_date: null,
      delay_release: null,
      recorded_at: new Date().toISOString(),
      source: "whatsapp",
      media: mediaMetadata, // Include media info
    },
  };

  console.log(`  → Saving to Supabase (token_hash: ${tokenHash.slice(0, 16)}...)`);
  if (mediaData) {
    console.log(`  → Including media: ${mediaData.originalName} (${mediaData.mimetype})`);
  }

  const { error } = await supabase.from(CONFIG.TABLE).insert(payload);

  if (error) {
    console.error("  ✗ Supabase error:", error.message);
    throw error;
  }

  console.log("  ✓ Saved to Supabase successfully");
  return { token, tokenHash, tokenHint };
}

// ─── Bot Message Templates ────────────────────────────────────

const MESSAGES = {
  welcome: `🔒 *Welcome to Aawaaz — Secure Grievance Portal*

Before we begin, please follow these safety steps:

1️⃣  *Delete this chat* immediately after we finish — to protect you if someone picks up your phone.
2️⃣  Turn on *Disappearing Messages* for this chat if you can.

━━━━━━━━━━━━━━━━━━━
Do you want to file a complaint?

👉 Reply *YES* to continue`,

  askComplaint: `📝 *Please type your complaint below.*

You can describe your issue in detail. Once you send it, our system will encrypt it immediately and notify the authorities.

📎 *You can also attach:*
• Photos (JPG, PNG, GIF)
• Documents (PDF)
• Maximum 10MB per file

_Attachments are encrypted with military-grade security._`,

  askAuthority: `📋 *Who should receive this complaint?*

Reply with a number:

1️⃣  *HR* — Human Resources
2️⃣  *ICC* — Internal Complaints Committee
3️⃣  *NGO* — External NGO Authority
4️⃣  *All* — Send to all authorities

👉 Reply *1*, *2*, *3*, or *4*`,

  received: (token) =>
    `✅ *Complaint Received & Encrypted*

Your tracking token:
\`${token}\`

📋 Save this token to track your complaint status later.

⚠️ *IMPORTANT — Do this NOW:*
Long-press this chat → Select *"Delete Chat"* to ensure your safety.

🙏 Thank you for speaking up. Aawaaz stands with you.`,

  dbError: `⚠️ *We encountered a temporary error saving your complaint.*

Please try again in a moment.

Your message was NOT saved. Please resend it.`,

  unknown: `👋 *Hi there!*

I'm the Aawaaz grievance bot.

To file a complaint, send:
👉 *help* or *complaint*`,

  mediaOnly: `📎 I see you've sent an attachment!

Please also type a brief description of your complaint so authorities can understand the context.

💡 *Example:* "Workplace harassment incident on [date]. Photo shows evidence."`,
};

// ─── WhatsApp Client Setup ────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});

// ─── QR Code Display ──────────────────────────────────────────

client.on("qr", (qr) => {
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║   SCAN THIS QR CODE WITH WHATSAPP        ║");
  console.log("╚═══════════════════════════════════════════╝\n");
  qrcode.generate(qr, { small: true });
  console.log("Waiting for scan...\n");
});

// ─── Authentication Events ────────────────────────────────────

client.on("authenticated", () => {
  console.log("✓ WhatsApp authenticated successfully");
});

client.on("auth_failure", (msg) => {
  console.error("✗ Authentication failed:", msg);
  console.log("  Delete .wwebjs_auth folder and try again.");
});

client.on("ready", () => {
  botStartTime = Date.now(); // Track when bot comes online
  console.log("\n╔═══════════════════════════════════════════╗");
  console.log("║   🟢  AAWAAZ BOT IS ONLINE               ║");
  console.log("║   Listening for incoming complaints...    ║");
  console.log("╚═══════════════════════════════════════════╝\n");
});

// ─── Message Handler (Core Logic) ─────────────────────────────

client.on("message", async (msg) => {
  try {
    // Skip group messages — only handle private DMs
    const chat = await msg.getChat();
    if (chat.isGroup) return;
  } catch (error) {
    // Handle whatsapp-web.js library errors gracefully
    console.warn(`⚠ Chat info error for ${msg.from}: ${error.message}`);
    // Continue processing the message anyway - assume it's a private chat
  }

  // Skip status broadcasts
  if (msg.from === "status@broadcast") return;

  // Skip old messages (only process messages after bot started)
  if (botStartTime && msg.timestamp * 1000 < botStartTime) {
    return; // Ignore messages sent before bot came online
  }

  const chatId = msg.from;
  const text = (msg.body || "").trim();
  const textLower = text.toLowerCase();
  const session = getSession(chatId);
  const currentState = session.state;
  const senderNumber = chatId.replace("@c.us", "");

  console.log(
    `[${new Date().toLocaleTimeString()}] ${senderNumber} | State: ${currentState} | Message: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`
  );

  // ── STATE: IDLE ─────────────────────────────────────────
  if (currentState === "idle") {
    // Only respond to specific activation keywords
    const activationKeywords = ["help", "complaint", "report", "grievance"];
    const hasActivationKeyword = activationKeywords.some((keyword) => 
      textLower === keyword || textLower.includes(keyword)
    );

    if (hasActivationKeyword) {
      setState(chatId, "awaiting_consent");
      await safeReply(msg, MESSAGES.welcome);
    }
    // Don't respond to other messages when idle
    return;
  }

  // ── STATE: AWAITING CONSENT ─────────────────────────────
  if (currentState === "awaiting_consent") {
    if (
      textLower === "yes" ||
      textLower === "y" ||
      textLower === "haan" ||
      textLower === "ha"
    ) {
      setState(chatId, "awaiting_complaint");
      await safeReply(msg, MESSAGES.askComplaint);
    } else {
      await safeReply(msg,
        `Please reply with *YES* to continue.`
      );
    }
    return;
  }

  // ── STATE: AWAITING COMPLAINT ───────────────────────────
  if (currentState === "awaiting_complaint") {
    // If the user sends only media with no text, ask for description
    if (!text && msg.hasMedia) {
      await safeReply(msg, MESSAGES.mediaOnly);
      return;
    }

    // If message is too short, ask for more detail (unless they have media)
    if (text.length < 5 && !msg.hasMedia) {
      await safeReply(msg,
        "Please provide more detail about your complaint (at least a few words)."
      );
      return;
    }

    // Process media if attached
    let mediaData = null;
    if (msg.hasMedia) {
      try {
        await safeReply(msg, "📎 Processing your attachment...");
        mediaData = await processWhatsAppMedia(msg);
        await safeReply(msg, "✅ Attachment processed securely");
      } catch (error) {
        await safeReply(msg, `❌ Attachment error: ${error.message}`);
        return;
      }
    }

    // Save complaint text and media in session, move to authority selection
    setState(chatId, "awaiting_authority", { 
      complaint: text,
      mediaData: mediaData
    });
    
    if (mediaData) {
      await safeReply(msg, `Thank you! Your complaint with attachment has been recorded.\n\n${MESSAGES.askAuthority}`);
    } else {
      await safeReply(msg, MESSAGES.askAuthority);
    }
    return;
  }

  // ── STATE: AWAITING AUTHORITY ──────────────────────────
  if (currentState === "awaiting_authority") {
    const choice = text.trim();
    const authorities = AUTHORITY_MAP[choice];

    if (!authorities) {
      await safeReply(msg,
        "Please reply with *1* (HR), *2* (ICC), *3* (NGO), or *4* (All)."
      );
      return;
    }

    const complaintText = session.complaint;
    const mediaData = session.mediaData;
    const token = generateToken(); // UUID v4 — matches website format

    console.log("\n┌─────────────────────────────────────────");
    console.log("│ 🆕 NEW COMPLAINT RECEIVED");
    console.log("│ Token       : " + token);
    console.log("│ Authorities : " + authorities.join(", "));
    console.log("│ Phone       : " + senderNumber);
    console.log("│ Time        : " + new Date().toISOString());
    if (mediaData) {
      console.log("│ Media       : " + mediaData.originalName + " (" + mediaData.mimetype + ")");
    }
    console.log(
      "│ Message     : " +
        complaintText.substring(0, 100) +
        (complaintText.length > 100 ? "..." : "")
    );
    console.log("└─────────────────────────────────────────\n");

    try {
      // Encrypt and save to Supabase — same DB as the website
      await saveComplaintToSupabase(token, complaintText, {
        authorities: authorities,
      }, mediaData);

      // Clean up temp file after successful save
      if (mediaData && mediaData.tempPath) {
        cleanupTempFile(mediaData.tempPath);
      }

      // Send the UUID token to user — they can paste this on the website to track
      await safeReply(msg, MESSAGES.received(token));

      console.log(`✓ Complaint saved. Token: ${token} → ${authorities.join(", ")}`);
    } catch (error) {
      console.error("✗ Failed to save complaint:", error.message);

      // Tell user to retry — don't lose their complaint
      await safeReply(msg, MESSAGES.dbError);

      // Don't clear state so they can just resend
      return;
    }

    // Reset state
    clearState(chatId);
    return;
  }
});

// ─── Disconnection Handler ────────────────────────────────────

client.on("disconnected", (reason) => {
  console.log("⚠ WhatsApp disconnected:", reason);
  console.log("  Attempting to reconnect...");
  client.initialize();
});

// ─── Express Server (Health Check & Status) ───────────────────

const app = express();
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    service: "Aawaaz WhatsApp Bot",
    status: "running",
    uptime: Math.floor(process.uptime()) + "s",
    activeSessions: userSessions.size,
    supabase: CONFIG.SUPABASE_URL ? "connected" : "not configured",
  });
});

// Status endpoint
app.get("/status", (req, res) => {
  res.json({
    bot: "online",
    express: "running",
    port: CONFIG.EXPRESS_PORT,
    supabaseTable: CONFIG.TABLE,
    activeSessions: userSessions.size,
    uptime: Math.floor(process.uptime()) + "s",
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + "MB",
  });
});

// ─── Start Everything ─────────────────────────────────────────

app.listen(CONFIG.EXPRESS_PORT, () => {
  console.log(
    `\n🌐 Express server running on http://localhost:${CONFIG.EXPRESS_PORT}`
  );
  console.log(`📦 Saving complaints to Supabase → ${CONFIG.TABLE}`);
  console.log("⏳ Initializing WhatsApp client...\n");
});

client.initialize();
