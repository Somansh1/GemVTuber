import * as PIXI from 'pixi.js';
window.PIXI = PIXI;
import { Live2DModel, Live2DPlugin } from 'untitled-pixi-live2d-engine/cubism';

// Register the PIXI extension
PIXI.extensions.add(Live2DPlugin);

let app, model;
let mouthValues = {
  'ParamMouthOpenY': 0,
  'PARAM_MOUTH_OPEN_Y': 0,
  'ParamMouthForm': 0
};

async function init() {
  app = new PIXI.Application();
  await app.init({
    canvas: document.getElementById('canvas'),
    width: 800,
    height: 600,
    backgroundColor: 0x333333,
  });

  document.getElementById('btnLoad').addEventListener('click', async () => {
    const path = document.getElementById('modelPath').value.trim();
    if (!path) return alert('Please enter a valid model path');
    
    try {
      if (model) {
        app.stage.removeChild(model);
        model.destroy();
      }

      const normalizedPath = path.replace(/\\/g, '/');
      const fileUrl = 'file:///' + normalizedPath.split('/').map(encodeURIComponent).join('/');
      model = await Live2DModel.from(fileUrl);
      app.stage.addChild(model);
      
      model.anchor.set(0.5, 0.5);
      model.position.set(400, 300);
      
      const scaleSlider = document.getElementById('scaleSlider');
      model.scale.set(parseFloat(scaleSlider.value));
      
      scaleSlider.addEventListener('input', (e) => {
        if (model) {
          model.scale.set(parseFloat(e.target.value));
        }
      });

      setupParameterHooks();

    } catch (e) {
      console.error(e);
      alert('Failed to load model. Check the DevTools console.');
    }
  });

  setupSliders();
}

function setupSliders() {
  const sliders = [
    { id: 'slider1', valId: 'val1', param: 'ParamMouthOpenY' },
    { id: 'slider2', valId: 'val2', param: 'PARAM_MOUTH_OPEN_Y' },
    { id: 'slider3', valId: 'val3', param: 'ParamMouthForm' }
  ];

  sliders.forEach(s => {
    const slider = document.getElementById(s.id);
    const valSpan = document.getElementById(s.valId);
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      valSpan.textContent = val.toFixed(2);
      mouthValues[s.param] = val;
    });
  });
}

function setParam(id, value) {
  if (!model || !model.internalModel || !model.internalModel.coreModel) return;
  const core = model.internalModel.coreModel;

  if (typeof core.setParameterValueById === 'function') {
    core.setParameterValueById(id, value);
    return;
  }

  // Cubism 4 array mutation fallback
  if (core.parameters && core.parameters.ids && core.parameters.values) {
    let idx = -1;
    for (let i = 0; i < core.parameters.ids.length; i++) {
      const paramId = core.parameters.ids[i];
      const strId = (typeof paramId === 'string') ? paramId : (paramId.s || String(paramId));
      if (strId === id || strId === id.toUpperCase()) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      core.parameters.values[idx] = value;
    }
  }
}

function applyMouthValues() {
  if (!model) return;
  setParam('ParamMouthOpenY', mouthValues['ParamMouthOpenY']);
  setParam('PARAM_MOUTH_OPEN_Y', mouthValues['PARAM_MOUTH_OPEN_Y']);
  setParam('ParamMouthForm', mouthValues['ParamMouthForm']);
}

function setupParameterHooks() {
  model.internalModel.removeAllListeners('beforeModelUpdate');
  model.internalModel.removeAllListeners('afterModelUpdate');
  if (model.internalModel.motionManager && model.internalModel.motionManager._origUpdate) {
    model.internalModel.motionManager.update = model.internalModel.motionManager._origUpdate;
  }

  const method = document.getElementById('overrideMethod').value;

  if (method === 'none') {
    app.ticker.add(applyMouthValues);
  } 
  else if (method === 'beforeModelUpdate') {
    model.internalModel.on('beforeModelUpdate', applyMouthValues);
  }
  else if (method === 'afterModelUpdate') {
    model.internalModel.on('afterModelUpdate', applyMouthValues);
  }
  else if (method === 'afterModelUpdateWithMesh') {
    model.internalModel.on('afterModelUpdate', () => {
      applyMouthValues();
      if (model.internalModel.coreModel.update) {
        model.internalModel.coreModel.update();
      }
    });
  }
  else if (method === 'monkeyPatch') {
    const motionManager = model.internalModel.motionManager;
    if (motionManager) {
      motionManager._origUpdate = motionManager.update;
      motionManager.update = (m, now) => {
        const res = motionManager._origUpdate.call(motionManager, m, now);
        applyMouthValues();
        return res;
      };
    }
  }

  document.getElementById('overrideMethod').addEventListener('change', setupParameterHooks);
}

init();
