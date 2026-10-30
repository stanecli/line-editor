import { createLinePlacement } from './models.js';
import { createLayerService, createEditorService, createStageService } from './services.js';
import { createLayersComponent } from './components/layers.js';
import { createAddLineComponent } from './components/add-line.js';
import { createSettingsComponent } from './components/settings.js';
import { createStageComponent } from './components/stage.js';

// ============================================================================
// Initialization: create services, orchestrate dependencies, and seed the scene
// ============================================================================

function initializeEditor() {
  const stageElement = document.querySelector('#stage');
  const layerService = createLayerService();
  const editorService = createEditorService();
  const stageService = createStageService(stageElement);

  // Register coordination before views so deletion clears selection first.
  const unsubscribeSelectionCleanup = layerService.subscribe(() => {
    const selectedLayerId = editorService.getState().selectedLayerId;

    if (selectedLayerId !== null && layerService.getLayer(selectedLayerId) === null) {
      editorService.clearSelection();
    }
  });

  // Initial placement lives here; components read existing state on startup.
  // The initial line is unselected, matching the original editor behavior.
  const initialLineData = createLinePlacement(stageService.getSize(), 0);
  layerService.addLayer(initialLineData);

  const components = [
    createLayersComponent({
      listElement: document.querySelector('#layers'),
      layerService,
      editorService
    }),
    createSettingsComponent({
      rootElement: document.querySelector('#config'),
      editorService,
      layerService
    }),
    createStageComponent({
      stageElement,
      editorService,
      layerService,
      stageService
    }),
    createAddLineComponent({
      buttonElement: document.querySelector('#add'),
      layerService,
      editorService,
      stageService,
      initialPlacementIndex: 1
    })
  ];

  // A single teardown entry point makes remounting the editor safe.
  function destroy() {
    unsubscribeSelectionCleanup();

    for (const component of components) {
      component.destroy();
    }
  }

  return {
    layerService,
    editorService,
    stageService,
    destroy
  };
}

const editorApplication = initializeEditor();
