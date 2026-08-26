/**
 * All queries against `businesses` (Document 4 §5.2), plus one narrow
 * `industryExists` check against `industries` (Document 4 §5.3) needed to
 * enforce Business Profile's own FK — this does NOT implement the
 * Knowledge Base repository (materials, cost drivers, factors, keywords,
 * dependencies remain untouched TODOs).
 *
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 */
const { pool } = require('../database/connection');

async function findByUserId(userId) {
  const [rows] = await pool.execute(
    `SELECT b.*, i.name AS industry_name
     FROM businesses b
     JOIN industries i ON i.id = b.industry_id
     WHERE b.user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT b.*, i.name AS industry_name
     FROM businesses b
     JOIN industries i ON i.id = b.industry_id
     WHERE b.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function industryExists(industryId) {
  const [rows] = await pool.execute('SELECT id FROM industries WHERE id = ? LIMIT 1', [industryId]);
  return rows.length > 0;
}

async function create({ userId, industryId, name, contactEmail, contactPhone, address }) {
  const [result] = await pool.execute(
    `INSERT INTO businesses (user_id, industry_id, name, contact_email, contact_phone, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, industryId, name, contactEmail || null, contactPhone || null, address || null]
  );
  return findById(result.insertId);
}

async function update(id, { name, contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency }) {
  await pool.execute(
    `UPDATE businesses
     SET name = ?, contact_email = ?, contact_phone = ?, address = ?,
         news_digest_enabled = ?, news_digest_frequency = ?
     WHERE id = ?`,
    [name, contactEmail || null, contactPhone || null, address || null, newsDigestEnabled, newsDigestFrequency, id]
  );
  return findById(id);
}

module.exports = { findByUserId, findById, industryExists, create, update };
