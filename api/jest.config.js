const path = require('path');
const { maxWorkers } = require('../config/jest.workers.cjs');

const resolveFromRoot = (name) => require.resolve(name, { paths: [path.resolve(__dirname, '..')] });
const babelPresetEnv = resolveFromRoot('@babel/preset-env');
const babelPresetTypescript = resolveFromRoot('@babel/preset-typescript');

const esModules = [
  'openid-client',
  'oauth4webapi',
  'jose',
  '@langchain[\\\\/]langgraph',
  '@langchain[\\\\/]langgraph-checkpoint',
  '@langchain[\\\\/]langgraph-sdk',
  '@mistralai[\\\\/]mistralai',
  'uuid',
  'sanitize-html',
  'htmlparser2',
  'domhandler',
  'domelementtype',
  'domutils',
  'dom-serializer',
  'entities',
].join('|');

module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  maxWorkers,
  testTimeout: 30000, // 30 seconds timeout for all tests
  setupFiles: ['./test/jestSetup.js', './test/__mocks__/logger.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [[babelPresetEnv, { targets: { node: 'current' } }], babelPresetTypescript],
      },
    ],
  },
  transformIgnorePatterns: [`[/\\\\]node_modules[/\\\\](?!(${esModules})([/\\\\]|$))`],
};
