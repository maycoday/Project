/**
 * Merkle Tree Implementation for Tamper-Evident Logging
 * 
 * Provides cryptographic proof that activity logs have not been
 * tampered with. Each log entry is a leaf node. Tree is rebuilt
 * incrementally as new entries are added.
 * 
 * Structure:
 *          [Root Hash]
 *         /           \
 *    [H(A+B)]      [H(C+D)]
 *    /      \      /      \
 *  [H(A)]  [H(B)] [H(C)]  [H(D)]
 *    |       |      |       |
 *  Log_1   Log_2  Log_3   Log_4
 * 
 * Verification: Any single tampered log changes the root hash.
 */

import { sha256 } from '../crypto/hashUtils';

export class MerkleTree {
  constructor(leaves = []) {
    this.leaves = leaves;
    this.layers = [];
    this.root = null;
  }

  /**
   * Build tree from array of data strings
   * @param {string[]} data - Array of log entries to hash
   */
  async buildFromData(data) {
    // Hash each leaf
    this.leaves = await Promise.all(data.map(d => sha256(d)));
    await this._buildTree();
  }

  /**
   * Add a single leaf and rebuild
   * @param {string} data - New log entry
   */
  async addLeaf(data) {
    const hash = await sha256(data);
    this.leaves.push(hash);
    await this._buildTree();
  }

  /**
   * Build the Merkle tree from leaf hashes
   */
  async _buildTree() {
    if (this.leaves.length === 0) {
      this.root = null;
      this.layers = [];
      return;
    }

    let currentLayer = [...this.leaves];
    this.layers = [currentLayer];

    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        const combined = await sha256(left + right);
        nextLayer.push(combined);
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    this.root = currentLayer[0];
  }

  /**
   * Generate a proof-of-inclusion for a given leaf index
   * @param {number} index - Leaf index
   * @returns {Array<{hash: string, position: 'left'|'right'}>}
   */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) return [];

    const proof = [];
    let currentIndex = index;

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < layer.length) {
        proof.push({
          hash: layer[siblingIndex],
          position: isRight ? 'left' : 'right',
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Verify a proof-of-inclusion
   * @param {string} leafHash - The leaf hash to verify
   * @param {Array} proof - Proof path from getProof()
   * @param {string} expectedRoot - Expected root hash
   * @returns {Promise<boolean>}
   */
  async verifyProof(leafHash, proof, expectedRoot) {
    let current = leafHash;

    for (const { hash, position } of proof) {
      if (position === 'left') {
        current = await sha256(hash + current);
      } else {
        current = await sha256(current + hash);
      }
    }

    return current === expectedRoot;
  }

  /**
   * Get the root hash
   * @returns {string|null}
   */
  getRoot() {
    return this.root;
  }

  /**
   * Get all layers for visualization
   * @returns {string[][]}
   */
  getLayers() {
    return this.layers;
  }

  /**
   * Serialize tree state for storage
   * @returns {object}
   */
  serialize() {
    return {
      leaves: this.leaves,
      root: this.root,
      layerCount: this.layers.length,
      leafCount: this.leaves.length,
    };
  }
}
