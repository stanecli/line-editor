import { SETTING_LIMITS } from '../models.js';

// ============================================================================
// Settings component: synchronize controls with both services
// ============================================================================

export function createSettingsComponent({
  rootElement,
  editorService,
  layerService
}) {
  const lifetime = new AbortController();
  const linePanel = rootElement.querySelector('#lineSettings');
  const globalInputs = {
    selectionOutlineColor: rootElement.querySelector('#selectionColor'),
    outlineThickness: rootElement.querySelector('#outline'),
    handleSize: rootElement.querySelector('#handleSize')
  };
  const lineInputs = {
    thickness: rootElement.querySelector('#width'),
    color: rootElement.querySelector('#color'),
    opacity: rootElement.querySelector('#opacity')
  };
  const globalSetters = {
    selectionOutlineColor: editorService.setOutlineColor,
    outlineThickness: editorService.setOutlineThickness,
    handleSize: editorService.setHandleSize
  };

  // Keep range attributes sourced from the same constraints used by services.
  function configureSlider(inputElement, limits) {
    inputElement.min = limits.min;
    inputElement.max = limits.max;
  }

  configureSlider(globalInputs.outlineThickness, SETTING_LIMITS.outlineThickness);
  configureSlider(globalInputs.handleSize, SETTING_LIMITS.handleSize);
  configureSlider(lineInputs.thickness, SETTING_LIMITS.thickness);
  configureSlider(lineInputs.opacity, SETTING_LIMITS.opacity);

  // Read state on initialization and after either service publishes a change.
  function render() {
    const editorState = editorService.getState();

    for (const [settingName, inputElement] of Object.entries(globalInputs)) {
      inputElement.value = editorState[settingName];
    }

    const selectedLayer = layerService.getLayer(editorState.selectedLayerId);
    linePanel.hidden = selectedLayer === null;

    if (selectedLayer !== null) {
      for (const [settingName, inputElement] of Object.entries(lineInputs)) {
        inputElement.value = selectedLayer.object.data[settingName];
      }
    }

    for (const sliderId of ['width', 'opacity', 'outline', 'handleSize']) {
      const slider = rootElement.querySelector(`#${sliderId}`);
      const output = rootElement.querySelector(`#${sliderId}Value`);
      const suffix = sliderId === 'opacity' ? '%' : '';
      output.value = `${slider.value}${suffix}`;
    }
  }

  // Input handlers request changes; service events are responsible for rendering.
  for (const [settingName, inputElement] of Object.entries(globalInputs)) {
    inputElement.addEventListener('input', () => {
      const value = inputElement.type === 'color'
        ? inputElement.value
        : Number(inputElement.value);
      globalSetters[settingName](value);
    }, {
      signal: lifetime.signal
    });
  }

  for (const [settingName, inputElement] of Object.entries(lineInputs)) {
    inputElement.addEventListener('input', () => {
      const selectedLayerId = editorService.getState().selectedLayerId;

      if (selectedLayerId === null) {
        return;
      }

      const value = inputElement.type === 'color'
        ? inputElement.value
        : Number(inputElement.value);

      layerService.updateLayer(selectedLayerId, {
        data: {
          [settingName]: value
        }
      });
    }, {
      signal: lifetime.signal
    });
  }

  const unsubscribeEditor = editorService.subscribe(render);
  const unsubscribeLayers = layerService.subscribe(render);
  render();

  function destroy() {
    lifetime.abort();
    unsubscribeEditor();
    unsubscribeLayers();
  }

  return {
    destroy
  };
}
