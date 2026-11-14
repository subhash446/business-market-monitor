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
    `SELECT b.*, i.name AS industry_name, i.slug AS industry_slug
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
    `SELECT b.*, i.name AS industry_name, i.slug AS industry_slug
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

async function create({ userId, industryId, name, contactEmail, contactPhone, address, newsDigestChannel = 'EMAIL' }) {
  const [result] = await pool.execute(
    `INSERT INTO businesses (user_id, industry_id, name, contact_email, contact_phone, address, news_digest_channel)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, industryId, name, contactEmail || null, contactPhone || null, address || null, newsDigestChannel || 'EMAIL']
  );
  return findById(result.insertId);
}

async function update(id, { name, contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency, newsDigestChannel }) {
  const channel = newsDigestChannel || 'EMAIL';
  await pool.execute(
    `UPDATE businesses
     SET name = ?, contact_email = ?, contact_phone = ?, address = ?,
         news_digest_enabled = ?, news_digest_frequency = ?, news_digest_channel = ?
     WHERE id = ?`,
    [name, contactEmail || null, contactPhone || null, address || null, newsDigestEnabled, newsDigestFrequency, channel, id]
  );
  return findById(id);
}

async function updateLastDigestSentAt(id, timestamp = new Date()) {
  await pool.execute(
    `UPDATE businesses
     SET last_digest_sent_at = ?
     WHERE id = ?`,
    [timestamp, id]
  );
  return findById(id);
}

async function listBusinessesDueForDigest(frequency = null) {
  let query = `
    SELECT b.*, u.email AS user_email, i.name AS industry_name, i.slug AS industry_slug
    FROM businesses b
    JOIN users u ON u.id = b.user_id
    JOIN industries i ON i.id = b.industry_id
    WHERE b.news_digest_enabled = TRUE
  `;
  const params = [];
  if (frequency) {
    query += ` AND b.news_digest_frequency = ?`;
    params.push(frequency);
  }
  query += ` ORDER BY b.id ASC`;
  const [rows] = await pool.execute(query, params);
  return rows;
}

module.exports = {
  findByUserId,
  findById,
  industryExists,
  create,
  update,
  updateLastDigestSentAt,
  listBusinessesDueForDigest,
};
