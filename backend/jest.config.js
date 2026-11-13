'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/setup/'],
  setupFiles: ['<rootDir>/tests/setup/jest.setup.js'],
  forceExit: true,
};
