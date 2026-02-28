# 📎 Aawaaz Media Attachment Guide

## For Users

### WhatsApp
1. Send "**help**" or "**complaint**" to activate bot
2. Reply "**yes**" to consent
3. **Type your complaint** + optionally **attach photos/PDFs**
4. Choose authority (1-HR, 2-ICC, 3-NGO, 4-All)
5. Receive encrypted tracking token

**Supported Files:**
- 📸 Photos: JPG, PNG, GIF
- 📄 Documents: PDF
- 📏 Max size: 10MB per file
- 🔒 All files encrypted with military-grade security

### Website
1. Visit portal and write complaint
2. **Click "Choose File"** to attach evidence
3. System strips metadata (GPS, timestamps)
4. File encrypted before submission
5. Select authorities and submit

## For Authorities

### Accessing Attachments
1. **Login** to authority portal
2. **Decrypt complaint** with your private key
3. **View attachment** (images show inline, PDFs open)
4. **Download** for evidence preservation

### Technical Details
- Files encrypted with AES-256-GCM
- Keys wrapped separately for each authority
- Source tracking (WhatsApp vs Website)
- Auto-cleanup for security
- No cloud storage exposure

## Security Features

🔐 **End-to-End Encryption**
- Files never stored unencrypted
- Unique keys per complaint
- Authority-specific access control

🔒 **Privacy Protection**
- EXIF metadata stripped
- GPS location removed
- Device info cleared
- Timestamps anonymized

🛡️ **Access Control**
- Only selected authorities can decrypt
- Keys wrapped with RSA public keys
- No shared access between authorities
- Audit trail maintained

## File Flow

```
User Attachment → Client Encryption → Secure Storage → Authority Decryption → Evidence Access
```

### WhatsApp Flow:
Phone → Bot Download → AES Encrypt → Supabase → Authority Portal

### Website Flow:
Browser → Client Encrypt → Database → Authority Portal

Both paths ensure **zero unencrypted exposure** and **maximum privacy protection**.