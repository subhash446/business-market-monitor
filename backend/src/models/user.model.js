/**
 * `users` table shape (Document 4 §5.1). Reference only — this project uses
 * raw parameterized SQL via mysql2, not an ORM (Document 4 §2.5 defers that
 * choice); this file just keeps column names in one place for repositories.
 */
module.exports = {
  TABLE_NAME: 'users',
  COLUMNS: ['id', 'email', 'password_hash', 'full_name', 'email_verified_at', 'created_at', 'updated_at'],
};
