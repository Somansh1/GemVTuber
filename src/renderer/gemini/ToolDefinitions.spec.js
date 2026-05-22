const { generateTools, generateSystemInstruction } = require('./ToolDefinitions.js');

describe('ToolDefinitions', () => {
  describe('generateTools', () => {
    it('should generate basic tools (screenshot and remember) when no capabilities are provided', () => {
      const tools = generateTools({});
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('take_screenshot');
      expect(tools[1].name).toBe('remember_context');
    });

    it('should generate set_avatar_emotion tool when expressions are provided', () => {
      const modelProfile = { expressions: ['Happy', 'Sad'] };
      const tools = generateTools(modelProfile);
      expect(tools.length).toBe(3);
      expect(tools[0].name).toBe('set_avatar_emotion');
      expect(tools[0].parameters.properties.emotion.enum).toEqual(['Happy', 'Sad']);
    });

    it('should generate play_avatar_motion tool when motion groups are provided', () => {
      const modelProfile = { motionGroups: { 'TapBody': 1, 'FlickHead': 2 } };
      const tools = generateTools(modelProfile);
      expect(tools.length).toBe(3);
      expect(tools[0].name).toBe('play_avatar_motion');
      expect(tools[0].parameters.properties.group.enum).toEqual(['TapBody', 'FlickHead']);
    });

    it('should generate animate_avatar tool when animatable parameters are provided', () => {
      const modelProfile = {
        parameters: [
          { id: 'ParamAngleX', min: -30, max: 30 },
          { id: 'ParamEyeLOpen', min: 0, max: 1 } // Should be filtered out because it includes 'Eye'
        ]
      };
      const tools = generateTools(modelProfile);
      expect(tools.length).toBe(3);
      expect(tools[0].name).toBe('animate_avatar');
      expect(tools[0].description).toMatch(/ParamAngleX \(-30 to 30\)/);
      expect(tools[0].description).not.toMatch(/ParamEyeLOpen/);
    });

    it('should generate play_custom_action tool when custom actions are provided', () => {
      const tools = generateTools({}, ['dance', 'jump']);
      expect(tools.length).toBe(3);
      expect(tools[0].name).toBe('play_custom_action');
      expect(tools[0].parameters.properties.name.enum).toEqual(['dance', 'jump']);
    });

    it('should combine all tools when all capabilities are provided', () => {
      const modelProfile = {
        expressions: ['Angry'],
        motionGroups: { 'Idle': 1 },
        parameters: [{ id: 'ParamAngleY', min: -30, max: 30 }]
      };
      const customActions = ['wave'];
      const tools = generateTools(modelProfile, customActions);

      const toolNames = tools.map(t => t.name);
      expect(toolNames).toEqual([
        'set_avatar_emotion',
        'play_avatar_motion',
        'animate_avatar',
        'play_custom_action',
        'take_screenshot',
        'remember_context'
      ]);
    });
  });

  describe('generateSystemInstruction', () => {
    const personalityPrompt = 'You are a helpful companion.';

    it('should generate a basic instruction', () => {
      const instruction = generateSystemInstruction({}, personalityPrompt);
      expect(instruction).toMatch(/You are a helpful companion/);
      expect(instruction).toMatch(/Your Avatar/);
      expect(instruction).toMatch(/Behavior/);
      expect(instruction).not.toMatch(/Available expressions/);
      expect(instruction).not.toMatch(/Recent Screen Observations/);
    });

    it('should include avatar capabilities', () => {
      const modelProfile = {
        expressions: ['Joy', 'Sorrow'],
        motionGroups: { 'Wave': 1 },
        parameters: [{ id: 'ParamAngleZ' }],
        parameterIds: ['ParamAngleZ']
      };
      const instruction = generateSystemInstruction(modelProfile, personalityPrompt);
      expect(instruction).toMatch(/Available expressions: Joy, Sorrow/);
      expect(instruction).toMatch(/Available motion groups: Wave/);
      expect(instruction).toMatch(/these parameters: ParamAngleZ/);
    });

    it('should include screen context if provided', () => {
      const screenContext = 'User is looking at a cat video.';
      const instruction = generateSystemInstruction({}, personalityPrompt, screenContext);
      expect(instruction).toMatch(/Recent Screen Observations/);
      expect(instruction).toMatch(/User is looking at a cat video\./);
    });

    it('should include memories if provided', () => {
      const memories = ['User likes cats.', 'User is a developer.'];
      const instruction = generateSystemInstruction({}, personalityPrompt, '', memories);
      expect(instruction).toMatch(/Things You Remember About the User/);
      expect(instruction).toMatch(/- User likes cats\./);
      expect(instruction).toMatch(/- User is a developer\./);
    });
  });
});
