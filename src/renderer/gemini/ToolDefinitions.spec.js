const { generateTools, generateSystemInstruction } = require('./ToolDefinitions.js');

const names = (tools) => tools.map((t) => t.name);

describe('ToolDefinitions', () => {
  describe('generateTools', () => {
    it('always offers screenshot and remember_context', () => {
      expect(names(generateTools({}))).toEqual(['take_screenshot', 'remember_context']);
    });

    it('offers set_avatar_emotion only when the model has expressions', () => {
      const tools = generateTools({ expressions: ['Happy', 'Sad'] });
      expect(names(tools)).toEqual(['set_avatar_emotion', 'take_screenshot', 'remember_context']);
      expect(tools[0].parameters.required).toEqual(['emotion']);
    });

    it('offers play_avatar_motion only when the model has motion groups', () => {
      const tools = generateTools({ motionGroups: { TapBody: 1 } });
      expect(names(tools)).toEqual(['play_avatar_motion', 'take_screenshot', 'remember_context']);
      expect(tools[0].parameters.required).toEqual(['group']);
    });

    it('offers play_custom_action only when custom actions are passed', () => {
      const tools = generateTools({}, ['dance', 'jump']);
      expect(names(tools)[0]).toBe('play_custom_action');
      expect(tools[0].parameters.properties.name.enum).toEqual(['dance', 'jump']);
    });

    it('never offers animate_avatar (AI-composed animation is disabled)', () => {
      const tools = generateTools({
        expressions: ['Angry'],
        motionGroups: { Idle: 1 },
        parameters: [{ id: 'ParamAngleY', min: -30, max: 30 }],
      }, ['wave']);
      expect(names(tools)).toEqual([
        'set_avatar_emotion',
        'play_avatar_motion',
        'play_custom_action',
        'take_screenshot',
        'remember_context',
      ]);
    });
  });

  describe('generateSystemInstruction', () => {
    const personalityPrompt = 'You are a helpful companion.';

    it('generates a basic instruction', () => {
      const instruction = generateSystemInstruction({}, personalityPrompt);
      expect(instruction).toMatch(/You are a helpful companion/);
      expect(instruction).toMatch(/Your Avatar/);
      expect(instruction).toMatch(/Behavior/);
      expect(instruction).not.toMatch(/Available expressions/);
      expect(instruction).not.toMatch(/Recent Screen Observations/);
    });

    it('lists expressions and motion groups', () => {
      const instruction = generateSystemInstruction(
        { expressions: ['Joy', 'Sorrow'], motionGroups: { Wave: 1 } },
        personalityPrompt
      );
      expect(instruction).toMatch(/Available expressions: Joy, Sorrow/);
      expect(instruction).toMatch(/Available motion groups: Wave/);
    });

    it('includes screen context if provided', () => {
      const instruction = generateSystemInstruction({}, personalityPrompt, 'User is looking at a cat video.');
      expect(instruction).toMatch(/Recent Screen Observations/);
      expect(instruction).toMatch(/User is looking at a cat video\./);
    });

    it('includes memories if provided', () => {
      const instruction = generateSystemInstruction({}, personalityPrompt, '', ['User likes cats.', 'User is a developer.']);
      expect(instruction).toMatch(/Things You Remember About the User/);
      expect(instruction).toMatch(/- User likes cats\./);
      expect(instruction).toMatch(/- User is a developer\./);
    });
  });
});
