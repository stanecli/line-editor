import {
  SETTING_LIMITS,
  clampNumber,
  validateColor,
  validateLayerId,
  validateConfiguration,
  createLayerModel,
  createEditorState,
  createSnapshot
} from './models.js';

// ============================================================================
// Events and services: private state, plain-object interfaces, no view ownership
// ============================================================================

// Each subscription returns an unsubscribe function for component cleanup.
function createEventChannel() {
  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  // Notify a stable set of subscribers synchronously after state is committed.
  function emit(event) {
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  return {
    subscribe,
    emit
  };
}

// Own all layer data. Index zero is the frontmost layer.
export function createLayerService() {
  const changes = createEventChannel();
  const layers = [];
  let nextLayerNumber = 1;

  // Read-only snapshots keep every write on the validated service interface.
  function getLayers() {
    return createSnapshot(layers);
  }

  function getLayer(layerId) {
    const layer = layers.find((candidate) => candidate.id === layerId);

    return layer === undefined ? null : createSnapshot(layer);
  }

  // Removed events include the removed data as well as the resulting list.
  function notifyLayersChanged(kind, layer) {
    changes.emit(createSnapshot({
      type: 'LayersChanged',
      kind,
      layerId: layer.id,
      layer,
      layers
    }));
  }

  // Accept optional explicit identity; generated IDs skip existing identities.
  function addLayer(configuration = {}) {
    validateConfiguration(configuration, ['id', 'name', 'nodes', 'color', 'thickness', 'opacity']);

    let availableNumber = nextLayerNumber;
    let layerId = configuration.id;

    if (layerId === undefined) {
      while (layers.some((layer) => layer.id === `layer-${availableNumber}`)) {
        availableNumber += 1;
      }

      layerId = `layer-${availableNumber}`;
    }

    validateLayerId(layerId);

    if (layers.some((layer) => layer.id === layerId)) {
      throw new Error(`A layer with ID ${layerId} already exists.`);
    }

    const layerName = configuration.name === undefined
      ? `Line ${availableNumber}`
      : configuration.name;
    const layer = createLayerModel(layerId, layerName, {
      nodes: configuration.nodes,
      color: configuration.color,
      thickness: configuration.thickness,
      opacity: configuration.opacity
    });

    nextLayerNumber = availableNumber + 1;
    layers.unshift(layer);
    notifyLayersChanged('added', layer);

    return createSnapshot(layer);
  }

  // Removing the same ID again is a no-op and does not emit another event.
  function removeLayer(layerId) {
    const layerIndex = layers.findIndex((layer) => layer.id === layerId);

    if (layerIndex === -1) {
      return false;
    }

    const [removedLayer] = layers.splice(layerIndex, 1);
    notifyLayersChanged('removed', removedLayer);

    return true;
  }

  // The target index describes the final position, clamped to the current list.
  function moveLayer(layerId, targetIndex) {
    const currentIndex = layers.findIndex((layer) => layer.id === layerId);

    if (currentIndex === -1) {
      return false;
    }

    const finalIndex = Math.trunc(clampNumber(targetIndex, 0, layers.length - 1));

    if (currentIndex === finalIndex) {
      return false;
    }

    const [movedLayer] = layers.splice(currentIndex, 1);
    layers.splice(finalIndex, 0, movedLayer);
    notifyLayersChanged('moved', movedLayer);

    return true;
  }

  // Patch name and/or object.data. Omitted fields survive; nodes replace as a pair.
  // Identity and object type cannot be changed through this operation.
  function updateLayer(layerId, patch) {
    const layerIndex = layers.findIndex((layer) => layer.id === layerId);

    if (layerIndex === -1) {
      return false;
    }

    validateConfiguration(patch, ['name', 'data']);

    const currentLayer = layers[layerIndex];
    const dataPatch = patch.data === undefined ? {} : patch.data;
    validateConfiguration(dataPatch, ['nodes', 'color', 'thickness', 'opacity']);

    const updatedLayer = createLayerModel(
      currentLayer.id,
      patch.name === undefined ? currentLayer.name : patch.name,
      {
        ...currentLayer.object.data,
        ...dataPatch
      }
    );

    if (JSON.stringify(updatedLayer) === JSON.stringify(currentLayer)) {
      return false;
    }

    layers[layerIndex] = updatedLayer;
    notifyLayersChanged('updated', updatedLayer);

    return true;
  }

  return {
    addLayer,
    removeLayer,
    moveLayer,
    updateLayer,
    getLayer,
    getLayers,
    subscribe: changes.subscribe
  };
}

// Own editor settings and selection; layer existence is coordinated at startup.
export function createEditorService() {
  const changes = createEventChannel();
  const state = createEditorState();

  function getState() {
    return createSnapshot(state);
  }

  // A single event covers settings and selection, with the changed field named.
  function setStateValue(settingName, value) {
    if (state[settingName] === value) {
      return false;
    }

    state[settingName] = value;
    changes.emit(createSnapshot({
      type: 'SettingsChanged',
      changedProperty: settingName,
      state
    }));

    return true;
  }

  function setOutlineColor(color) {
    return setStateValue('selectionOutlineColor', validateColor(color));
  }

  function setOutlineThickness(thickness) {
    return setStateValue('outlineThickness', clampNumber(
      thickness,
      SETTING_LIMITS.outlineThickness.min,
      SETTING_LIMITS.outlineThickness.max
    ));
  }

  function setHandleSize(size) {
    return setStateValue('handleSize', clampNumber(
      size,
      SETTING_LIMITS.handleSize.min,
      SETTING_LIMITS.handleSize.max
    ));
  }

  // Selection contains only identity, never a mutable Layer or DOM reference.
  function selectLayer(layerId) {
    return setStateValue('selectedLayerId', validateLayerId(layerId));
  }

  function clearSelection() {
    return setStateValue('selectedLayerId', null);
  }

  return {
    getState,
    setOutlineColor,
    setOutlineThickness,
    setHandleSize,
    selectLayer,
    clearSelection,
    subscribe: changes.subscribe
  };
}

// The measurement service is the only service that reads a DOM dependency.
// Reading on demand keeps dimensions current after resizing without cached state.
export function createStageService(stageElement) {
  function getSize() {
    return {
      width: stageElement.clientWidth,
      height: stageElement.clientHeight
    };
  }

  return {
    getSize
  };
}
