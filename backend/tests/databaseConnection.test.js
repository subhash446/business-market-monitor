/**
 * Database Connection & SSL CA Hardening Tests
 *
 * Verifies:
 * 1. SSL disabled: pool created with no ssl property
 * 2. SSL enabled with valid CA path: CA file read and passed with rejectUnauthorized
 * 3. SSL enabled with rejectUnauthorized=true but missing CA path: throws actionable configuration error
 * 4. SSL enabled with rejectUnauthorized=true but unreadable CA path: throws actionable read error
 * 5. SSL enabled with rejectUnauthorized=false without CA path: passes rejectUnauthorized=false, does not throw
 * 6. SSL enabled with rejectUnauthorized=false with valid CA path: passes ca and rejectUnauthorized=false
 */

const fs = require('fs');
const path = require('path');

describe('Database Connection SSL Configuration', () => {
  let mockCreatePool;

  beforeEach(() => {
    jest.resetModules();
    mockCreatePool = jest.fn().mockReturnValue({
      getConnection: jest.fn(),
    });
    jest.mock('mysql2/promise', () => ({
      createPool: mockCreatePool,
    }));
    jest.mock('../src/utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('1. SSL disabled (default) — pool is created without ssl configuration', () => {
    jest.mock('../src/config/env', () => ({
      db: {
        host: 'localhost',
        port: 3306,
        name: 'business_market_monitor',
        user: 'root',
        password: '',
        sslEnabled: false,
        sslRejectUnauthorized: true,
        sslCaPath: '',
      },
    }));

    require('../src/database/connection');

    expect(mockCreatePool).toHaveBeenCalledTimes(1);
    const poolConfig = mockCreatePool.mock.calls[0][0];
    expect(poolConfig).not.toHaveProperty('ssl');
    expect(poolConfig.host).toBe('localhost');
  });

  test('2. SSL enabled with valid CA path — reads CA certificate and sets rejectUnauthorized=true', () => {
    const fakeCaCert = '-----BEGIN CERTIFICATE-----\nFAKE_CA_DATA\n-----END CERTIFICATE-----';
    jest.spyOn(fs, 'readFileSync').mockReturnValue(fakeCaCert);

    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-aiven.example.com',
        port: 25000,
        name: 'defaultdb',
        user: 'avnadmin',
        password: 'secretpassword',
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCaPath: './certs/ca.pem',
      },
    }));

    require('../src/database/connection');

    expect(mockCreatePool).toHaveBeenCalledTimes(1);
    const poolConfig = mockCreatePool.mock.calls[0][0];
    expect(poolConfig.ssl).toEqual({
      rejectUnauthorized: true,
      ca: fakeCaCert,
    });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('./certs/ca.pem'), 'utf8');
  });

  test('3. SSL enabled with rejectUnauthorized=true but missing CA path — throws actionable error', () => {
    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-aiven.example.com',
        port: 25000,
        name: 'defaultdb',
        user: 'avnadmin',
        password: 'secretpassword',
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCaPath: '',
      },
    }));

    expect(() => {
      require('../src/database/connection');
    }).toThrow(/Database SSL certificate verification is enabled.*DB_SSL_CA_PATH is not configured/);
    expect(mockCreatePool).not.toHaveBeenCalled();
  });

  test('4. SSL enabled with rejectUnauthorized=true but whitespace-only CA path — throws actionable error', () => {
    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-aiven.example.com',
        port: 25000,
        name: 'defaultdb',
        user: 'avnadmin',
        password: 'secretpassword',
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCaPath: '   ',
      },
    }));

    expect(() => {
      require('../src/database/connection');
    }).toThrow(/DB_SSL_CA_PATH is not configured or is empty/);
    expect(mockCreatePool).not.toHaveBeenCalled();
  });

  test('5. SSL enabled with rejectUnauthorized=true but unreadable CA path — throws actionable read error', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory');
      err.code = 'ENOENT';
      throw err;
    });

    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-aiven.example.com',
        port: 25000,
        name: 'defaultdb',
        user: 'avnadmin',
        password: 'secretpassword',
        sslEnabled: true,
        sslRejectUnauthorized: true,
        sslCaPath: './non-existent/ca.pem',
      },
    }));

    expect(() => {
      require('../src/database/connection');
    }).toThrow(/Failed to read SSL CA certificate at "\.\/non-existent\/ca\.pem": ENOENT/);
    expect(mockCreatePool).not.toHaveBeenCalled();
  });

  test('6. SSL enabled with rejectUnauthorized=false without CA path — does not throw and allows disabled TLS verification', () => {
    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-managed.example.com',
        port: 3306,
        name: 'business_market_monitor',
        user: 'user',
        password: 'pwd',
        sslEnabled: true,
        sslRejectUnauthorized: false,
        sslCaPath: '',
      },
    }));

    require('../src/database/connection');

    expect(mockCreatePool).toHaveBeenCalledTimes(1);
    const poolConfig = mockCreatePool.mock.calls[0][0];
    expect(poolConfig.ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  test('7. SSL enabled with rejectUnauthorized=false with valid CA path — passes both CA and rejectUnauthorized=false', () => {
    const fakeCaCert = '-----BEGIN CERTIFICATE-----\nOPTIONAL_CA\n-----END CERTIFICATE-----';
    jest.spyOn(fs, 'readFileSync').mockReturnValue(fakeCaCert);

    jest.mock('../src/config/env', () => ({
      db: {
        host: 'mysql-managed.example.com',
        port: 3306,
        name: 'business_market_monitor',
        user: 'user',
        password: 'pwd',
        sslEnabled: true,
        sslRejectUnauthorized: false,
        sslCaPath: './certs/ca.pem',
      },
    }));

    require('../src/database/connection');

    expect(mockCreatePool).toHaveBeenCalledTimes(1);
    const poolConfig = mockCreatePool.mock.calls[0][0];
    expect(poolConfig.ssl).toEqual({
      rejectUnauthorized: false,
      ca: fakeCaCert,
    });
  });
});
