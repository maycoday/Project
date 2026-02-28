import { create } from 'zustand';
import { MerkleTree } from '@lib/merkle/merkleTree';

/**
 * Complaint processing store
 * Manages encryption state, authority selection, and submission flow
 */
export const useComplaintStore = create((set, get) => ({
  // Complaint state
  plaintext: '',
  ciphertext: null,
  iv: null,
  sessionKey: null,
  trackingToken: null,
  tokenHash: null,
  complaintHash: null,
  
  // Authority selection
  selectedAuthorities: [],
  wrappedKeys: {},
  
  // Submission state
  isEncrypting: false,
  isSubmitting: false,
  isSubmitted: false,
  submissionResult: null,
  
  // Merkle tree for integrity
  merkleTree: new MerkleTree(),
  merkleRoot: null,

  // Actions
  setPlaintext: (text) => set({ plaintext: text }),
  
  toggleAuthority: (code) => set(state => {
    const selected = state.selectedAuthorities.includes(code)
      ? state.selectedAuthorities.filter(a => a !== code)
      : [...state.selectedAuthorities, code];
    return { selectedAuthorities: selected };
  }),

  setEncryptionResult: ({ ciphertext, iv, sessionKey, complaintHash }) => set({
    ciphertext,
    iv,
    sessionKey,
    complaintHash,
    isEncrypting: false,
  }),

  setWrappedKey: (authority, wrappedKey) => set(state => ({
    wrappedKeys: { ...state.wrappedKeys, [authority]: wrappedKey },
  })),

  setTrackingToken: (token, hash) => set({
    trackingToken: token,
    tokenHash: hash,
  }),

  setSubmitting: (val) => set({ isSubmitting: val }),
  
  setSubmissionResult: (result) => set({
    isSubmitted: true,
    isSubmitting: false,
    submissionResult: result,
  }),

  reset: () => set({
    plaintext: '',
    ciphertext: null,
    iv: null,
    sessionKey: null,
    trackingToken: null,
    tokenHash: null,
    complaintHash: null,
    selectedAuthorities: [],
    wrappedKeys: {},
    isEncrypting: false,
    isSubmitting: false,
    isSubmitted: false,
    submissionResult: null,
  }),
}));
