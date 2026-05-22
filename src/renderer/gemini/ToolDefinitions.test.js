import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateTools, generateSystemInstruction } from './ToolDefinitions.js';

describe('ToolDefinitions', () => {
  describe('generateTools', () => {
    it('should generate basic tools (screenshot and remember) when no capabilities are provided', () => {
      const tools = generateTools({});
      assert.strictEqual(tools.length, 2);
      assert.strictEqual(tools[0].name, 'take_screenshot');
      assert.strictEqual(tools[1].name, 'remember_context');
    });

    it('should generate set_avatar_emotion tool when expressions are provided', () => {
      const modelProfile = { expressions: ['Happy', 'Sad'] };
      const tools = generateTools(modelProfile);
      assert.strictEqual(tools.length, 3);
      assert.strictEqual(tools[0].name, 'set_avatar_emotion');
      assert.deepStrictEqual(tools[0].parameters.properties.emotion.enum, ['Happy', 'Sad']);
    });

    it('should generate play_avatar_motion tool when motion groups are provided', () => {
      const modelProfile = { motionGroups: { 'TapBody': 1, 'FlickHead': 2 } };
      const tools = generateTools(modelProfile);
      assert.strictEqual(tools.length, 3);
      assert.strictEqual(tools[0].name, 'play_avatar_motion');
      assert.deepStrictEqual(tools[0].parameters.properties.group.enum, ['TapBody', 'FlickHead']);
    });

    it('should generate animate_avatar tool when animatable parameters are provided', () => {
      const modelProfile = {
        parameters: [
          { id: 'ParamAngleX', min: -30, max: 30 },
          { id: 'ParamEyeLOpen', min: 0, max: 1 } // Should be filtered out because it includes 'Eye'
        ]
      };
      const tools = generateTools(modelProfile);
      assert.strictEqual(tools.length, 3);
      assert.strictEqual(tools[0].name, 'animate_avatar');
      assert.match(tools[0].description, /ParamAngleX \(-30 to 30\)/);
      assert.doesNotMatch(tools[0].description, /ParamEyeLOpen/);
    });

    it('should generate play_custom_action tool when custom actions are provided', () => {
      const tools = generateTools({}, ['dance', 'jump']);
      assert.strictEqual(tools.length, 3);
      assert.strictEqual(tools[0].name, 'play_custom_action');
      assert.deepStrictEqual(tools[0].parameters.properties.name.enum, ['dance', 'jump']);
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
      assert.deepStrictEqual(toolNames, [
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
      assert.match(instruction, /You are a helpful companion/);
      assert.match(instruction, /Your Avatar/);
      assert.match(instruction, /Behavior/);
      assert.doesNotMatch(instruction, /Available expressions/);
      assert.doesNotMatch(instruction, /Recent Screen Observations/);
    });

    it('should include avatar capabilities', () => {
      const modelProfile = {
        expressions: ['Joy', 'Sorrow'],
        motionGroups: { 'Wave': 1 },
        parameters: [{ id: 'ParamAngleZ' }],
        parameterIds: ['ParamAngleZ']
      };
      const instruction = generateSystemInstruction(modelProfile, personalityPrompt);
      assert.match(instruction, /Available expressions: Joy, Sorrow/);
      assert.match(instruction, /Available motion groups: Wave/);
      assert.match(instruction, /these parameters: ParamAngleZ/);
    });

    it('should include screen context if provided', () => {
      const screenContext = 'User is looking at a cat video.';
      const instruction = generateSystemInstruction({}, personalityPrompt, screenContext);
      assert.match(instruction, /Recent Screen Observations/);
      assert.match(instruction, /User is looking at a cat video\./);
    });

    it('should include memories if provided', () => {
      const memories = ['User likes cats.', 'User is a developer.'];
      const instruction = generateSystemInstruction({}, personalityPrompt, '', memories);
      assert.match(instruction, /Things You Remember About the User/);
      assert.match(instruction, /- User likes cats\./);
      assert.match(instruction, /- User is a developer\./);
    });
  });
});
