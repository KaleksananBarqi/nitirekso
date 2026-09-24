import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { readLogs, setLogFilePath } from './logger';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  },
  shell: {
    openPath: vi.fn()
  }
}));

describe('logger - readLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLogFilePath('/mock/app.log');
  });

  it('should return empty array if log file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const logs = readLogs();

    expect(logs).toEqual([]);
    expect(fs.existsSync).toHaveBeenCalledWith('/mock/app.log');
  });

  it('should read log correctly and parse header', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '[2023-10-25T12:00:00.000Z] [INFO] Hello World\n[2023-10-25T12:01:00.000Z] [WARN] Warning message\n  Details: Some details\n'
    );

    const logs = readLogs();

    expect(logs.length).toBe(2);
    expect(logs[0].level).toBe('WARN');
    expect(logs[0].message).toBe('Warning message');
    expect(logs[0].details).toBe('Details: Some details');
    expect(logs[0].timestamp).toBe('2023-10-25T12:01:00.000Z');

    expect(logs[1].level).toBe('INFO');
    expect(logs[1].message).toBe('Hello World');
    expect(logs[1].details).toBeUndefined();
  });

  it('should limit the number of logs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '[2023-10-25T12:00:00.000Z] [INFO] Log 1\n[2023-10-25T12:01:00.000Z] [INFO] Log 2\n[2023-10-25T12:02:00.000Z] [INFO] Log 3\n'
    );

    const logs = readLogs(2);

    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('Log 3');
    expect(logs[1].message).toBe('Log 2');
  });

  it('should handle invalid lines without breaking', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Invalid log line 1\nInvalid log line 2\n[2023-10-25T12:00:00.000Z] [INFO] Valid log\nInvalid details 1\nInvalid details 2\n'
    );

    const logs = readLogs();

    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('Valid log');
    expect(logs[0].details).toBe('Invalid details 1\nInvalid details 2');
  });

  it('should return empty array if readFileSync throws error', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logs = readLogs();

    expect(logs).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should return empty array if log is completely empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('   \n  \t  \n');

    const logs = readLogs();

    expect(logs).toEqual([]);
  });
});
