import { PersonalityEngine } from './PersonalityEngine.js';

describe('PersonalityEngine', () => {
  let engine;

  beforeEach(() => {
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
    };
    engine = new PersonalityEngine();
  });

  describe('getActivitySummary', () => {
    it('returns empty string if less than 2 captures', () => {
      expect(engine.getActivitySummary()).toBe('');

      engine.screenCaptures = [{ timestamp: Date.now(), base64: 'mock' }];
      expect(engine.getActivitySummary()).toBe('');
    });

    it('returns empty string if span is exactly 30 minutes', () => {
      const now = Date.now();
      engine.screenCaptures = [
        { timestamp: now - 30 * 60000, base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('');
    });

    it('returns minutes active if span is > 30 and <= 60 minutes', () => {
      const now = Date.now();
      engine.screenCaptures = [
        { timestamp: now - 45 * 60000, base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('User has been active for about 45 minutes.');
    });

    it('returns hours active if span is > 60 minutes', () => {
      const now = Date.now();
      engine.screenCaptures = [
        { timestamp: now - 120 * 60000, base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('User has been active for over 2 hours. Consider checking in on them.');
    });

    it('handles floating point math gracefully (rounding)', () => {
      const now = Date.now();
      // 30 minutes and 29.999 seconds (should round to 30, so empty string)
      engine.screenCaptures = [
        { timestamp: now - (30 * 60000 + 29999), base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('');

      // 30 minutes and 30.001 seconds (should round to 31)
      engine.screenCaptures = [
        { timestamp: now - (30 * 60000 + 30001), base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('User has been active for about 31 minutes.');

      // 1 hour and 29 minutes (89 minutes) -> should be 89 minutes / 60 = 1.48 -> round to 1 hour
      engine.screenCaptures = [
        { timestamp: now - 89 * 60000, base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('User has been active for over 1 hours. Consider checking in on them.');

      // 1 hour and 31 minutes (91 minutes) -> should be 91 minutes / 60 = 1.51 -> round to 2 hours
      engine.screenCaptures = [
        { timestamp: now - 91 * 60000, base64: 'mock' },
        { timestamp: now, base64: 'mock' }
      ];
      expect(engine.getActivitySummary()).toBe('User has been active for over 2 hours. Consider checking in on them.');
    });
  });
});
