import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to detect VPN/Tor usage for privacy indicator.
 * Uses WebRTC leak detection + Tor exit node API check.
 */
export function usePrivacyStatus() {
  const [status, setStatus] = useState('checking'); // 'secure' | 'warning' | 'danger' | 'checking'
  const [isVPN, setIsVPN] = useState(false);
  const [isTor, setIsTor] = useState(false);
  const [localIP, setLocalIP] = useState(null);

  const checkPrivacy = useCallback(async () => {
    try {
      // 1. Check for Tor via exit node API
      const torCheck = await fetch('https://check.torproject.org/api/ip', {
        signal: AbortSignal.timeout(5000),
      }).then(r => r.json()).catch(() => ({ IsTor: false }));

      if (torCheck.IsTor) {
        setIsTor(true);
        setStatus('secure');
        return;
      }

      // 2. WebRTC leak detection
      const hasWebRTCLeak = await detectWebRTCLeak();
      
      if (hasWebRTCLeak) {
        setStatus('warning');
      } else {
        setIsVPN(true); // Heuristic: no leak might indicate VPN
        setStatus('secure');
      }
    } catch {
      setStatus('warning');
    }
  }, []);

  useEffect(() => {
    checkPrivacy();
  }, [checkPrivacy]);

  return { status, isVPN, isTor, localIP, recheck: checkPrivacy };
}

/**
 * Detect WebRTC IP leak
 * @returns {Promise<boolean>} true if leak detected
 */
async function detectWebRTCLeak() {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      let leaked = false;
      const timeout = setTimeout(() => {
        pc.close();
        resolve(leaked);
      }, 3000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateStr = event.candidate.candidate;
          // Check for local/private IP patterns
          const ipMatch = candidateStr.match(/(\d{1,3}\.){3}\d{1,3}/);
          if (ipMatch) {
            const ip = ipMatch[0];
            const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
            if (!isPrivate) {
              leaked = true;
            }
          }
        }
      };

      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    } catch {
      resolve(false);
    }
  });
}
