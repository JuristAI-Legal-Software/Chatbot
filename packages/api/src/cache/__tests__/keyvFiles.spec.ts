describe('keyvFiles bootstrap', () => {
  const mockSetMaxListeners = jest.fn().mockReturnThis();
  const KeyvFile = jest.fn().mockImplementation(() => ({
    setMaxListeners: mockSetMaxListeners,
  }));

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('creates empty cache files when they are missing', () => {
    const mkdirSync = jest.fn();
    const readFileSync = jest.fn(() => {
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    });
    const writeFileSync = jest.fn();

    jest.doMock('node:fs', () => ({
      __esModule: true,
      default: {
        mkdirSync,
        readFileSync,
        writeFileSync,
        copyFileSync: jest.fn(),
      },
    }));
    jest.doMock('keyv-file', () => ({ KeyvFile }));

    jest.isolateModules(() => {
      require('../keyvFiles');
    });

    expect(KeyvFile).toHaveBeenCalledTimes(2);
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(writeFileSync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/[\\/]data[\\/]logs\.json$/),
      JSON.stringify({ cache: [], lastExpire: 0 }),
      'utf8',
    );
    expect(writeFileSync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/[\\/]data[\\/]violations\.json$/),
      JSON.stringify({ cache: [], lastExpire: 0 }),
      'utf8',
    );
    expect(mkdirSync).toHaveBeenCalled();
    expect(mockSetMaxListeners).toHaveBeenCalledWith(20);
  });

  test('backs up malformed cache files before resetting them', () => {
    const copyFileSync = jest.fn();
    const writeFileSync = jest.fn();

    jest.doMock('node:fs', () => ({
      __esModule: true,
      default: {
        mkdirSync: jest.fn(),
        readFileSync: jest.fn(() => '{'),
        writeFileSync,
        copyFileSync,
      },
    }));
    jest.doMock('keyv-file', () => ({ KeyvFile }));

    jest.isolateModules(() => {
      require('../keyvFiles');
    });

    expect(copyFileSync).toHaveBeenCalledTimes(2);
    expect(copyFileSync).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/[\\/]data[\\/]logs\.json$/),
      expect.stringMatching(/[\\/]data[\\/]logs\.json\.corrupt-\d+$/),
    );
    expect(copyFileSync).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/[\\/]data[\\/]violations\.json$/),
      expect.stringMatching(/[\\/]data[\\/]violations\.json\.corrupt-\d+$/),
    );
    expect(writeFileSync).toHaveBeenCalledTimes(2);
  });
});
