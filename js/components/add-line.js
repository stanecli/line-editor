import { createLinePlacement } from '../models.js';

// ============================================================================
// Add line component: create data, add it, then select the returned layer
// ============================================================================

export function createAddLineComponent({
  buttonElement,
  layerService,
  editorService,
  stageService,
  initialPlacementIndex = 0
}) {
  const lifetime = new AbortController();
  let placementIndex = initialPlacementIndex;

  // Dimensions come through StageService; creation/selection use service APIs.
  function addLine() {
    const lineData = createLinePlacement(stageService.getSize(), placementIndex);
    const createdLayer = layerService.addLayer(lineData);
    placementIndex += 1;
    editorService.selectLayer(createdLayer.id);
  }

  buttonElement.addEventListener('click', addLine, {
    signal: lifetime.signal
  });

  function destroy() {
    lifetime.abort();
  }

  return {
    destroy
  };
}
