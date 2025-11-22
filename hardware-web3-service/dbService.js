import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DBService {
  constructor() {
    this.db = null;
    const defaultPath = process.env.DATABASE_PATH;
    if (defaultPath) {
      this.dbPath = path.resolve(defaultPath);
    } else {
      const dbDir = path.resolve(__dirname, 'database');
      this.dbPath = path.join(dbDir, 'lensmint.db');
    }
  }

  initialize() {
    try {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      
      if (!fs.existsSync(dbDir)) {
        try {
          fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
          console.log(`📁 Created database directory: ${dbDir}`);
        } catch (mkdirError) {
          if (mkdirError.code === 'EACCES') {
            const fallbackDir = path.join(os.homedir(), '.lensmint', 'database');
            this.dbPath = path.join(fallbackDir, 'lensmint.db');
            const fallbackParent = path.dirname(this.dbPath);
            if (!fs.existsSync(fallbackParent)) {
              fs.mkdirSync(fallbackParent, { recursive: true, mode: 0o755 });
            }
            console.log(`⚠️  Permission denied, using fallback path: ${this.dbPath}`);
          } else {
            throw mkdirError;
          }
        }
      }

      // Initialize database (creates file automatically if doesn't exist)
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.createTables();

      console.log(`✅ Database initialized automatically: ${this.dbPath}`);
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        image_hash TEXT UNIQUE NOT NULL,
        camera_id TEXT,
        device_address TEXT,
        status TEXT DEFAULT 'saved',
        filecoin_cid TEXT,
        filecoin_metadata_cid TEXT,
        claim_id TEXT UNIQUE,
        token_id INTEGER,
        tx_hash TEXT,
        recipient_address TEXT,
        signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        uploaded_at DATETIME,
        minted_at DATETIME,
        error_message TEXT
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        claim_id TEXT PRIMARY KEY,
        image_id INTEGER REFERENCES images(id),
        filecoin_cid TEXT,
        status TEXT DEFAULT 'pending',
        recipient_address TEXT,
        tx_hash TEXT,
        token_id INTEGER,
        edition_tx_hash TEXT,
        edition_token_id TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        claimed_at DATETIME,
        completed_at DATETIME
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT UNIQUE NOT NULL,
        token_id INTEGER,
        zk_proof TEXT NOT NULL,
        journal_data_abi TEXT NOT NULL,
        proof_tx_hash TEXT,
        verification_status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME,
        verified_at DATETIME,
        FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
      )
    `);
    
    try {
      this.db.exec(`ALTER TABLE claims ADD COLUMN edition_tx_hash TEXT`);
    } catch (e) {
    }
    try {
      this.db.exec(`ALTER TABLE claims ADD COLUMN edition_token_id TEXT`);
    } catch (e) {
    }
    try {
      this.db.exec(`ALTER TABLE claims ADD COLUMN error_message TEXT`);
    } catch (e) {
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        device_address TEXT PRIMARY KEY,
        device_id TEXT,
        camera_id TEXT,
        public_key TEXT,
        is_registered BOOLEAN DEFAULT 0,
        registered_at DATETIME
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
      CREATE INDEX IF NOT EXISTS idx_images_hash ON images(image_hash);
      CREATE INDEX IF NOT EXISTS idx_images_claim ON images(claim_id);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    `);
  }

  createImage(imageData) {
    const {
      filename,
      filepath,
      image_hash,
      camera_id,
      device_address,
      signature
    } = imageData;

    const stmt = this.db.prepare(`
      INSERT INTO images (filename, filepath, image_hash, camera_id, device_address, signature, status)
      VALUES (?, ?, ?, ?, ?, ?, 'saved')
    `);

    const result = stmt.run(filename, filepath, image_hash, camera_id, device_address, signature);
    return this.getImageById(result.lastInsertRowid);
  }

  getImageById(id) {
    const stmt = this.db.prepare('SELECT * FROM images WHERE id = ?');
    return stmt.get(id) || null;
  }

  /**
   * Get image by hash
   */
  getImageByHash(image_hash) {
    const stmt = this.db.prepare('SELECT * FROM images WHERE image_hash = ?');
    return stmt.get(image_hash) || null;
  }

  updateImageStatus(id, status, additionalData = {}) {
    const updates = ['status = ?'];
    const values = [status];

    if (additionalData.filecoin_cid) {
      updates.push('filecoin_cid = ?');
      values.push(additionalData.filecoin_cid);
    }

    if (additionalData.filecoin_metadata_cid) {
      updates.push('filecoin_metadata_cid = ?');
      values.push(additionalData.filecoin_metadata_cid);
    }

    if (additionalData.claim_id) {
      updates.push('claim_id = ?');
      values.push(additionalData.claim_id);
    }

    if (additionalData.token_id !== undefined) {
      updates.push('token_id = ?');
      values.push(additionalData.token_id);
    }

    if (additionalData.tx_hash) {
      updates.push('tx_hash = ?');
      values.push(additionalData.tx_hash);
    }

    if (additionalData.recipient_address) {
      updates.push('recipient_address = ?');
      values.push(additionalData.recipient_address);
    }

    if (additionalData.error_message) {
      updates.push('error_message = ?');
      values.push(additionalData.error_message);
    }

    if (status === 'uploaded') {
      updates.push('uploaded_at = CURRENT_TIMESTAMP');
    }

    if (status === 'minted') {
      updates.push('minted_at = CURRENT_TIMESTAMP');
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE images
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getImageById(id);
  }

  getImages(status = null, limit = 100) {
    if (status) {
      const stmt = this.db.prepare(`
        SELECT * FROM images
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(status, limit);
    } else {
      const stmt = this.db.prepare(`
        SELECT * FROM images
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    }
  }

  createClaim(claim_id, image_id, filecoin_cid) {
    const stmt = this.db.prepare(`
      INSERT INTO claims (claim_id, image_id, filecoin_cid, status)
      VALUES (?, ?, ?, 'pending')
    `);

    try {
      stmt.run(claim_id, image_id, filecoin_cid);
      return this.getClaim(claim_id);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get claim by ID
   */
  getClaim(claim_id) {
    const stmt = this.db.prepare('SELECT * FROM claims WHERE claim_id = ?');
    return stmt.get(claim_id) || null;
  }

  /**
   * Get all claims (for syncing)
   */
  getAllClaims() {
    const stmt = this.db.prepare('SELECT * FROM claims ORDER BY created_at DESC');
    return stmt.all();
  }

  updateClaim(claim_id, updates) {
    const updateFields = [];
    const values = [];

    if (updates.status) {
      updateFields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.recipient_address) {
      updateFields.push('recipient_address = ?');
      values.push(updates.recipient_address);
    }

    if (updates.tx_hash) {
      updateFields.push('tx_hash = ?');
      values.push(updates.tx_hash);
    }

    if (updates.token_id !== undefined) {
      updateFields.push('token_id = ?');
      values.push(updates.token_id);
    }

    if (updates.status === 'claimed') {
      updateFields.push('claimed_at = CURRENT_TIMESTAMP');
    }

    if (updates.status === 'completed') {
      updateFields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (updateFields.length === 0) {
      return this.getClaim(claim_id);
    }

    values.push(claim_id);

    const stmt = this.db.prepare(`
      UPDATE claims
      SET ${updateFields.join(', ')}
      WHERE claim_id = ?
    `);

    stmt.run(...values);
    return this.getClaim(claim_id);
  }

  cacheDevice(deviceData) {
    const {
      device_address,
      device_id,
      camera_id,
      public_key,
      is_registered
    } = deviceData;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO devices (device_address, device_id, camera_id, public_key, is_registered, registered_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(device_address, device_id, camera_id, public_key, is_registered ? 1 : 0);
    return this.getDevice(device_address);
  }

  getDevice(device_address) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE device_address = ?');
    const device = stmt.get(device_address);
    if (device) {
      device.is_registered = Boolean(device.is_registered);
    }
    return device;
  }

  createProof(claimId, tokenId, zkProof, journalDataAbi) {
    const stmt = this.db.prepare(`
      INSERT INTO proofs (claim_id, token_id, zk_proof, journal_data_abi, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(claimId, tokenId || null, zkProof, journalDataAbi);
    return this.getProof(claimId);
  }

  getProof(claimId) {
    const stmt = this.db.prepare('SELECT * FROM proofs WHERE claim_id = ?');
    return stmt.get(claimId);
  }

  /**
   * Get proof by token ID
   */
  getProofByTokenId(tokenId) {
    const stmt = this.db.prepare('SELECT * FROM proofs WHERE token_id = ?');
    return stmt.get(tokenId);
  }

  updateProof(claimId, updates) {
    const updateFields = [];
    const values = [];

    if (updates.proof_tx_hash) {
      updateFields.push('proof_tx_hash = ?');
      values.push(updates.proof_tx_hash);
    }

    if (updates.verification_status) {
      updateFields.push('verification_status = ?');
      values.push(updates.verification_status);
    }

    if (updates.submitted_at !== undefined) {
      if (updates.submitted_at === true || updates.submitted_at === 'now') {
        updateFields.push('submitted_at = CURRENT_TIMESTAMP');
      } else {
        updateFields.push('submitted_at = ?');
        values.push(updates.submitted_at);
      }
    }

    if (updates.verified_at !== undefined) {
      if (updates.verified_at === true || updates.verified_at === 'now') {
        updateFields.push('verified_at = CURRENT_TIMESTAMP');
      } else {
        updateFields.push('verified_at = ?');
        values.push(updates.verified_at);
      }
    }

    if (updateFields.length === 0) {
      return this.getProof(claimId);
    }

    values.push(claimId);

    const stmt = this.db.prepare(`
      UPDATE proofs
      SET ${updateFields.join(', ')}
      WHERE claim_id = ?
    `);

    stmt.run(...values);
    return this.getProof(claimId);
  }

  getDatabase() {
    return this.db;
  }

  getPendingClaimsForMinting(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT c.*, i.id as image_id, i.device_address, i.image_hash, i.signature, i.filecoin_cid
      FROM claims c
      JOIN images i ON c.image_id = i.id
      WHERE c.status = 'claimed' 
        AND c.recipient_address IS NOT NULL 
        AND c.token_id IS NOT NULL
        AND (c.edition_tx_hash IS NULL OR c.status != 'completed')
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

const dbService = new DBService();

export default dbService;
